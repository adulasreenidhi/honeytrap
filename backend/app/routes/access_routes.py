"""Continuous access monitoring and session-management routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_role
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import Device, User
from app.services.detection_engine import analyze_behaviour, is_decoy_triggered, log_event, policy_values
from app.services.incident_service import create_or_attach_incident
from app.services.policy_engine import apply_response_action, evaluate
from app.services.trust_engine import recalculate

router = APIRouter(prefix="/api", tags=["Access"])


class VerifyRequest(BaseModel):
    otp: str


class DeviceChangeRequest(BaseModel):
    session_id: int
    device_id: str


class LocationChangeRequest(BaseModel):
    session_id: int
    location: str


def _decision_body(decision, resource: Resource | None = None) -> dict:
    body = {
        "decision": decision.decision,
        "trust_score": decision.trust_score,
        "reasons": decision.reasons,
        "triggered_rules": decision.triggered_rules,
        "recommended_action": decision.recommended_action,
    }
    if decision.decision == "ALLOW" and resource is not None:
        body["content"] = resource.content
    else:
        body["content"] = None
    return body


def _run_pipeline(
    db: Session,
    session: SessionModel,
    user: User,
    resource: Resource | None,
) -> dict:
    """Run detection, deduplicated trust scoring, and policy evaluation."""

    findings = analyze_behaviour(db, session, user, resource)
    assessment = recalculate(db, session, findings)
    policies = policy_values(db)
    decision = evaluate(session, user, resource, findings, assessment.score, policies, db=db)
    decoy_triggered = any(finding.rule_key == "decoy_interaction" for finding in findings)
    decoy_event = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "decoy_trigger",
        )
        .order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc())
        .first()
    )
    triggering_event = (
        decoy_event
        if decoy_triggered
        else db.query(ActivityEvent)
        .filter(ActivityEvent.session_id == session.id)
        .order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc())
        .first()
    )
    if decoy_triggered or decision.decision == "DENY":
        incident, _ = create_or_attach_incident(
            db,
            session,
            user,
            findings,
            decision,
            triggering_event=triggering_event,
        )
        if decoy_triggered:
            apply_response_action(
                db,
                session,
                "restrict_session",
                performed_by="system",
                notes="Automatically restricted after simulated decoy interaction.",
                incident=incident,
            )
            apply_response_action(
                db,
                session,
                "block_sensitive_resources",
                performed_by="system",
                notes="Sensitive resources are blocked after simulated decoy interaction.",
                incident=incident,
            )
        elif decision.decision == "DENY":
            apply_response_action(
                db,
                session,
                "restrict_session",
                performed_by="system",
                notes="Automatically restricted after a simulated deny decision.",
                incident=incident,
            )
        if decision.decision == "DENY":
            session.status = "denied"
    session.last_activity_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    decision_dict = _decision_body(decision, resource)
    decision_dict["trust_assessment"] = {
        "score": assessment.score,
        "previous_score": assessment.previous_score,
        "delta": assessment.delta,
        "contributing_factors": assessment.contributing_factors,
    }
    return decision_dict


@router.post("/access/resource/{resource_id}", summary="Monitored resource access", response_model=None)
def access_resource(
    resource_id: int,
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse | dict:
    user, session = context
    resource = db.get(Resource, resource_id)
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")

    log_event(
        db,
        session,
        user,
        resource,
        "file_access",
        {"operation": "resource_access", "resource_name": resource.name},
        "medium" if resource.sensitivity in {"high", "critical"} else "low",
        0,
    )
    if is_decoy_triggered(resource):
        log_event(
            db,
            session,
            user,
            resource,
            "decoy_trigger",
            {"resource_id": resource.id, "decoy": True},
            "critical",
            int(policy_values(db).get("decoy_interaction", 50)),
        )
    db.commit()

    body = _run_pipeline(db, session, user, resource)
    if body["decision"] == "DENY":
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content=body)
    return body


@router.post("/access/search", summary="Monitored search")
def access_search(
    q: str,
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user, session = context
    log_event(
        db,
        session,
        user,
        None,
        "search",
        {"query": q},
        "low",
        0,
    )
    db.commit()
    return _run_pipeline(db, session, user, None)


@router.post("/access/verify", summary="Mock step-up verification")
def verify_access(
    payload: VerifyRequest,
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user, session = context
    if not payload.otp.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="OTP is required")

    # A denied session or a session known to have triggered a decoy can never recover.
    decoy_seen = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "decoy_trigger",
        )
        .first()
        is not None
    )
    if session.status == "denied" or decoy_seen:
        return {
            "verified": False,
            "decision": "DENY",
            "trust_score": session.trust_score,
            "reasons": ["decoy_interaction (+50): verification is prohibited after a decoy trigger"]
            if decoy_seen else ["session_denied (+0): denied sessions cannot be restored"],
            "triggered_rules": ["decoy_interaction"] if decoy_seen else ["session_denied"],
            "recommended_action": "block_session",
        }

    positive = (
        db.query(TrustHistory)
        .filter(
            TrustHistory.session_id == session.id,
            TrustHistory.reason == "step_up_verification",
            TrustHistory.delta > 0,
        )
        .all()
    )
    restored = sum(int(item.delta) for item in positive)
    remaining = max(0, 20 - restored)
    increase = min(remaining, 20)
    previous = session.trust_score
    session.trust_score = max(0, min(100, previous + increase))
    if increase:
        db.add(TrustHistory(
            session_id=session.id,
            score=float(session.trust_score),
            delta=float(increase),
            reason="step_up_verification",
            timestamp=datetime.utcnow(),
        ))
    threshold = policy_values(db).get("restrict_threshold", 70)
    if session.trust_score >= threshold:
        session.status = "active"
    else:
        session.status = "restricted"
    session.last_activity_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return {
        "verified": True,
        "decision": "ALLOW" if session.status == "active" else "RESTRICT",
        "trust_score": session.trust_score,
        "reasons": [f"step_up_verification (+{increase}: restored trust)"],
        "triggered_rules": ["step_up_verification"],
        "recommended_action": "none" if session.status == "active" else "require_step_up_verification",
    }


@router.get("/sessions/{session_id}/trust", summary="Get session trust and history")
def session_trust(
    session_id: int,
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user, current = context
    session = db.get(SessionModel, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if user.role not in {"admin", "analyst"} and session.id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden session")
    history = db.query(TrustHistory).filter(TrustHistory.session_id == session_id).order_by(TrustHistory.timestamp).all()
    return {
        "current_assessment": {
            "score": session.trust_score,
            "status": session.status,
            "previous_score": session.trust_score,
            "delta": 0,
            "contributing_factors": [],
        },
        "history": [
            {
                "id": row.id,
                "session_id": row.session_id,
                "score": row.score,
                "delta": row.delta,
                "reason": row.reason,
                "timestamp": row.timestamp,
            }
            for row in history
        ],
    }


@router.get("/sessions/active", summary="List active sessions")
def active_sessions(
    context: tuple[User, SessionModel] = Depends(require_role("admin", "analyst")),
    db: Session = Depends(get_db),
) -> list[dict]:
    sessions = db.query(SessionModel).filter(SessionModel.status.in_(["active", "restricted"])).order_by(SessionModel.id).all()
    return [
        {
            "id": session.id,
            "user_id": session.user_id,
            "device_id": session.device_id,
            "location": session.location,
            "trust_score": session.trust_score,
            "status": session.status,
            "last_activity_at": session.last_activity_at,
        }
        for session in sessions
    ]


@router.post("/simulate/device-change", summary="Simulate a device change")
def simulate_device_change(
    payload: DeviceChangeRequest,
    context: tuple[User, SessionModel] = Depends(require_role("admin", "analyst")),
    db: Session = Depends(get_db),
) -> dict:
    _, actor_session = context
    session = db.get(SessionModel, payload.session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session user not found")
    session.device_id = payload.device_id
    log_event(db, session, user, None, "device_change", {"device_id": payload.device_id}, "high", 0)
    db.commit()
    return _run_pipeline(db, session, user, None)


@router.post("/simulate/location-change", summary="Simulate a location change")
def simulate_location_change(
    payload: LocationChangeRequest,
    context: tuple[User, SessionModel] = Depends(require_role("admin", "analyst")),
    db: Session = Depends(get_db),
) -> dict:
    session = db.get(SessionModel, payload.session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session user not found")
    session.location = payload.location
    log_event(db, session, user, None, "location_change", {"location": payload.location}, "medium", 0)
    db.commit()
    return _run_pipeline(db, session, user, None)
