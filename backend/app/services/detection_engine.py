"""Continuous behaviour detection rules."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models.activity import ActivityEvent
from app.models.incident import Policy
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.user import Device, User


@dataclass(frozen=True)
class Finding:
    rule_key: str
    risk_points: float
    reason: str
    dedup_key: str = ""


def policy_values(db: Session) -> dict[str, float]:
    """Load enabled policy values keyed by rule_key."""

    rows = db.query(Policy).filter(Policy.enabled.is_(True)).all()
    return {row.rule_key: float(row.value) for row in rows}


def log_event(
    db: Session,
    session: SessionModel,
    user: User,
    resource: Resource | None,
    event_type: str,
    details: dict[str, Any] | None,
    severity: str,
    risk_points: float,
) -> ActivityEvent:
    """Create an activity event and persist it."""

    event = ActivityEvent(
        session_id=session.id,
        user_id=user.id,
        resource_id=resource.id if resource else None,
        event_type=event_type,
        severity=severity,
        risk_points=int(risk_points),
        details=details or {},
        timestamp=datetime.utcnow(),
    )
    db.add(event)
    db.flush()
    return event


def window_counts(db: Session, session_id: int, minutes: int) -> tuple[int, int, int]:
    """Return file, search, and sensitive-request counts in a sliding window."""

    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    events = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.session_id == session_id)
        .filter(ActivityEvent.timestamp >= cutoff)
        .all()
    )
    files = sum(event.event_type == "file_access" for event in events)
    searches = sum(event.event_type == "search" for event in events)
    sensitive = sum(event.event_type == "sensitive_request" for event in events)
    return files, searches, sensitive


def is_decoy_triggered(resource: Resource | None) -> bool:
    """Identify a monitored decoy resource."""

    return bool(resource and resource.is_decoy)


def analyze_behaviour(
    db: Session,
    session: SessionModel,
    user: User,
    resource: Resource | None,
) -> list[Finding]:
    """Apply policy-backed behavioural and device rules without hardcoded thresholds."""

    policies = policy_values(db)
    findings: list[Finding] = []

    device = db.query(Device).filter(Device.device_id == session.device_id).first()
    device_status = device.status if device else "unknown"
    resource_id = resource.id if resource else 0

    if device_status in {"unknown", "unverified", "revoked"}:
        rule_key = "unknown_device" if device_status == "unknown" else f"{device_status}_device"
        risk = float(policies.get("unknown_device", 0))
        if device_status == "revoked":
            risk = float(policies.get("unknown_device", 0))
            reason = "device is revoked"
        elif device_status == "unverified":
            reason = "device is unverified"
        else:
            reason = "device is unknown"
        findings.append(Finding(rule_key, risk, reason, f"device:{device_status}:{session.device_id}"))

    # Location differs from the employee's usual location.
    if user.usual_location and session.location != user.usual_location:
        risk = float(policies.get("unusual_location", 0))
        findings.append(Finding(
            "unusual_location",
            risk,
            f"location {session.location} differs from usual location {user.usual_location}",
            f"location:{session.location}",
        ))

    window_minutes = int(policies.get("window_minutes", 5))
    files, searches, _ = window_counts(db, session.id, window_minutes)
    bucket = int(datetime.utcnow().timestamp() // (window_minutes * 60))
    if files > int(policies.get("max_files_per_window", 8)):
        risk = float(policies.get("abnormal_file_access", 0))
        findings.append(Finding(
            "abnormal_file_access",
            risk,
            f"{files} file accesses exceeded the {int(policies.get('max_files_per_window', 8))}-file window limit",
            f"window:{bucket}:files",
        ))
    if searches > int(policies.get("max_searches_per_window", 5)):
        risk = float(policies.get("suspicious_behaviour", 0))
        findings.append(Finding(
            "suspicious_behaviour",
            risk,
            f"{searches} searches exceeded the {int(policies.get('max_searches_per_window', 5))}-search window limit",
            f"window:{bucket}:searches",
        ))

    if resource:
        if resource.department != user.department and user.role != "admin":
            risk = float(policies.get("suspicious_behaviour", 0))
            findings.append(Finding(
                "unauthorized_resource",
                risk,
                f"resource department {resource.department} differs from user department {user.department}",
                f"resource:{resource_id}:department",
            ))
        if user.role == "employee" and resource.sensitivity in {"high", "critical"}:
            risk = float(policies.get("suspicious_behaviour", 0))
            findings.append(Finding(
                "sensitive_resource_access",
                risk,
                f"{resource.sensitivity} sensitivity resource requested by employee",
                f"resource:{resource_id}:sensitivity",
            ))
        if is_decoy_triggered(resource):
            risk = float(policies.get("decoy_interaction", 50))
            findings.append(Finding(
                "decoy_interaction",
                risk,
                "monitored decoy resource accessed",
                f"resource:{resource_id}:decoy",
            ))

    return findings
