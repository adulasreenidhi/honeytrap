"""Alert, incident, response, and policy administration routes."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models.incident import Alert, Incident, Policy
from app.models.session import Session as SessionModel
from app.models.user import User
from app.routes import paginate
from app.services.incident_service import incident_timeline
from app.services.policy_engine import apply_response_action

router = APIRouter(prefix="/api", tags=["Monitoring administration"])
ADMIN_ANALYST = Depends(require_role("admin", "analyst"))


class AlertUpdateRequest(BaseModel):
    status: Literal["open", "acknowledged", "resolved"] | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None


class IncidentUpdateRequest(BaseModel):
    status: Literal["open", "investigating", "resolved"] | None = None
    analyst_notes: str | None = None


class ResponseActionRequest(BaseModel):
    action: Literal[
        "restrict_session",
        "terminate_session",
        "block_sensitive_resources",
        "require_step_up_verification",
        "suspend_user",
        "mark_device_revoked",
    ] = Field(description="Simulated action only; no external systems are contacted.")
    notes: str | None = None


class PolicyUpdateRequest(BaseModel):
    value: float = Field(description="Policy weight or threshold value")
    enabled: bool | None = None


@router.get(
    "/alerts",
    summary="List alerts",
    description="Admin and analyst access. Supports severity/status filters and bounded pagination.",
    dependencies=[ADMIN_ANALYST],
)
def list_alerts(
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Alert)
    if severity:
        query = query.filter(Alert.severity == severity)
    if status_filter:
        query = query.filter(Alert.status == status_filter)
    items, total = paginate(query.order_by(Alert.created_at.desc(), Alert.id.desc()), page, page_size)
    return {
        "items": [
            {
                "id": item.id,
                "incident_id": item.incident_id,
                "session_id": item.session_id,
                "severity": item.severity,
                "status": item.status,
                "title": item.title,
                "message": item.message,
                "created_at": item.created_at,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch(
    "/alerts/{alert_id}",
    summary="Update alert status or severity",
    description="Admin and analyst access.",
    dependencies=[ADMIN_ANALYST],
)
def update_alert(
    alert_id: int,
    payload: AlertUpdateRequest,
    db: Session = Depends(get_db),
) -> dict:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(alert, key, value)
    db.commit()
    db.refresh(alert)
    return {
        "id": alert.id,
        "incident_id": alert.incident_id,
        "session_id": alert.session_id,
        "severity": alert.severity,
        "status": alert.status,
        "title": alert.title,
        "message": alert.message,
        "created_at": alert.created_at,
    }


@router.get(
    "/incidents",
    summary="List incidents",
    description="Admin and analyst access. Supports severity/status filters and bounded pagination.",
    dependencies=[ADMIN_ANALYST],
)
def list_incidents(
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Incident)
    if severity:
        query = query.filter(Incident.severity == severity)
    if status_filter:
        query = query.filter(Incident.status == status_filter)
    items, total = paginate(query.order_by(Incident.created_at.desc(), Incident.id.desc()), page, page_size)
    return {
        "items": [
            {
                "id": item.id,
                "session_id": item.session_id,
                "user_id": item.user_id,
                "severity": item.severity,
                "status": item.status,
                "title": item.title,
                "summary": item.summary,
                "created_at": item.created_at,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/incidents/{incident_id}",
    summary="Get incident with evidence and timeline",
    description="Admin and analyst access.",
    dependencies=[ADMIN_ANALYST],
)
def get_incident(incident_id: int, db: Session = Depends(get_db)) -> dict:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {
        "id": incident.id,
        "session_id": incident.session_id,
        "user_id": incident.user_id,
        "severity": incident.severity,
        "status": incident.status,
        "title": incident.title,
        "summary": incident.summary,
        "analyst_notes": incident.analyst_notes,
        "created_at": incident.created_at,
        "evidence_snapshot": incident.evidence_snapshot or {},
        "timeline": incident_timeline(db, incident),
    }


@router.patch(
    "/incidents/{incident_id}",
    summary="Update incident status or analyst notes",
    description="Admin and analyst access.",
    dependencies=[ADMIN_ANALYST],
)
def update_incident(
    incident_id: int,
    payload: IncidentUpdateRequest,
    db: Session = Depends(get_db),
) -> dict:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(incident, key, value)
    db.commit()
    db.refresh(incident)
    return {
        "id": incident.id,
        "status": incident.status,
        "analyst_notes": incident.analyst_notes,
    }


@router.post(
    "/incidents/{incident_id}/respond",
    summary="Apply a simulated response action",
    description="Admin and analyst access. Actions only update local demo state; no external systems are contacted.",
    dependencies=[ADMIN_ANALYST],
)
def respond_to_incident(
    incident_id: int,
    payload: ResponseActionRequest,
    context: tuple[User, SessionModel] = Depends(require_role("admin", "analyst")),
    db: Session = Depends(get_db),
) -> dict:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    session = db.get(SessionModel, incident.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Incident session not found")
    actor, _ = context
    action = apply_response_action(
        db,
        session,
        payload.action,
        performed_by=actor.username,
        notes=payload.notes,
        incident=incident,
    )
    db.commit()
    return {
        "id": action.id,
        "incident_id": action.incident_id,
        "action": action.action,
        "performed_by": action.performed_by,
        "notes": action.notes,
        "session_status": session.status,
        "simulated": True,
    }


@router.get(
    "/policies",
    summary="List policy values",
    description="Admin and analyst access.",
    dependencies=[ADMIN_ANALYST],
)
def list_policies(db: Session = Depends(get_db)) -> list[dict]:
    policies = db.query(Policy).order_by(Policy.id).all()
    return [
        {"id": item.id, "name": item.name, "rule_key": item.rule_key, "value": item.value, "enabled": item.enabled}
        for item in policies
    ]


@router.put(
    "/policies/{policy_id}",
    summary="Update a policy weight or threshold",
    description="Admin access only. Changes are read by subsequent evaluations.",
    dependencies=[Depends(require_role("admin"))],
)
def update_policy(
    policy_id: int,
    payload: PolicyUpdateRequest,
    db: Session = Depends(get_db),
) -> dict:
    import math

    policy = db.get(Policy, policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Policy not found")
    if not math.isfinite(payload.value):
        raise HTTPException(status_code=422, detail="Policy value must be finite")
    if policy.rule_key in {"window_minutes", "max_files_per_window", "max_searches_per_window"}:
        if payload.value < 1 or payload.value > 10000:
            raise HTTPException(status_code=422, detail="Window and count policies must be between 1 and 10000")
    elif payload.value < 0 or payload.value > 100:
        raise HTTPException(status_code=422, detail="Weights and thresholds must be between 0 and 100")
    policy.value = payload.value
    if payload.enabled is not None:
        policy.enabled = payload.enabled
    db.commit()
    db.refresh(policy)
    return {
        "id": policy.id,
        "name": policy.name,
        "rule_key": policy.rule_key,
        "value": policy.value,
        "enabled": policy.enabled,
    }
