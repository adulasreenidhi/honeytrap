"""Regression tests for backend authentication, authorization, and response hardening."""

import base64
import json
import logging
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings, settings
from app.database import Base, get_db
from app.database import _migrate_activity_event_auth_refs
from app.main import app
from app.models.activity import ActivityEvent
from app.models.incident import Incident
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.models.user import User
from app.routes import auth_routes
from app.seed import DEMO_PASSWORD, seed


@pytest.fixture(autouse=True)
def clear_login_limits():
    with auth_routes._login_rate_lock:
        auth_routes._login_failures.clear()
        auth_routes._login_lockouts.clear()
    yield
    with auth_routes._login_rate_lock:
        auth_routes._login_failures.clear()
        auth_routes._login_lockouts.clear()


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


@pytest.fixture(scope="module")
def route_api():
    """Share a seeded database and role tokens across the exhaustive role matrix."""

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
    tokens = {"employee": _login(client, "maya.hr"), "analyst": _login(client, "analyst")}
    yield client, tokens
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


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _raw_token(header: dict, claims: dict, signature: bytes = b"invalid") -> str:
    return f"{_b64url(json.dumps(header).encode())}.{_b64url(json.dumps(claims).encode())}.{_b64url(signature)}"


def test_tampered_none_algorithm_and_expired_tokens_are_rejected(api):
    client, _ = api
    valid_token = _login(client, "maya.hr")
    valid_claims = jwt.get_unverified_claims(valid_token)
    assert {"exp", "iat", "sub", "session_id", "jti"} <= valid_claims.keys()
    header, payload, signature = valid_token.split(".")
    changed = ("A" if signature[0] != "A" else "B") + signature[1:]
    assert client.get("/api/auth/me", headers=_auth(f"{header}.{payload}.{changed}")).status_code == 401

    claims = {
        "sub": "3",
        "user_id": 3,
        "session_id": 1,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
        "jti": "test-token-id",
    }
    none_token = _raw_token({"alg": "none", "typ": "JWT"}, claims, b"")
    assert client.get("/api/auth/me", headers=_auth(none_token)).status_code == 401

    expired = jwt.encode(
        {
            **claims,
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            "iat": datetime.now(timezone.utc) - timedelta(minutes=2),
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    assert client.get("/api/auth/me", headers=_auth(expired)).status_code == 401


def test_logout_and_denied_sessions_revoke_tokens(api):
    client, factory = api
    token = _login(client, "maya.hr")
    assert client.post("/api/auth/logout", headers=_auth(token)).status_code == 200
    assert client.get("/api/auth/me", headers=_auth(token)).status_code == 401

    denied_token = _login(client, "liam.finance")
    with factory() as db:
        session = db.query(SessionModel).filter(SessionModel.user_id == 4).one()
        session.status = "denied"
        db.commit()
    assert client.get("/api/auth/me", headers=_auth(denied_token)).status_code == 401


def test_existing_sqlite_activity_table_is_migrated_for_failed_login_events():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE activity_events")
        connection.exec_driver_sql(
            """
            CREATE TABLE activity_events (
                id INTEGER NOT NULL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES sessions(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                resource_id INTEGER REFERENCES resources(id),
                event_type VARCHAR(32) NOT NULL,
                severity VARCHAR(16) NOT NULL,
                risk_points INTEGER NOT NULL,
                details JSON,
                timestamp DATETIME NOT NULL
            )
            """
        )
    _migrate_activity_event_auth_refs(engine)
    with engine.connect() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(activity_events)").mappings().all()
    nullability = {column["name"]: column["notnull"] for column in columns}
    assert nullability["session_id"] == 0
    assert nullability["user_id"] == 0
    engine.dispose()


ADMIN_ONLY_REQUESTS = [
    ("POST", "/api/users", {"username": "new.person", "email": "new.person@honeygate.demo", "password": "Strong!Password2026", "role": "employee", "department": "HR"}),
    ("GET", "/api/users", None),
    ("GET", "/api/users/1", None),
    ("PATCH", "/api/users/1", {"department": "HR"}),
    ("DELETE", "/api/users/1", None),
    ("POST", "/api/devices", {"device_id": "device-new", "label": "New device"}),
    ("GET", "/api/devices", None),
    ("GET", "/api/devices/1", None),
    ("PATCH", "/api/devices/1", {"label": "Updated"}),
    ("DELETE", "/api/devices/1", None),
    ("POST", "/api/decoys", {"name": "new-decoy", "type": "document", "department": "HR", "sensitivity": "medium"}),
    ("GET", "/api/decoys", None),
    ("GET", "/api/decoys/1", None),
    ("PATCH", "/api/decoys/1", {"name": "changed-decoy"}),
    ("DELETE", "/api/decoys/1", None),
    ("PUT", "/api/policies/1", {"value": 20}),
    ("POST", "/api/demo/run-scenario", None),
    ("POST", "/api/demo/reset", None),
]


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ONLY_REQUESTS)
@pytest.mark.parametrize("username", ["maya.hr", "analyst"])
def test_wrong_role_is_forbidden_on_every_admin_only_route(route_api, method, path, body, username):
    client, tokens = route_api
    role = "employee" if username == "maya.hr" else "analyst"
    response = client.request(method, path, headers=_auth(tokens[role]), json=body)
    assert response.status_code == 403, f"{method} {path}: {response.text}"


ANALYST_ADMIN_REQUESTS = [
    ("GET", "/api/alerts", None),
    ("PATCH", "/api/alerts/1", {"status": "acknowledged"}),
    ("GET", "/api/incidents", None),
    ("GET", "/api/incidents/1", None),
    ("PATCH", "/api/incidents/1", {"status": "investigating"}),
    ("POST", "/api/incidents/1/respond", {"action": "restrict_session"}),
    ("GET", "/api/policies", None),
    ("GET", "/api/reports/incident/1", None),
    ("GET", "/api/reports/audit", None),
    ("GET", "/api/dashboard/summary", None),
    ("GET", "/api/dashboard/trust-trends", None),
    ("GET", "/api/dashboard/events-over-time", None),
    ("GET", "/api/sessions/active", None),
    ("POST", "/api/simulate/device-change", {"session_id": 1, "device_id": "dev-unknown-002"}),
    ("POST", "/api/simulate/location-change", {"session_id": 1, "location": "Austin"}),
]


@pytest.mark.parametrize(("method", "path", "body"), ANALYST_ADMIN_REQUESTS)
def test_employee_is_forbidden_on_admin_analyst_routes(route_api, method, path, body):
    client, tokens = route_api
    response = client.request(method, path, headers=_auth(tokens["employee"]), json=body)
    assert response.status_code == 403, f"{method} {path}: {response.text}"


def test_employee_idor_filters_cannot_read_other_session_or_activity(api):
    client, factory = api
    maya_token = _login(client, "maya.hr")
    liam_token = _login(client, "liam.finance")
    with factory() as db:
        maya = db.query(User).filter(User.username == "maya.hr").one()
        liam = db.query(User).filter(User.username == "liam.finance").one()
        maya_session = db.query(SessionModel).filter(SessionModel.user_id == maya.id).one()
        liam_session = db.query(SessionModel).filter(SessionModel.user_id == liam.id).one()

    denied = client.get(
        f"/api/sessions/{liam_session.id}/trust",
        headers=_auth(maya_token),
    )
    assert denied.status_code == 403
    activity = client.get(
        f"/api/activity?user_id={liam.id}&session_id={liam_session.id}",
        headers=_auth(maya_token),
    )
    assert activity.status_code == 200
    assert activity.json()["items"]
    assert all(item["user_id"] == maya.id for item in activity.json()["items"])
    assert all(item["session_id"] != liam_session.id for item in activity.json()["items"])
    assert maya_session.user_id == maya.id


def test_employee_responses_hide_decoy_metadata_weights_and_password_hashes(api):
    client, factory = api
    token = _login(client, "noah.admin")
    headers = _auth(token)
    session_id = jwt.get_unverified_claims(token)["session_id"]
    resources = client.get("/api/resources", headers=headers).json()
    assert resources
    assert all("is_decoy" not in item and "decoy_type" not in item for item in resources)
    assert all("DEMO ONLY" not in item["content"] for item in resources)
    assert not any("hashed_password" in json.dumps(item) for item in resources)

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert "hashed_password" not in me.text
    with factory() as db:
        db.add(TrustHistory(
            session_id=session_id,
            score=50,
            delta=-50,
            reason="continuous_monitoring",
        ))
        db.commit()
    trust = client.get(f"/api/sessions/{session_id}/trust", headers=headers)
    assert trust.status_code == 200
    assert trust.json()["history"][0]["delta"] == 0
    assert "(-50)" not in trust.text

    decoy = next(item for item in resources if item["name"] == "admin_passwords_backup.txt")
    access = client.post(f"/api/access/resource/{decoy['id']}", headers=headers)
    assert access.status_code == 403
    assert access.json()["content"] is None
    assert "is_decoy" not in access.text
    assert "decoy_type" not in access.text
    assert "(+50)" not in access.text

    headers = _auth(_login(client, "noah.admin"))
    activity = client.get("/api/activity", headers=headers)
    assert activity.status_code == 200
    assert all(item["event_type"] != "decoy_trigger" for item in activity.json()["items"])
    assert all("risk_points" not in item for item in activity.json()["items"])
    assert "decoy_type" not in activity.text and "is_decoy" not in activity.text


def test_login_rate_limit_lockout_logs_failures_and_uses_generic_error(api):
    client, factory = api
    failures = [
        client.post(
            "/api/auth/login",
            json={"username": "missing.user", "password": "Wrong!Password2026", "device_id": "d", "location": "x"},
        )
        for _ in range(settings.LOGIN_FAILURE_LIMIT)
    ]
    assert all(response.status_code == 401 for response in failures)
    assert all(response.json()["detail"] == "Invalid username or password" for response in failures)
    limited = client.post(
        "/api/auth/login",
        json={"username": "missing.user", "password": "Wrong!Password2026", "device_id": "d", "location": "x"},
    )
    assert limited.status_code == 429
    with factory() as db:
        assert db.query(ActivityEvent).filter(ActivityEvent.event_type == "login_failed").count() == settings.LOGIN_FAILURE_LIMIT + 1


def test_login_rate_limit_applies_independently_by_username_and_client_ip():
    for index in range(settings.LOGIN_FAILURE_LIMIT):
        auth_routes._record_login_failure("same-user", f"client-{index}")
    with pytest.raises(HTTPException) as by_username:
        auth_routes._check_login_rate_limit("same-user", "fresh-client")
    assert by_username.value.status_code == 429

    with auth_routes._login_rate_lock:
        auth_routes._login_failures.clear()
        auth_routes._login_lockouts.clear()
    for index in range(settings.LOGIN_FAILURE_LIMIT):
        auth_routes._record_login_failure(f"user-{index}", "same-client")
    with pytest.raises(HTTPException) as by_ip:
        auth_routes._check_login_rate_limit("fresh-user", "same-client")
    assert by_ip.value.status_code == 429


def test_unknown_user_and_wrong_password_share_error_and_logs_hide_secrets(api, caplog):
    client, _ = api
    with caplog.at_level(logging.WARNING):
        unknown = client.post(
            "/api/auth/login",
            json={"username": "absent.user", "password": "do-not-log-this-password", "device_id": "d", "location": "x"},
        )
        wrong = client.post(
            "/api/auth/login",
            json={"username": "maya.hr", "password": "do-not-log-this-password", "device_id": "d", "location": "x"},
        )
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"] == "Invalid username or password"
    assert "do-not-log-this-password" not in caplog.text


def test_password_strength_and_user_role_self_protection(api):
    client, _ = api
    admin = _login(client, "admin")
    weak_user = client.post(
        "/api/users",
        headers=_auth(admin),
        json={"username": "weak.user", "email": "weak@honeygate.demo", "password": "lowercaseonly", "department": "HR"},
    )
    assert weak_user.status_code == 422
    weak_update = client.patch("/api/users/1", headers=_auth(admin), json={"password": "lowercaseonly"})
    assert weak_update.status_code == 422
    self_role = client.patch("/api/users/1", headers=_auth(admin), json={"role": "analyst"})
    assert self_role.status_code == 403
    self_delete = client.delete("/api/users/1", headers=_auth(admin))
    assert self_delete.status_code == 403
    self_suspend = client.patch("/api/users/1", headers=_auth(admin), json={"status": "suspended"})
    assert self_suspend.status_code == 409


def test_password_change_ends_all_target_sessions(api):
    client, factory = api
    admin = _login(client, "admin")
    maya = _login(client, "maya.hr")
    update = client.patch(
        "/api/users/3",
        headers=_auth(admin),
        json={"password": "NewStrong!Pass2026"},
    )
    assert update.status_code == 200
    assert client.get("/api/auth/me", headers=_auth(maya)).status_code == 401
    with factory() as db:
        sessions = db.query(SessionModel).filter(SessionModel.user_id == 3).all()
        assert sessions and all(session.status == "ended" for session in sessions)


def test_role_policy_response_and_verification_logs_exclude_secrets(api, caplog):
    client, factory = api
    admin = _login(client, "admin")
    token = _login(client, "maya.hr")
    with factory() as db:
        admin_user = db.query(User).filter(User.username == "admin").one()
        employee = db.query(User).filter(User.username == "maya.hr").one()
        employee_session = db.query(SessionModel).filter(SessionModel.user_id == employee.id).one()
        incident = Incident(
            session_id=employee_session.id,
            user_id=employee.id,
            title="Synthetic test incident",
        )
        db.add(incident)
        db.commit()
        incident_id = incident.id
        policy_id = 1
        assert admin_user.id == 1

    with caplog.at_level(logging.WARNING):
        changed = client.patch("/api/users/3", headers=_auth(admin), json={"role": "analyst"})
        policy = client.put(f"/api/policies/{policy_id}", headers=_auth(admin), json={"value": 20})
        action = client.post(
            f"/api/incidents/{incident_id}/respond",
            headers=_auth(admin),
            json={"action": "restrict_session", "notes": "Synthetic test action"},
        )
        verified = client.post("/api/access/verify", headers=_auth(token), json={"otp": "123456"})

    assert changed.status_code == policy.status_code == action.status_code == verified.status_code == 200
    assert "User role changed" in caplog.text
    assert "Policy updated" in caplog.text
    assert "Simulated response action recorded" in caplog.text
    assert token not in caplog.text
    assert "123456" not in caplog.text
    assert "Synthetic test action" not in caplog.text


def test_sql_injection_inputs_are_bounded_and_do_not_leak_validation_input(api):
    client, _ = api
    employee = _login(client, "maya.hr")
    search = client.post(
        "/api/access/search",
        params={"q": "  ' OR 1=1--\x00"},
        headers=_auth(employee),
    )
    assert search.status_code == 200
    injection_login = client.post(
        "/api/auth/login",
        json={"username": "' OR 1=1--", "password": "never-log-this-secret", "device_id": "d", "location": "x"},
    )
    assert injection_login.status_code == 422
    assert "never-log-this-secret" not in injection_login.text


def test_csv_formula_injection_is_prefixed(api):
    client, factory = api
    admin = _login(client, "admin")
    with factory() as db:
        db.add(ActivityEvent(
            session_id=None,
            user_id=None,
            event_type="=1+1",
            severity="+SUM(1,1)",
            risk_points=0,
            details={},
        ))
        db.add(ActivityEvent(
            session_id=None,
            user_id=None,
            event_type="-1+1",
            severity="@SUM(1,1)",
            risk_points=0,
            details={},
        ))
        db.commit()
    response = client.get("/api/reports/audit?format=csv", headers=_auth(admin))
    assert response.status_code == 200
    assert "'=1+1" in response.text
    assert "'+SUM(1,1)" in response.text
    assert "'-1+1" in response.text
    assert "'@SUM(1,1)" in response.text


def test_security_headers_cors_and_body_limit(api):
    client, _ = api
    for origin in ("http://localhost:5173", "http://localhost:3000"):
        response = client.get("/api/health", headers={"Origin": origin})
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert response.headers.get("x-request-id")

    too_large = client.post(
        "/api/auth/login",
        content=b"x" * (settings.MAX_REQUEST_BODY_SIZE_BYTES + 1),
        headers={"Content-Type": "application/json"},
    )
    assert too_large.status_code == 413
    assert too_large.headers.get("x-request-id")


def test_production_secret_validation_and_error_bodies_are_generic(api):
    with pytest.raises(ValueError):
        Settings(SECRET_KEY="short", DEBUG=False)
    with pytest.raises(ValueError):
        Settings(SECRET_KEY="change-this-demo-secret-in-production", DEBUG=False)
    assert Settings(SECRET_KEY="a" * 32, DEBUG=False).SECRET_KEY == "a" * 32

    client, _ = api
    invalid = client.post(
        "/api/auth/login",
        json={"username": "bad!", "password": "sensitive-password-value", "device_id": "d", "location": "x"},
    )
    assert invalid.status_code == 422
    assert "sensitive-password-value" not in invalid.text
    assert "C:\\\\" not in invalid.text


def test_restricted_access_never_returns_resource_content_and_report_dates_validate(api):
    client, factory = api
    employee = _login(client, "noah.admin")
    with factory() as db:
        session = db.query(SessionModel).filter(SessionModel.user_id == 6).one()
        session.device_id = "dev-unknown-002"
        resource = db.query(Resource).filter(
            Resource.department == "Admin",
            Resource.is_decoy.is_(False),
            Resource.sensitivity == "medium",
        ).first()
        resource_id = resource.id
        db.commit()
    restricted = client.post(f"/api/access/resource/{resource_id}", headers=_auth(employee))
    assert restricted.status_code == 200
    assert restricted.json()["decision"] == "RESTRICT"
    assert restricted.json()["content"] is None
    assert restricted.json()["trust_assessment"]["delta"] == 0
    assert "(+15)" not in restricted.text

    admin = _login(client, "admin")
    assert client.get("/api/reports/audit?from=not-a-date", headers=_auth(admin)).status_code == 422
    assert client.get(
        "/api/reports/audit?from=2026-02-01T00:00:00&to=2026-01-01T00:00:00",
        headers=_auth(admin),
    ).status_code == 422
