"""User and device models."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.activity import ActivityEvent
    from app.models.incident import Incident
    from app.models.session import Session


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="employee")
    department: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="active")
    registered_device_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    usual_location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sessions: Mapped[list["Session"]] = relationship(back_populates="user")
    activity_events: Mapped[list["ActivityEvent"]] = relationship(back_populates="user")
    incidents: Mapped[list["Incident"]] = relationship(back_populates="user")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default="unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
