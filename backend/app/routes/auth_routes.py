"""Authentication routes."""

from collections import defaultdict, deque
from datetime import datetime
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas import LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"], responses={401: {"description": "Unauthorized"}})

_login_failures: dict[str, deque[float]] = defaultdict(deque)


def _check_login_rate_limit(username: str) -> None:
    failures = _login_failures[username]
    now = monotonic()
    while failures and now - failures[0] > 60:
        failures.popleft()
    if len(failures) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login failures. Try again in one minute.",
        )


@router.post("/login", summary="Authenticate a user and start a session")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    """Validate credentials, create an active session, and return a JWT."""

    _check_login_rate_limit(payload.username)
    user = db.query(User).filter(User.username == payload.username).first()
    if (
        user is None
        or user.status != "active"
        or not verify_password(payload.password, user.hashed_password)
    ):
        failures = _login_failures[payload.username]
        failures.append(monotonic())
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials or inactive user")

    _login_failures.pop(payload.username, None)
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
        details={"device_id": payload.device_id, "location": payload.location},
    ))
    db.commit()
    db.refresh(session)

    token = create_access_token({"user_id": user.id, "session_id": session.id})
    return {
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
