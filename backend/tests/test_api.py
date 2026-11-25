"""API-level tests for monitored access, incident creation, and reporting."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.incident import Alert, Incident
from app.seed import DEMO_PASSWORD, seed


@pytest.fixture
def api():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as db:
        seed(db)

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client, factory
    app.dependency_overrides.clear()
    engine.dispose()


def _login(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={
            "username": username,
            "password": DEMO_PASSWORD,
            "device_id": "dev-registered-001",
            "location": "New York",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_login_decoy_incident_and_report_full_flow(api):
    client, factory = api
    employee_token = _login(client, "noah.admin")
    employee_headers = {"Authorization": f"Bearer {employee_token}"}

    resources_response = client.get("/api/resources", headers=employee_headers)
    assert resources_response.status_code == 200
    employee_resources = resources_response.json()
    assert employee_resources
    assert all("is_decoy" not in item and "decoy_type" not in item for item in employee_resources)
    decoy = next(item for item in employee_resources if item["name"] == "admin_passwords_backup.txt")

    denied = client.post(
        f"/api/access/resource/{decoy['id']}",
        headers=employee_headers,
    )
    assert denied.status_code == 403
    decision = denied.json()
    assert decision["decision"] == "DENY"
    assert decision["content"] is None
    assert any("decoy_interaction" in reason for reason in decision["reasons"])

    with factory() as db:
        incident = db.query(Incident).one()
        assert incident.evidence_snapshot["triggering_event"]["event_type"] == "decoy_trigger"
        assert db.query(Alert).filter(Alert.incident_id == incident.id).count() == 1

    employee_report = client.get("/api/reports/incident/1", headers=employee_headers)
    assert employee_report.status_code == 403
    employee_admin_data = client.get("/api/users", headers=employee_headers)
    assert employee_admin_data.status_code == 403

    admin_token = _login(client, "admin")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    report = client.get("/api/reports/incident/1", headers=admin_headers)
    assert report.status_code == 200, report.text
    report_data = report.json()
    assert report_data["report_type"] == "incident"
    assert report_data["evidence_snapshot"]["triggering_event"]["resource_id"] == decoy["id"]
    assert any(item["kind"] == "decision" for item in report_data["timeline"])
    assert any(item["kind"] == "response_action" for item in report_data["timeline"])


def test_employee_cannot_read_alerts_or_policy_edits(api):
    client, _ = api
    token = _login(client, "maya.hr")
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/alerts", headers=headers).status_code == 403
    assert client.get("/api/incidents", headers=headers).status_code == 403
    assert client.get("/api/reports/audit", headers=headers).status_code == 403
    assert client.get("/api/dashboard/summary", headers=headers).status_code == 403


def test_reports_csv_and_policy_validation(api):
    client, _ = api
    token = _login(client, "admin")
    headers = {"Authorization": f"Bearer {token}"}
    csv_report = client.get("/api/reports/audit?format=csv", headers=headers)
    assert csv_report.status_code == 200
    assert "text/csv" in csv_report.headers["content-type"]
    assert "event_type" in csv_report.text

    policies = client.get("/api/policies", headers=headers)
    assert policies.status_code == 200
    target = next(item for item in policies.json() if item["rule_key"] == "decoy_interaction")
    updated = client.put(
        f"/api/policies/{target['id']}",
        headers=headers,
        json={"value": 55},
    )
    assert updated.status_code == 200
    assert updated.json()["value"] == 55
    invalid = client.put(
        f"/api/policies/{target['id']}",
        headers=headers,
        json={"value": 101},
    )
    assert invalid.status_code == 422


def test_admin_demo_scenario_and_reset(api):
    client, factory = api
    token = _login(client, "admin")
    headers = {"Authorization": f"Bearer {token}"}
    scenario = client.post("/api/demo/run-scenario", headers=headers)
    assert scenario.status_code == 200, scenario.text
    result = scenario.json()
    assert result["simulated"] is True
    assert result["steps"][0]["decision"] == "ALLOW"
    assert result["steps"][-1]["decision"] == "DENY"
    assert result["final_status"] == "denied"
    assert result["alert_and_incident_created"] is True

    reset = client.post("/api/demo/reset", headers=headers)
    assert reset.status_code == 200, reset.text
    assert reset.json()["reset"] is True
    with factory() as db:
        assert db.query(Incident).count() == 0


def test_all_openapi_operations_have_tags_and_descriptions(api):
    client, _ = api
    schema = client.get("/openapi.json").json()
    for path_item in schema["paths"].values():
        for operation in path_item.values():
            if isinstance(operation, dict) and "responses" in operation:
                assert operation.get("tags")
                assert operation.get("description")
