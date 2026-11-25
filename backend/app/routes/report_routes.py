"""Structured audit, incident, and dashboard reporting."""

import csv
from datetime import datetime, timedelta
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.incident import Alert, Incident, ResponseAction
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import Device
from app.routes import paginate
from app.services.incident_service import incident_timeline

router = APIRouter(prefix="/api", tags=["Reports and dashboards"])
ADMIN_ANALYST = Depends(require_role("admin", "analyst"))


@router.get(
    "/reports/incident/{incident_id}",
    summary="Export one incident report",
    description="Admin and analyst access. Returns structured incident evidence and its ordered timeline.",
    dependencies=[ADMIN_ANALYST],
)
def incident_report(incident_id: int, db: Session = Depends(get_db)) -> dict:
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
        "timeline": incident_timeline(db, incident),
    }


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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
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
        writer.writerow({**row, "details": str(row["details"])})
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
