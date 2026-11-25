"""Deterministic adaptive policy decisions and simulated responses."""

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy.orm import Session as DBSession

from app.models.incident import Incident, ResponseAction
from app.models.resource import Resource
from app.models.session import Session
from app.models.user import Device, User
from app.services.detection_engine import Finding


@dataclass(frozen=True)
class Decision:
    decision: str
    trust_score: int
    reasons: list[str]
    triggered_rules: list[str]
    recommended_action: str
    content: str | None = None


def evaluate(
    session: Session,
    user: User,
    resource: Resource | None,
    findings: Iterable[Finding],
    trust_score: int,
    policies: dict[str, float],
    db: DBSession | None = None,
) -> Decision:
    """Map findings and current account/session state to a decision."""

    finding_list = list(findings)
    triggered = [finding.rule_key for finding in finding_list]
    reasons = [
        f"{finding.rule_key} (+{int(finding.risk_points)}): {finding.reason}"
        for finding in finding_list
    ]

    decoy = any(finding.rule_key == "decoy_interaction" for finding in finding_list)
    revoked = any(finding.rule_key == "revoked_device" for finding in finding_list)
    unverified = any(finding.rule_key == "unverified_device" for finding in finding_list)
    unknown = any(finding.rule_key == "unknown_device" for finding in finding_list)
    sensitive_request = any(finding.rule_key == "sensitive_resource_access" for finding in finding_list)
    unauthorized = any(finding.rule_key == "unauthorized_resource" for finding in finding_list)

    block_sensitive = False
    if db is not None and resource is not None and resource.sensitivity in {"high", "critical"}:
        block_sensitive = (
            db.query(ResponseAction)
            .join(Incident, ResponseAction.incident_id == Incident.id)
            .filter(
                Incident.session_id == session.id,
                ResponseAction.action == "block_sensitive_resources",
            )
            .first()
            is not None
        )

    if user.status == "suspended":
        reasons.append("suspended_user (+0): account is suspended")
        triggered.append("suspended_user")
    if session.status in {"ended", "denied"}:
        rule = "terminate_session" if session.status == "ended" else "session_denied"
        reasons.append(f"{rule} (+0): session is not permitted to access resources")
        triggered.append(rule)
    if block_sensitive:
        reasons.append("block_sensitive_resources (+0): sensitive resources are blocked for this session")
        triggered.append("block_sensitive_resources")

    deny = (
        revoked
        or user.status == "suspended"
        or session.status in {"ended", "denied"}
        or decoy
        or unauthorized
        or block_sensitive
    )
    if deny:
        decision = "DENY"
        recommended = "block_session"
        session.status = "denied"
    else:
        restrict_threshold = float(policies.get("restrict_threshold", 70))
        restrict = (
            trust_score < restrict_threshold
            or unverified
            or unknown
            or sensitive_request
            or (resource is not None and session.status == "restricted"
                and resource.sensitivity in {"high", "critical"})
        )
        if restrict:
            decision = "RESTRICT"
            recommended = "require_step_up_verification"
            session.status = "restricted"
        else:
            decision = "ALLOW"
            recommended = "none"
            session.status = "active"

    if not reasons:
        reasons = ["no_risk_rules_triggered (+0): access matched normal policy"]

    return Decision(
        decision=decision,
        trust_score=max(0, min(100, int(trust_score))),
        reasons=reasons,
        triggered_rules=triggered,
        recommended_action=recommended,
        content=None,
    )


def apply_response_action(
    db: DBSession,
    session: Session,
    action: str,
    performed_by: str = "system",
    notes: str | None = None,
    incident: Incident | None = None,
) -> ResponseAction:
    """Apply a simulated response action and record it; no network operations occur."""

    allowed = {
        "restrict_session",
        "terminate_session",
        "block_sensitive_resources",
        "require_step_up_verification",
        "suspend_user",
        "mark_device_revoked",
    }
    if action not in allowed:
        raise ValueError(f"Unsupported response action: {action}")
    if incident is None:
        incident = (
            db.query(Incident)
            .filter(Incident.session_id == session.id)
            .order_by(Incident.id)
            .first()
        )
    if incident is None:
        raise ValueError("A response action requires an incident")

    user = db.get(User, session.user_id)
    if action == "restrict_session":
        session.status = "restricted"
    elif action == "terminate_session":
        session.status = "ended"
    elif action == "require_step_up_verification":
        session.status = "restricted"
    elif action == "suspend_user" and user is not None:
        user.status = "suspended"
    elif action == "mark_device_revoked":
        device = db.query(Device).filter(Device.device_id == session.device_id).first()
        if device is not None:
            device.status = "revoked"
        else:
            db.add(Device(
                device_id=session.device_id,
                label="Simulated revoked device",
                status="revoked",
            ))

    action_log = ResponseAction(
        incident_id=incident.id,
        action=action,
        performed_by=performed_by,
        notes=notes or "Simulated response action; no external system was contacted.",
    )
    db.add(action_log)
    db.flush()
    return action_log
