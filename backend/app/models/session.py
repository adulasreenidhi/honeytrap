"""Session and trust history models."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.activity import ActivityEvent
    from app.models.incident import Incident
    from app.models.user import User


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(128))
    location: Mapped[str] = mapped_column(String(128))
    trust_score: Mapped[int] = mapped_column(Integer, default=100)
    status: Mapped[str] = mapped_column(String(16), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="sessions")
    trust_history: Mapped[list["TrustHistory"]] = relationship(back_populates="session")
    activity_events: Mapped[list["ActivityEvent"]] = relationship(back_populates="session")
    incidents: Mapped[list["Incident"]] = relationship(back_populates="session")


class TrustHistory(Base):
    __tablename__ = "trust_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    score: Mapped[float] = mapped_column(Float)
    delta: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(255))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="trust_history")
