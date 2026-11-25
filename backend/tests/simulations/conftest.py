"""In-process FastAPI fixture with seeded, in-memory SQLite data."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.routes import auth_routes
from app.services import detection_engine
from app.seed import seed


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "simulation: in-process synthetic attack scenario",
    )


class SimulationClock:
    def __init__(self) -> None:
        self.current = datetime.utcnow() + timedelta(minutes=1)

    def now(self) -> datetime:
        return self.current

    def advance(self, *, minutes: int = 0, seconds: int = 0) -> None:
        self.current += timedelta(minutes=minutes, seconds=seconds)

    def set_hour(self, hour: int) -> None:
        self.current = self.current.replace(hour=hour, minute=0, second=0, microsecond=0)


@pytest.fixture
def simulation(monkeypatch):
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

    clock = SimulationClock()
    monkeypatch.setattr(detection_engine, "utcnow", clock.now)
    app.dependency_overrides[get_db] = override_get_db
    with auth_routes._login_rate_lock:
        auth_routes._login_failures.clear()
        auth_routes._login_lockouts.clear()
    client = TestClient(app)
    yield client, factory, clock
    app.dependency_overrides.clear()
    with auth_routes._login_rate_lock:
        auth_routes._login_failures.clear()
        auth_routes._login_lockouts.clear()
    engine.dispose()
