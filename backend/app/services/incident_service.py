"""Incident lifecycle, evidence snapshots, and timeline assembly."""

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session as DBSession

from app.models.activity import ActivityEvent
from app.models.incident import Alert, Incident, ResponseAction
from app.models.session import Session, TrustHistory
from app.models.user import User
from app.services.audit_integrity import seal_snapshot
from app.services.detection_engine import Finding
from app.services.policy_engine import Decision

SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def _severity_for_findings(findings: Iterable[Finding]) -> str:
    """Choose the most severe rule category represented by the findings."""

    severities = []
    for finding in findings:
        if finding.rule_key == "decoy_interaction":
            severities.append("critical")
        elif finding.rule_key in {
            "revoked_device",
            "unauthorized_resource",
            "sensitive_resource_access",
            "abnormal_file_access",
            "credential_hunting",
            "privilege_probing",
            "login_attack_pattern",
            "slow_and_low_exfiltration",
        }:
            severities.append("high")
        elif finding.rule_key in {"unknown_device", "unverified_device", "unusual_location", "suspicious_behaviour"}:
            severities.append("medium")
        else:
            severities.append("low")
    return max(severities or ["medium"], key=lambda item: SEVERITY_ORDER[item])


def _event_snapshot(event: ActivityEvent | None) -> dict[str, Any] | None:
    if event is None:
        return None
    return {
        "id": event.id,
        "event_type": event.event_type,
        "user_id": event.user_id,
        "session_id": event.session_id,
        "resource_id": event.resource_id,
        "severity": event.severity,
        "risk_points": event.risk_points,
        "details": event.details or {},
        "timestamp": event.timestamp.isoformat(),
    }


def create_or_attach_incident(
    db: DBSession,
    session: Session,
    user: User,
    findings: list[Finding],
    decision: Decision,
    triggering_event: ActivityEvent | None = None,
) -> tuple[Incident, Alert]:
    """Create one incident per session or attach current evidence to it."""

    severity = _severity_for_findings(findings)
    if decision.decision == "DENY" and SEVERITY_ORDER[severity] < SEVERITY_ORDER["high"]:
        severity = "high"
    incident = (
        db.query(Incident)
        .filter(Incident.session_id == session.id)
        .order_by(Incident.id)
        .first()
    )
    now = datetime.utcnow()
    if incident is None:
        trust_history = (
            db.query(TrustHistory)
            .filter(TrustHistory.session_id == session.id)
            .order_by(TrustHistory.timestamp)
            .all()
        )
        incident = Incident(
            session_id=session.id,
            user_id=user.id,
            severity=severity,
            status="open",
            title="Monitored security indicator",
            summary="A monitored event is an indicator of compromise requiring investigation.",
            evidence_snapshot={
                "session_state": {
                    "session_id": session.id,
                    "user_id": user.id,
                    "device_id": session.device_id,
                    "location": session.location,
                    "trust_score": session.trust_score,
                    "status": session.status,
                    "captured_at": now.isoformat(),
                },
                "trust_history": [
                    {
                        "score": item.score,
                        "delta": item.delta,
                        "reason": item.reason,
                        "timestamp": item.timestamp.isoformat(),
                    }
                    for item in trust_history
                ],
                "triggering_event": _event_snapshot(triggering_event),
                "decision_explanations": [],
                "mitre_attack_ids": [],
            },
        )
        db.add(incident)
        db.flush()
    elif SEVERITY_ORDER[severity] > SEVERITY_ORDER.get(incident.severity, 0):
        incident.severity = severity

    evidence = dict(incident.evidence_snapshot or {})
    evidence["session_state"] = {
        "session_id": session.id,
        "user_id": user.id,
        "device_id": session.device_id,
        "location": session.location,
        "trust_score": session.trust_score,
        "status": session.status,
        "captured_at": now.isoformat(),
    }
    if triggering_event is not None:
        evidence["triggering_event"] = _event_snapshot(triggering_event)
    evidence_findings = list(evidence.get("findings", []))
    finding_keys = {
        (item.get("rule_key"), item.get("dedup_key"))
        for item in evidence_findings
    }
    for finding in findings:
        dedup_key = finding.dedup_key or finding.reason
        key = (finding.rule_key, dedup_key)
        if key not in finding_keys:
            evidence_findings.append({
                "rule_key": finding.rule_key,
                "risk_points": finding.risk_points,
                "reason": finding.reason,
                "dedup_key": dedup_key,
                "mitre_attack_id": finding.mitre_attack_id,
            })
            finding_keys.add(key)
    evidence["findings"] = evidence_findings
    mitre_ids = set(evidence.get("mitre_attack_ids", []))
    mitre_ids.update(finding.mitre_attack_id for finding in findings)
    evidence["mitre_attack_ids"] = sorted(mitre_ids)
    explanations = list(evidence.get("decision_explanations", []))
    explanations.append({
        "decision": decision.decision,
        "trust_score": decision.trust_score,
        "reasons": decision.reasons,
        "triggered_rules": decision.triggered_rules,
        "mitre_attack_ids": sorted({finding.mitre_attack_id for finding in findings}),
        "timestamp": now.isoformat(),
    })
    evidence["decision_explanations"] = explanations
    incident.evidence_snapshot = seal_snapshot(evidence)

    alert = Alert(
        incident_id=incident.id,
        session_id=session.id,
        severity=severity,
        status="open",
        title="Monitored security indicator",
        message="A monitored event is an indicator of compromise requiring investigation.",
        created_at=now,
    )
    db.add(alert)
    db.flush()
    return incident, alert


def incident_timeline(db: DBSession, incident: Incident) -> list[dict[str, Any]]:
    """Assemble an ordered timeline from events, trust, decisions, context, and actions."""

    timeline: list[dict[str, Any]] = []
    events = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.session_id == incident.session_id)
        .order_by(ActivityEvent.timestamp, ActivityEvent.id)
        .all()
    )
    for item in events:
        timeline.append({
            "time": item.timestamp.isoformat(),
            "kind": "activity",
            "event_type": item.event_type,
            "severity": item.severity,
            "resource_id": item.resource_id,
            "details": item.details or {},
        })

    history = (
        db.query(TrustHistory)
        .filter(TrustHistory.session_id == incident.session_id)
        .order_by(TrustHistory.timestamp, TrustHistory.id)
        .all()
    )
    for item in history:
        timeline.append({
            "time": item.timestamp.isoformat(),
            "kind": "trust_change",
            "score": item.score,
            "delta": item.delta,
            "reason": item.reason,
        })

    evidence = incident.evidence_snapshot or {}
    for item in evidence.get("decision_explanations", []):
        timeline.append({
            "time": item["timestamp"],
            "kind": "decision",
            "decision": item["decision"],
            "trust_score": item["trust_score"],
            "reasons": item["reasons"],
            "triggered_rules": item["triggered_rules"],
            "mitre_attack_ids": item.get("mitre_attack_ids", []),
        })

    session = db.get(Session, incident.session_id)
    if session is not None:
        timeline.append({
            "time": session.last_activity_at.isoformat(),
            "kind": "device_context",
            "device_id": session.device_id,
            "location": session.location,
            "session_status": session.status,
        })

    actions = (
        db.query(ResponseAction)
        .filter(ResponseAction.incident_id == incident.id)
        .order_by(ResponseAction.timestamp, ResponseAction.id)
        .all()
    )
    for action in actions:
        timeline.append({
            "time": action.timestamp.isoformat(),
            "kind": "response_action",
            "action": action.action,
            "performed_by": action.performed_by,
            "notes": action.notes,
        })
    return sorted(timeline, key=lambda item: item["time"])
