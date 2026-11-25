"""Incident, alert, response action, and policy models."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    status: Mapped[str] = mapped_column(String(16), default="open")
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text, default="")
    evidence_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analyst_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped["Session"] = relationship(back_populates="incidents")
    user: Mapped["User"] = relationship(back_populates="incidents")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="incident")
    response_actions: Mapped[list["ResponseAction"]] = relationship(back_populates="incident")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    status: Mapped[str] = mapped_column(String(16), default="open")
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    incident: Mapped["Incident"] = relationship(back_populates="alerts")


class ResponseAction(Base):
    __tablename__ = "response_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    incident_id: Mapped[int] = mapped_column(ForeignKey("incidents.id"), index=True)
    action: Mapped[str] = mapped_column(String(64))
    performed_by: Mapped[str] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    incident: Mapped["Incident"] = relationship(back_populates="response_actions")


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    rule_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    value: Mapped[float] = mapped_column(Float)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
