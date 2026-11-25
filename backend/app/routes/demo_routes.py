"""Admin-only simulated demonstration scenarios."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models.activity import ActivityEvent
from app.models.incident import Alert, Incident, Policy, ResponseAction
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import Device, User
from app.services.detection_engine import is_decoy_triggered, log_event
from app.routes.access_routes import _run_pipeline
from app.seed import seed

router = APIRouter(prefix="/api/demo", tags=["Demo simulations"])


@router.post(
    "/run-scenario",
    summary="Run the simulated employee access scenario",
    description="Admin only. Uses local synthetic data to demonstrate monitoring, restrictions, a decoy alert, and an incident.",
)
def run_scenario(
    context: tuple[User, SessionModel] = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict:
    employee = db.query(User).filter(User.username == "liam.finance").first()
    if employee is None:
        raise HTTPException(status_code=409, detail="Seed employee liam.finance is unavailable")
    normal_resources = (
        db.query(Resource)
        .filter(
            Resource.department == employee.department,
            Resource.is_decoy.is_(False),
            Resource.sensitivity.in_(["low", "medium"]),
        )
        .order_by(Resource.id)
        .all()
    )
    sensitive = (
        db.query(Resource)
        .filter(
            Resource.department == employee.department,
            Resource.sensitivity.in_(["high", "critical"]),
            Resource.is_decoy.is_(False),
        )
        .order_by(Resource.id)
        .first()
    )
    decoy = (
        db.query(Resource)
        .filter(
            Resource.department == employee.department,
            Resource.is_decoy.is_(True),
        )
        .order_by(Resource.id)
        .first()
    )
    if not normal_resources or sensitive is None or decoy is None:
        raise HTTPException(status_code=409, detail="Seed scenario resources are unavailable")

    demo_session = SessionModel(
        user_id=employee.id,
        device_id=employee.registered_device_id or "demo-device",
        location=employee.usual_location or "Demo Location",
        trust_score=100,
        status="active",
    )
    db.add(demo_session)
    db.flush()
    log_event(
        db,
        demo_session,
        employee,
        None,
        "login",
        {"scenario": "simulated_demo_login"},
        "low",
        0,
    )
    db.commit()
    steps: list[dict] = [{
        "step": "employee_login",
        "trust_score": demo_session.trust_score,
        "decision": "ALLOW",
        "reasons": ["demo_login (+0): synthetic employee session started"],
    }]

    # Repeat safe finance documents to cross the configured sliding-window threshold.
    for index in range(9):
        resource = normal_resources[index % len(normal_resources)]
        log_event(
            db,
            demo_session,
            employee,
            resource,
            "file_access",
            {"scenario": "simulated_file_access", "resource_name": resource.name},
            "low",
            0,
        )
        db.commit()
        result = _run_pipeline(db, demo_session, employee, resource)
        steps.append({
            "step": f"open_file_{index + 1}",
            "resource": resource.name,
            "trust_score": result["trust_score"],
            "decision": result["decision"],
            "reasons": result["reasons"],
        })

    log_event(
        db,
        demo_session,
        employee,
        sensitive,
        "file_access",
        {"scenario": "simulated_sensitive_request", "resource_name": sensitive.name},
        "high",
        0,
    )
    db.commit()
    sensitive_result = _run_pipeline(db, demo_session, employee, sensitive)
    steps.append({
        "step": "request_sensitive_resource",
        "resource": sensitive.name,
        "trust_score": sensitive_result["trust_score"],
        "decision": sensitive_result["decision"],
        "reasons": sensitive_result["reasons"],
    })

    log_event(
        db,
        demo_session,
        employee,
        decoy,
        "file_access",
        {"scenario": "simulated_decoy_access", "resource_name": decoy.name},
        "critical",
        0,
    )
    decoy_event = log_event(
        db,
        demo_session,
        employee,
        decoy,
        "decoy_trigger",
        {"resource_id": decoy.id, "scenario": "simulated_demo_decoy"},
        "critical",
        50,
    ) if is_decoy_triggered(decoy) else None
    db.commit()
    decoy_result = _run_pipeline(db, demo_session, employee, decoy)
    steps.append({
        "step": "touch_decoy_admin_credential",
        "resource": decoy.name,
        "trust_score": decoy_result["trust_score"],
        "decision": decoy_result["decision"],
        "reasons": decoy_result["reasons"],
    })

    return {
        "simulated": True,
        "session_id": demo_session.id,
        "employee": employee.username,
        "steps": steps,
        "final_status": demo_session.status,
        "alert_and_incident_created": decoy_event is not None,
    }


@router.post(
    "/reset",
    summary="Reset simulated data to the seed state",
    description="Admin only. Deletes local demo events and restores the synthetic seed data.",
)
def reset_demo(
    context: tuple[User, SessionModel] = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict:
    for model in (
        ResponseAction,
        Alert,
        Incident,
        TrustHistory,
        ActivityEvent,
        SessionModel,
        Resource,
        Device,
        Policy,
        User,
    ):
        db.query(model).delete(synchronize_session=False)
    db.commit()
    seed(db)
    return {"reset": True, "simulated": True, "detail": "HoneyGate seed data restored"}
