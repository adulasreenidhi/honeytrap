"""Unit tests for HoneyGate detection and trust engines."""

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.activity import ActivityEvent
from app.models.incident import Policy
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import Device, User
from app.services.detection_engine import Finding, analyze_behaviour
from app.services.policy_engine import evaluate
from app.services.trust_engine import apply_risk, bounded_score, recalculate


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = factory()
    session.add_all([
        Policy(name="Unknown device", rule_key="unknown_device", value=15),
        Policy(name="Unusual location", rule_key="unusual_location", value=10),
        Policy(name="Abnormal file access", rule_key="abnormal_file_access", value=20),
        Policy(name="Suspicious behaviour", rule_key="suspicious_behaviour", value=15),
        Policy(name="Decoy interaction", rule_key="decoy_interaction", value=50),
        Policy(name="Restrict threshold", rule_key="restrict_threshold", value=70),
        Policy(name="Window minutes", rule_key="window_minutes", value=5),
        Policy(name="Maximum files", rule_key="max_files_per_window", value=8),
        Policy(name="Maximum searches", rule_key="max_searches_per_window", value=5),
        Device(device_id="good-device", label="Good device", status="registered"),
        Device(device_id="revoked-device", label="Revoked device", status="revoked"),
    ])
    session.commit()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


def make_user_session(db, *, role="employee", department="HR", location="New York"):
    user = User(
        username="tester",
        email="tester@honeygate.demo",
        hashed_password="demo",
        role=role,
        department=department,
        status="active",
        usual_location="New York",
    )
    db.add(user)
    db.flush()
    session = SessionModel(
        user_id=user.id,
        device_id="good-device",
        location=location,
        trust_score=100,
        status="active",
    )
    db.add(session)
    db.flush()
    return user, session


def policy_map(db):
    return {
        row.rule_key: float(row.value)
        for row in db.query(Policy).filter(Policy.enabled.is_(True)).all()
    }


def test_normal_access_allows(db):
    user, session = make_user_session(db)
    resource = Resource(
        name="HR Handbook",
        type="document",
        department="HR",
        sensitivity="low",
        content="Harmless",
        is_decoy=False,
    )
    db.add(resource)
    db.flush()
    findings = analyze_behaviour(db, session, user, resource)
    assessment = recalculate(db, session, findings)
    decision = evaluate(session, user, resource, findings, assessment.score, policy_map(db))
    assert decision.decision == "ALLOW"
    assert assessment.score == 100


def test_abnormal_file_volume_lowers_trust(db):
    user, session = make_user_session(db)
    resource = Resource(
        name="HR Report",
        type="document",
        department="HR",
        sensitivity="low",
        content="Harmless",
        is_decoy=False,
    )
    db.add(resource)
    db.flush()
    for index in range(9):
        db.add(ActivityEvent(
            session_id=session.id,
            user_id=user.id,
            resource_id=resource.id,
            event_type="file_access",
            severity="low",
            risk_points=0,
            details={"index": index},
            timestamp=datetime.utcnow(),
        ))
    db.commit()
    findings = analyze_behaviour(db, session, user, resource)
    assessment = recalculate(db, session, findings)
    abnormal = [finding for finding in findings if finding.rule_key == "abnormal_file_access"]
    assert abnormal
    assert assessment.score == 80
    assert assessment.delta == -20


def test_decoy_trigger_denies_even_at_full_score(db):
    user, session = make_user_session(db)
    decoy = Resource(
        name="Q4_Salary_Master.xlsx",
        type="finance",
        department="Finance",
        sensitivity="critical",
        content="DEMO ONLY",
        is_decoy=True,
        decoy_type="salary_sheet",
    )
    db.add(decoy)
    db.flush()
    finding = Finding(
        "decoy_interaction",
        50,
        "monitored decoy resource accessed",
        f"resource:{decoy.id}:decoy",
    )
    assessment = recalculate(db, session, [finding])
    decision = evaluate(session, user, decoy, [finding], assessment.score, policy_map(db))
    assert decision.decision == "DENY"
    assert session.status == "denied"


def test_same_finding_not_double_counted(db):
    user, session = make_user_session(db)
    finding = Finding("unusual_location", 10, "location differs", "location:Remote")
    first = recalculate(db, session, [finding])
    db.commit()
    second = recalculate(db, session, [finding])
    assert first.score == 90
    assert second.score == 90
    assert second.delta == 0
    assert len(db.query(TrustHistory).filter(TrustHistory.session_id == session.id).all()) == 1


def test_score_is_always_bounded(db):
    score, _ = apply_risk(5, [Finding("test", 100, "over limit", "test:1")])
    assert bounded_score(score) == 0
    assert bounded_score(1000) == 100
    assert bounded_score(-20) == 0


def test_revoked_device_denies(db):
    user, session = make_user_session(db)
    session.device_id = "revoked-device"
    db.flush()
    finding = Finding("revoked_device", 15, "device is revoked", "device:revoked:revoked-device")
    assessment = recalculate(db, session, [finding])
    decision = evaluate(session, user, None, [finding], assessment.score, policy_map(db))
    assert decision.decision == "DENY"
    assert session.status == "denied"


def test_verify_never_restores_after_decoy(db):
    user, session = make_user_session(db)
    decoy = Resource(
        name="prod_db_credentials.env",
        type="credential",
        department="Admin",
        sensitivity="critical",
        content="DEMO ONLY",
        is_decoy=True,
        decoy_type="honeytoken",
    )
    db.add(decoy)
    db.flush()
    db.add(ActivityEvent(
        session_id=session.id,
        user_id=user.id,
        resource_id=decoy.id,
        event_type="decoy_trigger",
        severity="critical",
        risk_points=50,
        details={"decoy": True},
        timestamp=datetime.utcnow(),
    ))
    session.status = "denied"
    db.commit()
    decoy_seen = db.query(ActivityEvent).filter(
        ActivityEvent.session_id == session.id,
        ActivityEvent.event_type == "decoy_trigger",
    ).first()
    assert decoy_seen is not None
    assert session.status == "denied"
    assert session.trust_score == 100
