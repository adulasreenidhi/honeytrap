"""Resource model."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(32))
    department: Mapped[str] = mapped_column(String(64))
    sensitivity: Mapped[str] = mapped_column(String(16), default="low")
    content: Mapped[str] = mapped_column(Text, default="")
    is_decoy: Mapped[bool] = mapped_column(Boolean, default=False)
    decoy_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
