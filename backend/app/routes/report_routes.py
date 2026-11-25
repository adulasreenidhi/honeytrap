"""Structured audit, incident, and dashboard reporting."""

import csv
from datetime import datetime, timedelta
from io import StringIO
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.incident import Alert, Incident, Policy, ResponseAction
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import Device
from app.routes import paginate
from app.services.audit_integrity import verify_chain, verify_snapshot
from app.services.detection_engine import DETECTION_RULE_DESCRIPTIONS, MITRE_BY_RULE
from app.services.incident_service import incident_timeline

router = APIRouter(prefix="/api", tags=["Reports and dashboards"])
ADMIN_ANALYST = Depends(require_role("admin", "analyst"))
SIMULATION_RULE_COVERAGE = {
    "unknown_device": ["stolen_credentials_unknown_device"],
    "unverified_device": ["test_unverified_device_rule_is_covered"],
    "revoked_device": ["test_revoked_device_rule_is_covered"],
    "unusual_location": ["stolen_credentials_unknown_device"],
    "abnormal_file_access": ["insider_data_hoarding"],
    "suspicious_behaviour": ["test_search_volume_rule_is_covered"],
    "unauthorized_resource": ["privilege_escalation_probe"],
    "sensitive_resource_access": ["insider_data_hoarding", "slow_and_low"],
    "decoy_interaction": ["decoy_touch", "enumeration_scan"],
    "velocity_burst": ["insider_data_hoarding"],
    "resource_enumeration": ["insider_data_hoarding", "enumeration_scan"],
    "credential_hunting": ["test_credential_hunting_decoy_bonus_is_deduplicated"],
    "privilege_probing": ["privilege_escalation_probe"],
    "impossible_travel": ["test_impossible_travel_uses_demo_location_lookup"],
    "off_hours_access": ["test_off_hours_access_is_policy_configurable"],
    "token_context_change": ["token_replay"],
    "login_attack_pattern": ["credential_stuffing"],
    "slow_and_low_exfiltration": ["slow_and_low"],
}
POLICY_KEY_BY_RULE = {
    "unverified_device": "unknown_device",
    "revoked_device": "unknown_device",
    "unauthorized_resource": "suspicious_behaviour",
    "sensitive_resource_access": "suspicious_behaviour",
}


def _safe_csv_cell(value: Any) -> Any:
    """Neutralize spreadsheet formula prefixes in every exported string cell."""

    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


@router.get(
    "/reports/incident/{incident_id}",
    summary="Export one incident report",
    description="Admin and analyst access. Returns structured incident evidence and its ordered timeline.",
    dependencies=[ADMIN_ANALYST],
)
def incident_report(incident_id: int = Path(ge=1), db: Session = Depends(get_db)) -> dict:
    incident = db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {
        "report_type": "incident",
        "generated_at": datetime.utcnow().isoformat(),
        "incident": {
            "id": incident.id,
            "session_id": incident.session_id,
            "user_id": incident.user_id,
            "severity": incident.severity,
            "status": incident.status,
            "title": incident.title,
            "summary": incident.summary,
            "analyst_notes": incident.analyst_notes,
            "created_at": incident.created_at.isoformat(),
        },
        "evidence_snapshot": incident.evidence_snapshot or {},
        "evidence_integrity": verify_snapshot(incident.evidence_snapshot),
        "audit_integrity": verify_chain(db),
        "timeline": incident_timeline(db, incident),
    }


@router.get(
    "/reports/audit/integrity",
    summary="Verify the activity-event hash chain",
    description="Admin and analyst access. Reports the first broken event or missing link.",
    dependencies=[ADMIN_ANALYST],
)
def audit_integrity_report(db: Session = Depends(get_db)) -> dict[str, Any]:
    return verify_chain(db)


@router.get(
    "/reports/detection-coverage",
    summary="List detection rules and simulation coverage",
    description="Admin and analyst access. Reports each rule's mapping, policy, and test coverage.",
    dependencies=[ADMIN_ANALYST],
)
def detection_coverage_report(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    policy_rows = {
        row.rule_key: row
        for row in db.query(Policy).all()
    }
    results = []
    for rule_key in sorted(MITRE_BY_RULE):
        policy_key = POLICY_KEY_BY_RULE.get(rule_key, rule_key)
        policy = policy_rows.get(policy_key)
        mitre_attack_id = MITRE_BY_RULE[rule_key]
        _, _, technique_name = mitre_attack_id.partition(" ")
        scenarios = SIMULATION_RULE_COVERAGE.get(rule_key, [])
        results.append({
            "rule_key": rule_key,
            "description": DETECTION_RULE_DESCRIPTIONS[rule_key],
            "mitre_attack_id": mitre_attack_id,
            "technique_name": technique_name,
            "current_weight": float(policy.value) if policy is not None else None,
            "enabled": bool(policy.enabled) if policy is not None else False,
            "simulation_covered": bool(scenarios),
            "simulation_scenarios": scenarios,
        })
    return results


@router.get(
    "/reports/audit",
    summary="Export audit events",
    description="Admin and analyst access. Choose JSON or CSV and optionally bound the timestamp range.",
    dependencies=[ADMIN_ANALYST],
)
def audit_report(
    from_: datetime | None = Query(default=None, alias="from", description="Inclusive ISO timestamp"),
    to_: datetime | None = Query(default=None, alias="to", description="Inclusive ISO timestamp"),
    export_format: Literal["json", "csv"] = Query(default="json", alias="format"),
    page: int = Query(default=1, ge=1, le=1_000_000),
    page_size: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    if from_ is not None and to_ is not None:
        if (from_.tzinfo is None) != (to_.tzinfo is None):
            raise HTTPException(status_code=422, detail="'from' and 'to' must use compatible timezone formats")
        if from_ > to_:
            raise HTTPException(status_code=422, detail="'from' must be earlier than or equal to 'to'")
    query = db.query(ActivityEvent)
    if from_ is not None:
        query = query.filter(ActivityEvent.timestamp >= from_)
    if to_ is not None:
        query = query.filter(ActivityEvent.timestamp <= to_)
    events, total = paginate(query.order_by(ActivityEvent.timestamp, ActivityEvent.id), page, page_size)
    rows = [
        {
            "id": event.id,
            "session_id": event.session_id,
            "user_id": event.user_id,
            "resource_id": event.resource_id,
            "event_type": event.event_type,
            "severity": event.severity,
            "risk_points": event.risk_points,
            "details": event.details or {},
            "timestamp": event.timestamp.isoformat(),
        }
        for event in events
    ]
    if export_format == "json":
        return {"items": rows, "total": total, "page": page, "page_size": page_size}

    output = StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "session_id", "user_id", "resource_id", "event_type", "severity", "risk_points", "details", "timestamp"],
    )
    writer.writeheader()
    for row in rows:
        csv_row = {**row, "details": str(row["details"])}
        writer.writerow({key: _safe_csv_cell(value) for key, value in csv_row.items()})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="honeygate-audit.csv"'},
    )


@router.get(
    "/dashboard/summary",
    summary="Get dashboard summary",
    description="Admin and analyst access. Returns simulated platform counts and average trust.",
    dependencies=[ADMIN_ANALYST],
)
def dashboard_summary(db: Session = Depends(get_db)) -> dict:
    severity_counts = {
        severity: db.query(Incident).filter(Incident.severity == severity).count()
        for severity in ("low", "medium", "high", "critical")
    }
    average_trust = db.query(func.avg(SessionModel.trust_score)).scalar() or 0
    return {
        "active_sessions": db.query(SessionModel).filter(SessionModel.status == "active").count(),
        "monitored_devices": db.query(Device).count(),
        "decoy_count": db.query(Resource).filter(Resource.is_decoy.is_(True)).count(),
        "open_alerts": db.query(Alert).filter(Alert.status == "open").count(),
        "incidents_by_severity": severity_counts,
        "average_trust": round(float(average_trust), 2),
    }


@router.get(
    "/dashboard/trust-trends",
    summary="Get trust trends",
    description="Admin and analyst access. Returns hourly average session trust for the last 24 hours.",
    dependencies=[ADMIN_ANALYST],
)
def trust_trends(db: Session = Depends(get_db)) -> list[dict[str, str | float]]:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    bucket = func.strftime("%Y-%m-%dT%H:00:00", TrustHistory.timestamp)
    rows = (
        db.query(bucket.label("time"), func.avg(TrustHistory.score).label("value"))
        .filter(TrustHistory.timestamp >= cutoff)
        .group_by(bucket)
        .order_by(bucket)
        .all()
    )
    return [{"time": row.time, "value": round(float(row.value), 2)} for row in rows if row.time]


@router.get(
    "/dashboard/events-over-time",
    summary="Get event volume over time",
    description="Admin and analyst access. Returns hourly event counts for the last 24 hours.",
    dependencies=[ADMIN_ANALYST],
)
def events_over_time(db: Session = Depends(get_db)) -> list[dict[str, str | int]]:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    bucket = func.strftime("%Y-%m-%dT%H:00:00", ActivityEvent.timestamp)
    rows = (
        db.query(bucket.label("time"), func.count(ActivityEvent.id).label("value"))
        .filter(ActivityEvent.timestamp >= cutoff)
        .group_by(bucket)
        .order_by(bucket)
        .all()
    )
    return [{"time": row.time, "value": int(row.value)} for row in rows if row.time]
