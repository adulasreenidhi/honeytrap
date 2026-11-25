"""Authentication routes."""

from collections import defaultdict, deque
from datetime import datetime
import logging
import threading
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import DUMMY_PASSWORD_HASH, create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas import LoginRequest
from app.services.detection_engine import analyze_login_attack, policy_values
from app.services.incident_service import create_or_attach_incident
from app.services.policy_engine import Decision
from app.services.trust_engine import recalculate

router = APIRouter(prefix="/api/auth", tags=["auth"], responses={401: {"description": "Unauthorized"}})

_login_failures: dict[str, deque[float]] = defaultdict(deque)
_login_lockouts: dict[str, float] = {}
_login_rate_lock = threading.Lock()
security_logger = logging.getLogger("honeygate.security")


def _check_login_rate_limit(username: str, client_ip: str) -> None:
    now = monotonic()
    with _login_rate_lock:
        for key in (f"user:{username.casefold()}", f"ip:{client_ip}"):
            failures = _login_failures[key]
            while failures and now - failures[0] > settings.LOGIN_FAILURE_WINDOW_SECONDS:
                failures.popleft()
            if _login_lockouts.get(key, 0) > now:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Login temporarily unavailable")
            if len(failures) >= settings.LOGIN_FAILURE_LIMIT:
                _login_lockouts[key] = now + settings.LOGIN_LOCKOUT_SECONDS
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Login temporarily unavailable")


def _record_login_failure(username: str, client_ip: str) -> None:
    now = monotonic()
    with _login_rate_lock:
        for key in (f"user:{username.casefold()}", f"ip:{client_ip}"):
            failures = _login_failures[key]
            while failures and now - failures[0] > settings.LOGIN_FAILURE_WINDOW_SECONDS:
                failures.popleft()
            failures.append(now)
            if len(failures) >= settings.LOGIN_FAILURE_LIMIT:
                _login_lockouts[key] = now + settings.LOGIN_LOCKOUT_SECONDS


@router.post("/login", summary="Authenticate a user and start a session")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    """Validate credentials, create an active session, and return a JWT."""

    client_ip = request.client.host if request.client else "unknown"
    normalized_username = payload.username.casefold()
    try:
        _check_login_rate_limit(normalized_username, client_ip)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            db.add(ActivityEvent(
                session_id=None,
                user_id=None,
                resource_id=None,
                event_type="login_failed",
                severity="high",
                risk_points=0,
                details={
                    "client_ip": client_ip,
                    "username": normalized_username,
                    "reason": "rate_limited",
                },
            ))
            db.commit()
            security_logger.warning("Login temporarily locked (client_ip=%s)", client_ip)
        raise
    user = db.query(User).filter(User.username == payload.username).first()
    password_hash = user.hashed_password if user is not None else DUMMY_PASSWORD_HASH
    password_valid = verify_password(payload.password, password_hash)
    if user is None or user.status != "active" or not password_valid:
        _record_login_failure(normalized_username, client_ip)
        db.add(ActivityEvent(
            session_id=None,
            user_id=user.id if user is not None else None,
            resource_id=None,
            event_type="login_failed",
            severity="medium",
            risk_points=0,
            details={"client_ip": client_ip, "username": normalized_username},
        ))
        db.commit()
        security_logger.warning(
            "Login failed (user_id=%s, client_ip=%s)",
            user.id if user is not None else "unknown",
            client_ip,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    with _login_rate_lock:
        _login_failures.pop(f"user:{normalized_username}", None)
        _login_lockouts.pop(f"user:{normalized_username}", None)
    session = SessionModel(
        user_id=user.id,
        device_id=payload.device_id,
        location=payload.location,
        trust_score=100,
        status="active",
        created_at=datetime.utcnow(),
        last_activity_at=datetime.utcnow(),
    )
    db.add(session)
    db.flush()

    db.add(ActivityEvent(
        session_id=session.id,
        user_id=user.id,
        resource_id=None,
        event_type="login",
        severity="low",
        risk_points=0,
        details={
            "device_id": payload.device_id,
            "location": payload.location,
            "client_ip": client_ip,
            "user_agent": request.headers.get("user-agent", ""),
        },
    ))
    db.flush()

    login_attack = analyze_login_attack(
        db, user, session, normalized_username, client_ip
    )
    if login_attack is not None:
        assessment = recalculate(db, session, [login_attack])
        session.status = "restricted"
        decision = Decision(
            decision="RESTRICT",
            trust_score=assessment.score,
            reasons=[login_attack.reason],
            triggered_rules=[login_attack.rule_key],
            recommended_action="require_step_up_verification",
        )
        evidence_event = (
            db.query(ActivityEvent)
            .filter(
                ActivityEvent.session_id == session.id,
                ActivityEvent.event_type == "sensitive_request",
            )
            .order_by(ActivityEvent.id.desc())
            .first()
        )
        create_or_attach_incident(
            db,
            session,
            user,
            [login_attack],
            decision,
            triggering_event=evidence_event,
        )
        security_logger.warning(
            "Login attack pattern detected (user_id=%s, client_ip=%s, session_id=%s)",
            user.id,
            client_ip,
            session.id,
        )

    db.commit()
    db.refresh(session)

    token = create_access_token({"user_id": user.id, "session_id": session.id})
    response = {
        "access_token": token,
        "token_type": "bearer",
        "session": {
            "id": session.id,
            "user_id": session.user_id,
            "device_id": session.device_id,
            "location": session.location,
            "trust_score": session.trust_score,
            "status": session.status,
        },
    }
    if login_attack is not None:
        response.update({
            "decision": "RESTRICT",
            "trust_score": session.trust_score,
            "triggered_rules": [login_attack.rule_key],
        })
    return response


@router.get("/me", summary="Get the authenticated user and active session")
def me(
    context: tuple[User, SessionModel] = Depends(get_current_user),
) -> dict:
    user, session = context
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "department": user.department,
            "status": user.status,
        },
        "session": {
            "id": session.id,
            "device_id": session.device_id,
            "location": session.location,
            "trust_score": session.trust_score,
            "status": session.status,
        },
    }


@router.post("/logout", summary="End the active session")
def logout(
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _, session = context
    session.status = "ended"
    session.last_activity_at = datetime.utcnow()
    db.commit()
    return {"detail": "Session ended"}
