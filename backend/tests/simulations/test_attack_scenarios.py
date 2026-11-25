"""Regression tests for local-only simulated attacks and benign activity."""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import func

from app.models.activity import ActivityEvent
from app.models.incident import Alert, Incident
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import User
from app.seed import DEMO_PASSWORD
from app.services.audit_integrity import verify_chain
from app.services.detection_engine import Finding, analyze_behaviour
from app.services.trust_engine import recalculate

from tests.simulations import scenarios


pytestmark = pytest.mark.simulation


def _assert_bounded_and_no_duplicate_incidents(steps, factory) -> None:
    for step in steps:
        score = step["trust_score"]
        if score is not None:
            assert 0 <= score <= 100
    with factory() as db:
        duplicate_incidents = (
            db.query(Incident.session_id)
            .group_by(Incident.session_id)
            .having(func.count(Incident.id) > 1)
            .all()
        )
        duplicate_alerts = (
            db.query(Alert.session_id)
            .group_by(Alert.session_id)
            .having(func.count(Alert.id) > 1)
            .all()
        )
    assert duplicate_incidents == []
    assert duplicate_alerts == []


def _last_access_step(steps):
    return next(
        step for step in reversed(steps)
        if step["endpoint"].startswith("/api/access/resource/")
    )


def _session_for(factory, username: str) -> SessionModel:
    with factory() as db:
        user = db.query(User).filter(User.username == username).one()
        return (
            db.query(SessionModel)
            .filter(SessionModel.user_id == user.id)
            .order_by(SessionModel.id.desc())
            .first()
        )


def _assert_employee_resource_response_is_redacted(client, token: str) -> None:
    response = client.get(
        "/api/resources",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert all("is_decoy" not in item and "decoy_type" not in item for item in body)
    labels = {
        "password_backup",
        "salary_sheet",
        "honeytoken",
        "decoy_document",
        "decoy_database_record",
    }
    assert not labels.intersection(
        str(value).casefold()
        for item in body
        for value in item.values()
        if isinstance(value, str)
    )


def test_stolen_credentials_unknown_device(simulation):
    client, factory, clock = simulation
    steps = scenarios.stolen_credentials_unknown_device(client, factory, clock)
    final = steps[-1]
    assert final["decision"] == "RESTRICT"
    assert set(final["triggered_rules"]) == {
        "unknown_device",
        "unusual_location",
        "sensitive_resource_access",
    }
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_insider_data_hoarding(simulation):
    client, factory, clock = simulation
    steps = scenarios.insider_data_hoarding(client, factory, clock)
    final = steps[-1]
    assert final["decision"] == "RESTRICT"
    assert set(final["triggered_rules"]) == {
        "velocity_burst",
        "resource_enumeration",
        "abnormal_file_access",
        "sensitive_resource_access",
    }
    assert final["trust_score"] < steps[0]["trust_score"]
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_decoy_touch_denies_once_and_cannot_restore(simulation):
    client, factory, clock = simulation
    steps = scenarios.decoy_touch(client, factory, clock)
    assert steps[1]["decision"] == "ALLOW"
    assert steps[2]["decision"] == "DENY"
    assert steps[2]["trust_score"] == 35
    assert set(steps[2]["triggered_rules"]) == {
        "decoy_interaction",
        "sensitive_resource_access",
    }
    assert steps[-1]["decision"] == "DENY"
    session = _session_for(factory, "noah.admin")
    with factory() as db:
        findings = (
            db.query(ActivityEvent)
            .filter(
                ActivityEvent.session_id == session.id,
                ActivityEvent.details["rule_key"].as_string() == "decoy_interaction",
            )
            .all()
        )
        incident = db.query(Incident).filter(Incident.session_id == session.id).one()
        assert db.query(Alert).filter(Alert.incident_id == incident.id).count() == 1
        assert set(incident.evidence_snapshot["mitre_attack_ids"]) == {
            "T1005 Data from Local System",
            "T1552 Unsecured Credentials",
        }
        assert any(
            item["rule_key"] == "decoy_interaction"
            and item["mitre_attack_id"] == "T1552 Unsecured Credentials"
            for item in incident.evidence_snapshot["findings"]
        )
        assert findings
        assert all(
            item.details["mitre_attack_id"] == "T1552 Unsecured Credentials"
            for item in findings
        )
        assert db.get(SessionModel, session.id).status == "denied"
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_slow_and_low_exfiltration(simulation):
    client, factory, clock = simulation
    steps = scenarios.slow_and_low(client, factory, clock)
    final = steps[-1]
    assert final["decision"] == "RESTRICT"
    assert set(final["triggered_rules"]) == {
        "sensitive_resource_access",
        "slow_and_low_exfiltration",
    }
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_privilege_escalation_probe(simulation):
    client, factory, clock = simulation
    steps = scenarios.privilege_escalation_probe(client, factory, clock)
    final = _last_access_step(steps)
    assert final["decision"] == "DENY"
    assert set(final["triggered_rules"]) == {
        "privilege_probing",
        "unauthorized_resource",
    }
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_credential_stuffing_alerts_and_locks_out(simulation):
    client, factory, clock = simulation
    steps = scenarios.credential_stuffing(client, clock)
    success = steps[-3]
    assert success["decision"] == "RESTRICT"
    assert success["triggered_rules"] == ["login_attack_pattern"]
    assert steps[-1]["decision"] == "DENY"
    with factory() as db:
        incident = db.query(Incident).one()
        assert incident.evidence_snapshot["mitre_attack_ids"] == [
            "T1110 Brute Force"
        ]
        assert db.query(Alert).filter(Alert.incident_id == incident.id).count() == 1
        assert db.query(ActivityEvent).filter(
            ActivityEvent.event_type == "login_failed"
        ).count() == 6
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_token_replay_context_change(simulation):
    client, factory, clock = simulation
    steps = scenarios.token_replay(client, factory, clock)
    final = steps[-1]
    assert final["decision"] == "RESTRICT"
    assert final["triggered_rules"] == ["token_context_change"]
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_enumeration_scan_hits_decoy_and_stops(simulation):
    client, factory, clock = simulation
    steps = scenarios.enumeration_scan(client, factory, clock)
    assert steps[-2]["decision"] == "RESTRICT"
    assert "resource_enumeration" in steps[-2]["triggered_rules"]
    assert steps[-1]["decision"] == "DENY"
    assert set(steps[-1]["triggered_rules"]) == {
        "decoy_interaction",
        "resource_enumeration",
        "sensitive_resource_access",
    }
    session = _session_for(factory, "noah.admin")
    with factory() as db:
        assert db.query(ActivityEvent).filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "decoy_trigger",
        ).count() == 1
        assert db.query(Incident).filter(Incident.session_id == session.id).count() == 1
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_credential_hunting_decoy_bonus_is_deduplicated(simulation):
    client, factory, clock = simulation
    clock.set_hour(10)
    login = scenarios._login(client, "noah.admin")
    token = login.json()["access_token"]
    headers = scenarios._headers(token)
    search = client.post("/api/access/search", headers=headers, params={"q": "password backup"})
    assert search.status_code == 200
    assert search.json()["triggered_rules"] == ["credential_hunting"]
    decoy_id = scenarios._resource_id(factory, "admin_passwords_backup.txt")
    decoy = client.post(
        f"/api/access/resource/{decoy_id}",
        headers=headers,
    )
    assert decoy.status_code == 403
    assert set(decoy.json()["triggered_rules"]) == {
        "credential_hunting",
        "sensitive_resource_access",
    }
    session_id = login.json()["session"]["id"]
    with factory() as db:
        credential_events = db.query(ActivityEvent).filter(
            ActivityEvent.session_id == session_id,
            ActivityEvent.details["rule_key"].as_string() == "credential_hunting",
        ).all()
        assert [event.risk_points for event in credential_events] == [15, 25]
        assert all(
            event.details["mitre_attack_id"] == "T1552 Unsecured Credentials"
            for event in credential_events
        )
    _assert_bounded_and_no_duplicate_incidents(
        [
            {"trust_score": search.json()["trust_score"]},
            {"trust_score": decoy.json()["trust_score"]},
        ],
        factory,
    )


def test_benign_control_allows_normal_work(simulation):
    client, factory, clock = simulation
    steps = scenarios.benign_control(client, factory, clock)
    assert all(step["decision"] == "ALLOW" for step in steps)
    assert all(step["triggered_rules"] == [] for step in steps)
    login_token = client.post(
        "/api/auth/login",
        json={
            "username": "maya.hr",
            "password": DEMO_PASSWORD,
            "device_id": "dev-registered-001",
            "location": "New York",
        },
    ).json()["access_token"]
    _assert_employee_resource_response_is_redacted(client, login_token)
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_unverified_device_rule_is_covered(simulation):
    client, factory, clock = simulation
    clock.set_hour(10)
    login = scenarios._login(
        client,
        "eva.hr",
        device_id="dev-unverified-003",
        location="New York",
    )
    token = login.json()["access_token"]
    resource_id = scenarios._resource_id(factory, "Benefits_Overview.docx")
    response = client.post(
        f"/api/access/resource/{resource_id}",
        headers=scenarios._headers(token),
    )
    assert response.json()["decision"] == "RESTRICT"
    assert response.json()["triggered_rules"] == ["unverified_device"]


def test_revoked_device_rule_is_covered(simulation):
    client, factory, clock = simulation
    clock.set_hour(10)
    login = scenarios._login(
        client,
        "maya.hr",
        device_id="dev-revoked-004",
        location="New York",
    )
    token = login.json()["access_token"]
    resource_id = scenarios._resource_id(factory, "Benefits_Overview.docx")
    response = client.post(
        f"/api/access/resource/{resource_id}",
        headers=scenarios._headers(token),
    )
    assert response.status_code == 403
    assert response.json()["decision"] == "DENY"
    assert response.json()["triggered_rules"] == ["revoked_device"]


def test_search_volume_rule_is_covered(simulation):
    client, factory, clock = simulation
    clock.set_hour(10)
    login = scenarios._login(client, "maya.hr")
    headers = scenarios._headers(login.json()["access_token"])
    final = None
    for index in range(10):
        if index:
            clock.advance(seconds=25)
        final = client.post(
            "/api/access/search",
            headers=headers,
            params={"q": f"team process {index}"},
        )
    assert final.json()["decision"] == "ALLOW"
    assert final.json()["triggered_rules"] == ["suspicious_behaviour"]


def test_detection_coverage_reports_all_simulated_rules(simulation):
    client, _, _ = simulation
    login = scenarios._login(client, "analyst")
    response = client.get(
        "/api/reports/detection-coverage",
        headers=scenarios._headers(login.json()["access_token"]),
    )
    assert response.status_code == 200
    rules = response.json()
    assert rules
    assert all(item["simulation_covered"] for item in rules)
    assert all(item["mitre_attack_id"].startswith("T") for item in rules)
    assert all(item["current_weight"] is not None for item in rules)


@pytest.mark.parametrize("tamper", ["modified", "deleted", "reordered"])
def test_activity_chain_reports_exact_broken_event(simulation, tamper):
    client, factory, clock = simulation
    clock.set_hour(10)
    analyst = scenarios._login(client, "analyst")
    analyst_headers = scenarios._headers(analyst.json()["access_token"])
    integrity = client.get(
        "/api/reports/audit/integrity",
        headers=analyst_headers,
    )
    assert integrity.status_code == 200
    assert integrity.json()["valid"] is True
    login = scenarios._login(client, "maya.hr")
    token = login.json()["access_token"]
    resource_id = scenarios._resource_id(factory, "Benefits_Overview.docx")
    client.post(
        f"/api/access/resource/{resource_id}",
        headers=scenarios._headers(token),
    )
    with factory() as db:
        events = db.query(ActivityEvent).order_by(ActivityEvent.id).all()
        assert len(events) >= 3
        assert verify_chain(db) == {
            "valid": True,
            "checked": len(events),
            "first_broken_event_id": None,
        }
        broken_id = events[1].id
        if tamper == "modified":
            details = dict(events[1].details or {})
            details["test_tamper"] = "modified"
            events[1].details = details
        elif tamper == "deleted":
            db.delete(events[1])
        else:
            details = dict(events[1].details or {})
            metadata = dict(details["_audit_integrity"])
            metadata["prev_event_id"] = events[-1].id
            details["_audit_integrity"] = metadata
            events[1].details = details
        db.commit()
        result = verify_chain(db)
        assert result["valid"] is False
        assert result["first_broken_event_id"] == broken_id
    integrity = client.get(
        "/api/reports/audit/integrity",
        headers=analyst_headers,
    )
    assert integrity.json()["valid"] is False
    assert integrity.json()["first_broken_event_id"] == broken_id


def test_incident_snapshot_digest_is_verified_on_read(simulation):
    client, factory, clock = simulation
    steps = scenarios.decoy_touch(client, factory, clock)
    session = _session_for(factory, "noah.admin")
    with factory() as db:
        incident = db.query(Incident).filter(
            Incident.session_id == session.id
        ).one()
        incident_id = incident.id
        assert incident.evidence_snapshot["sha256_digest"]
    analyst = scenarios._login(client, "analyst")
    headers = scenarios._headers(analyst.json()["access_token"])
    response = client.get(f"/api/incidents/{incident_id}", headers=headers)
    assert response.json()["evidence_integrity"]["valid"] is True
    with factory() as db:
        incident = db.get(Incident, incident_id)
        evidence = dict(incident.evidence_snapshot)
        evidence["test_tamper"] = "modified"
        incident.evidence_snapshot = evidence
        db.commit()
    response = client.get(
        f"/api/reports/incident/{incident_id}",
        headers=headers,
    )
    assert response.json()["evidence_integrity"]["valid"] is False
    _assert_bounded_and_no_duplicate_incidents(steps, factory)


def test_off_hours_access_is_policy_configurable(simulation):
    client, factory, clock = simulation
    clock.set_hour(2)
    login = scenarios._login(client, "maya.hr")
    token = login.json()["access_token"]
    resource_id = scenarios._resource_id(factory, "Benefits_Overview.docx")
    response = client.post(
        f"/api/access/resource/{resource_id}",
        headers=scenarios._headers(token),
    )
    assert response.json()["decision"] == "ALLOW"
    assert response.json()["triggered_rules"] == ["off_hours_access"]


def test_impossible_travel_uses_demo_location_lookup(simulation):
    client, factory, clock = simulation
    clock.set_hour(10)
    employee_login = scenarios._login(client, "maya.hr")
    employee_session_id = employee_login.json()["session"]["id"]
    clock.current = datetime.utcnow() + timedelta(minutes=1)
    analyst_login = scenarios._login(client, "analyst")
    analyst_headers = scenarios._headers(analyst_login.json()["access_token"])
    response = client.post(
        "/api/simulate/location-change",
        headers=analyst_headers,
        json={"session_id": employee_session_id, "location": "London"},
    )
    assert response.status_code == 200
    assert response.json()["decision"] == "ALLOW"
    assert response.json()["triggered_rules"] == ["impossible_travel"]


def test_risk_decay_restores_slowly_but_never_after_decoy(simulation):
    client, factory, clock = simulation
    clock.set_hour(10)
    steps = scenarios.token_replay(client, factory, clock)
    session = _session_for(factory, "maya.hr")
    lowered_score = session.trust_score
    clock.advance(minutes=16)
    login_event = None
    with factory() as db:
        login_event = (
            db.query(ActivityEvent)
            .filter(
                ActivityEvent.session_id == session.id,
                ActivityEvent.event_type == "login",
            )
            .one()
        )
        current_user = db.get(User, session.user_id)
        db.add(Resource(
            name="Simulation read-only normal file",
            type="document",
            department="HR",
            sensitivity="low",
            content="synthetic",
            is_decoy=False,
        ))
        db.commit()
        normal_resource = db.query(Resource).filter(
            Resource.name == "Simulation read-only normal file"
        ).one()
        findings = analyze_behaviour(db, db.get(SessionModel, session.id), current_user, normal_resource)
        assert findings == []
        assessment = recalculate(db, db.get(SessionModel, session.id), findings)
        assert assessment.score == min(100, lowered_score + 2)

    decoy_steps = scenarios.decoy_touch(client, factory, clock)
    decoy_session = _session_for(factory, "noah.admin")
    before = decoy_session.trust_score
    clock.advance(minutes=60)
    with factory() as db:
        denied_session = db.get(SessionModel, decoy_session.id)
        assessment = recalculate(db, denied_session, [])
        assert assessment.score == before
        assert db.query(TrustHistory).filter(
            TrustHistory.session_id == decoy_session.id,
            TrustHistory.reason == "risk_decay",
        ).count() == 0
    _assert_bounded_and_no_duplicate_incidents(steps + decoy_steps, factory)
