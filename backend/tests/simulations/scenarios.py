"""Synthetic attack scenarios that use only the local FastAPI TestClient."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.models.incident import Incident
from app.models.resource import Resource
from app.seed import DEMO_PASSWORD


def _step(name: str, endpoint: str, response, fallback: str = "ALLOW") -> dict[str, Any]:
    try:
        body = response.json()
    except ValueError:
        body = {}
    _assert_no_decoy_metadata(body)
    session = body.get("session", {})
    decision = body.get("decision")
    if decision is None:
        decision = "DENY" if response.status_code >= 400 else (
            "RESTRICT" if session.get("status") == "restricted" else fallback
        )
    trust_score = body.get("trust_score", session.get("trust_score"))
    return {
        "step": name,
        "endpoint": endpoint,
        "decision": decision,
        "trust_score": trust_score,
        "triggered_rules": body.get("triggered_rules", []),
    }


def _assert_no_decoy_metadata(value: Any) -> None:
    """Keep simulated employee responses free of decoy labels and metadata."""

    hidden_keys = {"is_decoy", "decoy_type"}
    labels = {
        "password_backup",
        "salary_sheet",
        "honeytoken",
        "decoy_document",
        "decoy_database_record",
    }
    if isinstance(value, dict):
        assert not hidden_keys.intersection(key.casefold() for key in value)
        for item in value.values():
            _assert_no_decoy_metadata(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_decoy_metadata(item)
    elif isinstance(value, str):
        assert not any(label in value.casefold() for label in labels)


def _login(
    client: TestClient,
    username: str,
    *,
    device_id: str = "dev-registered-001",
    location: str = "New York",
    user_agent: str = "HoneyGate simulation",
    password: str = DEMO_PASSWORD,
):
    return client.post(
        "/api/auth/login",
        headers={"User-Agent": user_agent},
        json={
            "username": username,
            "password": password,
            "device_id": device_id,
            "location": location,
        },
    )


def _resource_id(factory: sessionmaker, name: str) -> int:
    with factory() as db:
        resource = db.query(Resource).filter(Resource.name == name).one()
        return resource.id


def _incident_triggered_rules(factory: sessionmaker, session_id: int) -> list[str]:
    with factory() as db:
        incident = db.query(Incident).filter(Incident.session_id == session_id).one()
        explanations = (incident.evidence_snapshot or {}).get("decision_explanations", [])
        return explanations[-1].get("triggered_rules", []) if explanations else []


def _headers(token: str, user_agent: str = "HoneyGate simulation") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "User-Agent": user_agent}


def stolen_credentials_unknown_device(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    login = _login(
        client,
        "liam.finance",
        device_id="stolen-device-unknown",
        location="London",
    )
    assert login.status_code == 200, login.text
    steps = [_step("valid credentials on unknown device", "/api/auth/login", login)]
    token = login.json()["access_token"]
    resource_id = _resource_id(factory, "Quarterly_Budget_Plan.xlsx")
    access = client.post(
        f"/api/access/resource/{resource_id}",
        headers=_headers(token),
    )
    steps.append(_step("browse sensitive finance file", f"/api/access/resource/{resource_id}", access))
    return steps


def insider_data_hoarding(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    login = _login(client, "liam.finance")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    resources = [
        _resource_id(factory, "Payroll_Schedule_Template.xlsx"),
        _resource_id(factory, "Expense_Approval_Workflow.pdf"),
        _resource_id(factory, "Vendor_List_Sample.csv"),
    ]
    steps = [_step("employee login", "/api/auth/login", login)]
    for index in range(10):
        resource_id = resources[index % len(resources)]
        response = client.post(
            f"/api/access/resource/{resource_id}",
            headers=_headers(token),
        )
        steps.append(_step(
            f"open department file {index + 1}",
            f"/api/access/resource/{resource_id}",
            response,
        ))
    sensitive_id = _resource_id(factory, "Quarterly_Budget_Plan.xlsx")
    response = client.post(
        f"/api/access/resource/{sensitive_id}",
        headers=_headers(token),
    )
    steps.append(_step(
        "open sensitive department file",
        f"/api/access/resource/{sensitive_id}",
        response,
    ))
    return steps


def decoy_touch(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    login = _login(client, "noah.admin")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = _headers(token)
    normal_id = _resource_id(factory, "Office_Access_Policy.pdf")
    decoy_id = _resource_id(factory, "admin_passwords_backup.txt")
    steps = [_step("employee login", "/api/auth/login", login)]
    normal = client.post(f"/api/access/resource/{normal_id}", headers=headers)
    steps.append(_step("normal department activity", f"/api/access/resource/{normal_id}", normal))
    decoy = client.post(f"/api/access/resource/{decoy_id}", headers=headers)
    steps.append(_step("touch decoy", f"/api/access/resource/{decoy_id}", decoy))
    steps[-1]["triggered_rules"] = _incident_triggered_rules(
        factory, login.json()["session"]["id"]
    )
    verify = client.post("/api/access/verify", headers=headers, json={"otp": "000000"})
    steps.append(_step("attempt recovery after containment", "/api/access/verify", verify))
    return steps


def slow_and_low(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    login = _login(client, "liam.finance")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    resource_id = _resource_id(factory, "Quarterly_Budget_Plan.xlsx")
    steps = [_step("employee login", "/api/auth/login", login)]
    for index in range(6):
        if index:
            clock.advance(minutes=11)
        response = client.post(
            f"/api/access/resource/{resource_id}",
            headers=_headers(token),
        )
        steps.append(_step(
            f"sensitive access {index + 1}",
            f"/api/access/resource/{resource_id}",
            response,
        ))
    return steps


def privilege_escalation_probe(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    resource_ids = [
        _resource_id(factory, "Incident_Response_Playbook.pdf"),
        _resource_id(factory, "Service_Account_Inventory.xlsx"),
        _resource_id(factory, "Office_Access_Policy.pdf"),
    ]
    steps = []
    for index, resource_id in enumerate(resource_ids):
        login = _login(client, "maya.hr")
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        if index == 0:
            steps.append(_step("employee login", "/api/auth/login", login))
        response = client.post(
            f"/api/access/resource/{resource_id}",
            headers=_headers(token),
        )
        steps.append(_step(
            f"request another department resource {index + 1}",
            f"/api/access/resource/{resource_id}",
            response,
        ))
    return steps


def credential_stuffing(client: TestClient, clock) -> list[dict]:
    clock.set_hour(10)
    steps = []
    for username in ("maya.hr", "maya.hr", "liam.finance", "noah.admin"):
        response = _login(client, username, password="NotTheDemoPassword123!")
        steps.append(_step("failed credential attempt", "/api/auth/login", response))
    success = _login(client, "maya.hr")
    steps.append(_step("successful login after failures", "/api/auth/login", success))
    token = success.json()["access_token"]
    locked_failure = _login(client, "maya.hr", password="StillNotThePassword123!")
    steps.append(_step("attempt that reaches the IP lockout", "/api/auth/login", locked_failure))
    blocked_success = _login(client, "maya.hr")
    steps.append(_step("attempt during IP lockout", "/api/auth/login", blocked_success))
    return steps


def token_replay(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    initial_agent = "HoneyGate trusted client"
    login = _login(client, "maya.hr", user_agent=initial_agent)
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    resource_id = _resource_id(factory, "HR_Policy_Handbook.pdf")
    steps = [_step("login from expected client context", "/api/auth/login", login)]
    first = client.post(
        f"/api/access/resource/{resource_id}",
        headers=_headers(token, initial_agent),
    )
    steps.append(_step("normal request", f"/api/access/resource/{resource_id}", first))
    replay = client.post(
        "/api/access/search",
        headers=_headers(token, "Different simulated client"),
        params={"q": "onboarding"},
    )
    steps.append(_step("reuse token from changed User-Agent", "/api/access/search", replay))
    return steps


def enumeration_scan(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    login = _login(client, "noah.admin")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    normal_names = [
        "Incident_Response_Playbook.pdf",
        "Support_Runbook.docx",
        "Office_Access_Policy.pdf",
        "Service_Account_Inventory.xlsx",
        "Conference_Room_Schedule.xlsx",
    ]
    normal_ids = [_resource_id(factory, name) for name in normal_names]
    decoy_id = _resource_id(factory, "admin_passwords_backup.txt")
    steps = [_step("employee login", "/api/auth/login", login)]
    for index, resource_id in enumerate(normal_ids):
        response = client.post(
            f"/api/access/resource/{resource_id}",
            headers=_headers(token),
        )
        steps.append(_step(
            f"walk sequential resource ID {index + 1}",
            f"/api/access/resource/{resource_id}",
            response,
        ))
    decoy = client.post(
        f"/api/access/resource/{decoy_id}",
        headers=_headers(token),
    )
    steps.append(_step("enumeration reaches decoy", f"/api/access/resource/{decoy_id}", decoy))
    steps[-1]["triggered_rules"] = _incident_triggered_rules(
        factory, login.json()["session"]["id"]
    )
    return steps


def benign_control(client: TestClient, factory: sessionmaker, clock) -> list[dict]:
    clock.set_hour(10)
    login = _login(client, "maya.hr")
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = _headers(token)
    resource_ids = [
        _resource_id(factory, "HR_Policy_Handbook.pdf"),
        _resource_id(factory, "Benefits_Overview.docx"),
        _resource_id(factory, "Employee_Onboarding_Checklist.pdf"),
    ]
    steps = [_step("employee login", "/api/auth/login", login)]
    for index, resource_id in enumerate(
        resource_ids + [resource_ids[0], resource_ids[1]]
    ):
        response = client.post(
            f"/api/access/resource/{resource_id}",
            headers=headers,
        )
        steps.append(_step(
            f"routine file access {index + 1}",
            f"/api/access/resource/{resource_id}",
            response,
        ))
    for query in ("onboarding", "policy"):
        response = client.post("/api/access/search", headers=headers, params={"q": query})
        steps.append(_step(f"routine search: {query}", "/api/access/search", response))
    return steps
