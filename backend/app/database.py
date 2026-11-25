"""SQLAlchemy database setup and dependencies."""

from collections.abc import Generator

from sqlalchemy import create_engine
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
