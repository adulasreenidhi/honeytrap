"""Pydantic request and response schemas."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# Users
class UserCreate(ORMModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
    email: str = Field(max_length=255)
    password: str = Field(min_length=12, max_length=72)
    role: Literal["admin", "analyst", "employee"] = "employee"
    department: str = Field(min_length=1, max_length=64)
    status: Literal["active", "suspended"] = "active"
    registered_device_id: str | None = Field(default=None, max_length=128)
    usual_location: str | None = Field(default=None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        if not (
            any(char.islower() for char in value)
            and any(char.isupper() for char in value)
            and any(char.isdigit() for char in value)
            and any(not char.isalnum() for char in value)
        ):
            raise ValueError("Password must contain lowercase, uppercase, numeric, and special characters")
        return value


class UserUpdate(ORMModel):
    email: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=12, max_length=72)
    role: Literal["admin", "analyst", "employee"] | None = None
    department: str | None = Field(default=None, min_length=1, max_length=64)
    status: Literal["active", "suspended"] | None = None
    registered_device_id: str | None = Field(default=None, max_length=128)
    usual_location: str | None = Field(default=None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str | None) -> str | None:
        if value is not None and len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        if value is not None and not (
            any(char.islower() for char in value)
            and any(char.isupper() for char in value)
            and any(char.isdigit() for char in value)
            and any(not char.isalnum() for char in value)
        ):
            raise ValueError("Password must contain lowercase, uppercase, numeric, and special characters")
        return value


class UserRead(ORMModel):
    id: int
    username: str
    email: str
    role: str
    department: str
    status: str
    registered_device_id: str | None
    usual_location: str | None
    created_at: datetime
    updated_at: datetime


# Devices
class DeviceCreate(ORMModel):
    device_id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=128)
    status: Literal["registered", "unknown", "unverified", "revoked"] = "unverified"


class DeviceUpdate(ORMModel):
    label: str | None = Field(default=None, min_length=1, max_length=128)
    status: Literal["registered", "unknown", "unverified", "revoked"] | None = None


class DeviceRead(ORMModel):
    id: int
    device_id: str
    label: str
    status: str
    created_at: datetime
    updated_at: datetime


# Sessions
class SessionCreate(ORMModel):
    user_id: int
    device_id: str = Field(min_length=1, max_length=128)
    location: str = Field(min_length=1, max_length=128)


class SessionUpdate(ORMModel):
    trust_score: int | None = Field(default=None, ge=0, le=100)
    status: Literal["active", "restricted", "denied", "ended"] | None = None
    location: str | None = Field(default=None, max_length=128)


class SessionRead(ORMModel):
    id: int
    user_id: int
    device_id: str
    location: str
    trust_score: int
    status: str
    created_at: datetime
    last_activity_at: datetime


# Trust history
class TrustHistoryCreate(ORMModel):
    session_id: int
    score: float = Field(ge=0, le=100)
    delta: float = Field(ge=-100, le=100)
    reason: str = Field(min_length=1, max_length=255)


class TrustHistoryUpdate(ORMModel):
    score: float | None = Field(default=None, ge=0, le=100)
    delta: float | None = Field(default=None, ge=-100, le=100)
    reason: str | None = Field(default=None, min_length=1, max_length=255)


class TrustHistoryRead(ORMModel):
    id: int
    session_id: int
    score: float
    delta: float
    reason: str
    timestamp: datetime


# Resources
class ResourceCreate(ORMModel):
    name: str = Field(min_length=1, max_length=255)
    type: Literal["document", "finance", "project", "admin", "credential"]
    department: str = Field(min_length=1, max_length=64)
    sensitivity: Literal["low", "medium", "high", "critical"] = "low"
    content: str = Field(default="", max_length=100_000)
    is_decoy: bool = False
    decoy_type: str | None = Field(default=None, max_length=64)


class ResourceUpdate(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: Literal["document", "finance", "project", "admin", "credential"] | None = None
    department: str | None = Field(default=None, min_length=1, max_length=64)
    sensitivity: Literal["low", "medium", "high", "critical"] | None = None
    content: str | None = Field(default=None, max_length=100_000)
    is_decoy: bool | None = None
    decoy_type: str | None = Field(default=None, max_length=64)


class ResourceRead(ORMModel):
    """Normal resource view; decoy metadata is intentionally excluded."""

    id: int
    name: str
    type: str
    department: str
    sensitivity: str
    content: str
    created_at: datetime
    updated_at: datetime


class AdminResourceRead(ResourceRead):
    is_decoy: bool
    decoy_type: str | None


# Activity
class ActivityEventCreate(ORMModel):
    session_id: int | None
    user_id: int | None
    resource_id: int | None = None
    event_type: Literal["login", "login_failed", "file_access", "search", "sensitive_request", "decoy_trigger", "device_change", "location_change", "verification", "access_decision"]
    severity: Literal["low", "medium", "high", "critical"] = "low"
    risk_points: int = Field(default=0, ge=0, le=100)
    details: dict[str, Any] | None = None


class ActivityEventUpdate(ORMModel):
    severity: Literal["low", "medium", "high", "critical"] | None = None
    risk_points: int | None = Field(default=None, ge=0, le=100)
    details: dict[str, Any] | None = None


class ActivityEventRead(ORMModel):
    id: int
    session_id: int | None
    user_id: int | None
    resource_id: int | None
    event_type: str
    severity: str
    risk_points: int
    details: dict[str, Any] | None
    timestamp: datetime


# Incidents
class IncidentCreate(ORMModel):
    session_id: int
    user_id: int
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["open", "investigating", "resolved"] = "open"
    title: str = Field(min_length=1, max_length=255)
    summary: str = Field(default="", max_length=10_000)
    evidence_snapshot: dict[str, Any] | None = None
    analyst_notes: str | None = Field(default=None, max_length=10_000)


class IncidentUpdate(ORMModel):
    severity: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["open", "investigating", "resolved"] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=10_000)
    evidence_snapshot: dict[str, Any] | None = None
    analyst_notes: str | None = Field(default=None, max_length=10_000)


class IncidentRead(ORMModel):
    id: int
    session_id: int
    user_id: int
    severity: str
    status: str
    title: str
    summary: str
    evidence_snapshot: dict[str, Any] | None
    analyst_notes: str | None
    created_at: datetime


# Alerts
class AlertCreate(ORMModel):
    incident_id: int
    session_id: int
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["open", "acknowledged", "resolved"] = "open"
    title: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1, max_length=10_000)


class AlertUpdate(ORMModel):
    severity: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["open", "acknowledged", "resolved"] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    message: str | None = Field(default=None, min_length=1, max_length=10_000)


class AlertRead(ORMModel):
    id: int
    incident_id: int
    session_id: int
    severity: str
    status: str
    title: str
    message: str
    created_at: datetime


# Response actions
class ResponseActionCreate(ORMModel):
    incident_id: int
    action: Literal[
        "restrict_session", "terminate_session", "block_sensitive_resources",
        "require_step_up_verification", "suspend_user", "mark_device_revoked",
    ]
    performed_by: str = Field(min_length=1, max_length=64)
    notes: str | None = Field(default=None, max_length=10_000)


class ResponseActionUpdate(ORMModel):
    action: Literal[
        "restrict_session", "terminate_session", "block_sensitive_resources",
        "require_step_up_verification", "suspend_user", "mark_device_revoked",
    ] | None = None
    notes: str | None = Field(default=None, max_length=10_000)


class ResponseActionRead(ORMModel):
    id: int
    incident_id: int
    action: str
    performed_by: str
    notes: str | None
    timestamp: datetime


# Policies
class PolicyCreate(ORMModel):
    name: str = Field(min_length=1, max_length=128)
    rule_key: str = Field(min_length=1, max_length=128)
    value: float = Field(ge=0, le=10000)
    enabled: bool = True


class PolicyUpdate(ORMModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    rule_key: str | None = Field(default=None, min_length=1, max_length=128)
    value: float | None = Field(default=None, ge=0, le=10000)
    enabled: bool | None = None


class PolicyRead(ORMModel):
    id: int
    name: str
    rule_key: str
    value: float
    enabled: bool


class LoginRequest(ORMModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
    password: str = Field(min_length=1, max_length=72)
    device_id: str = Field(min_length=1, max_length=128)
    location: str = Field(min_length=1, max_length=128)


class LoginSessionInfo(ORMModel):
    id: int
    user_id: int
    device_id: str
    location: str
    trust_score: int
    status: str
