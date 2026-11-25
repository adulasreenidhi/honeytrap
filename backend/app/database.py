"""SQLAlchemy database setup and dependencies."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base for HoneyGate models."""


def get_db() -> Generator[Session, None, None]:
    """Provide a database session per request."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create database tables after importing every model module."""

    from app.models import activity, incident, resource, session, user  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_activity_event_auth_refs(engine)


def _migrate_activity_event_auth_refs(bind: Engine) -> None:
    """Make auth audit references nullable in existing SQLite demo databases."""

    if bind.dialect.name != "sqlite":
        return
    with bind.connect() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(activity_events)").mappings().all()
        if not columns or not any(
            column["notnull"] and column["name"] in {"session_id", "user_id"}
            for column in columns
        ):
            return
        connection.commit()
        dbapi_connection = connection.connection.driver_connection
        dbapi_connection.execute("PRAGMA foreign_keys=OFF")
        try:
            with connection.begin():
                connection.exec_driver_sql("ALTER TABLE activity_events RENAME TO activity_events_old")
                connection.exec_driver_sql('DROP INDEX IF EXISTS "ix_activity_events_session_id"')
                connection.exec_driver_sql('DROP INDEX IF EXISTS "ix_activity_events_user_id"')
                Base.metadata.tables["activity_events"].create(connection)
                connection.exec_driver_sql(
                    """
                    INSERT INTO activity_events (
                        id, session_id, user_id, resource_id, event_type, severity,
                        risk_points, details, timestamp
                    )
                    SELECT
                        id, session_id, user_id, resource_id, event_type, severity,
                        risk_points, details, timestamp
                    FROM activity_events_old
                    """
                )
                connection.exec_driver_sql("DROP TABLE activity_events_old")
        finally:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")
