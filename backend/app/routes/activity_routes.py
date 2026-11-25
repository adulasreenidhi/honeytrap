"""Paginated activity-event queries."""

import re
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.session import Session as SessionModel
from app.models.user import User
from app.routes import paginate

router = APIRouter(prefix="/api/activity", tags=["Activity"])


def _employee_activity_details(details: dict | None) -> dict:
    """Keep employee activity useful without exposing monitoring internals."""

    hidden = {
        "decoy", "is_decoy", "decoy_type", "resource_name", "risk_points",
        "rule_key", "reason", "_dedup_key", "triggered_rules", "mitre_attack_id",
        "mitre_attack_ids", "client_ip", "user_agent", "_audit_integrity",
    }

    def clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: clean(item)
                for key, item in value.items()
                if key.casefold() not in hidden
            }
        if isinstance(value, list):
            return [clean(item) for item in value]
        if isinstance(value, str):
            return re.sub(r"\s*\(\+\d+(?:\.\d+)?\)", "", value)
        return value

    return clean(details or {})


@router.get(
    "",
    summary="List activity events",
    description="Admins and analysts can filter all events; employees can only view their own events.",
)
def list_activity(
    user_id: int | None = Query(default=None, ge=1, description="Filter by user ID"),
    session_id: int | None = Query(default=None, ge=1, description="Filter by session ID"),
    event_type: Literal["login", "login_failed", "file_access", "search", "sensitive_request", "decoy_trigger", "device_change", "location_change", "verification", "access_decision"] | None = Query(default=None, description="Filter by event type"),
    page: int = Query(default=1, ge=1, le=1_000_000),
    page_size: int = Query(default=20, ge=1, le=100),
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Return one page of filtered activity events."""

    current_user, _ = context
    query = db.query(ActivityEvent)
    if current_user.role not in {"admin", "analyst"}:
        query = query.filter(ActivityEvent.user_id == current_user.id)
        query = query.filter(ActivityEvent.event_type != "decoy_trigger")
        if session_id is not None:
            requested_session = db.get(SessionModel, session_id)
            if requested_session is not None and requested_session.user_id == current_user.id:
                query = query.filter(ActivityEvent.session_id == session_id)
    elif user_id is not None:
        query = query.filter(ActivityEvent.user_id == user_id)
    if session_id is not None and current_user.role in {"admin", "analyst"}:
        query = query.filter(ActivityEvent.session_id == session_id)
    if event_type:
        query = query.filter(ActivityEvent.event_type == event_type)
    items, total = paginate(query.order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc()), page, page_size)
    return {
        "items": [
            {
                "id": item.id,
                "session_id": item.session_id,
                "user_id": item.user_id,
                "resource_id": item.resource_id,
                "event_type": item.event_type,
                "severity": item.severity,
                **({"risk_points": item.risk_points} if current_user.role in {"admin", "analyst"} else {}),
                "details": item.details or {} if current_user.role in {"admin", "analyst"} else _employee_activity_details(item.details),
                "timestamp": item.timestamp,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
