"""Pydantic request and response schemas."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# Users
class UserCreate(ORMModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["admin", "analyst", "employee"] = "employee"
    department: str = Field(min_length=1, max_length=64)
    status: Literal["active", "suspended"] = "active"
    registered_device_id: str | None = None
    usual_location: str | None = None


class UserUpdate(ORMModel):
    email: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: Literal["admin", "analyst", "employee"] | None = None
    department: str | None = None
    status: Literal["active", "suspended"] | None = None
    registered_device_id: str | None = None
    usual_location: str | None = None


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
    label: str | None = None
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
    device_id: str
    location: str


class SessionUpdate(ORMModel):
    trust_score: int | None = None
    status: Literal["active", "restricted", "denied", "ended"] | None = None
    location: str | None = None


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
    score: float
    delta: float
    reason: str


class TrustHistoryUpdate(ORMModel):
    score: float | None = None
    delta: float | None = None
    reason: str | None = None


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
    content: str = ""
    is_decoy: bool = False
    decoy_type: str | None = None


class ResourceUpdate(ORMModel):
    name: str | None = None
    type: Literal["document", "finance", "project", "admin", "credential"] | None = None
    department: str | None = None
    sensitivity: Literal["low", "medium", "high", "critical"] | None = None
    content: str | None = None
    is_decoy: bool | None = None
    decoy_type: str | None = None


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
    session_id: int
    user_id: int
    resource_id: int | None = None
    event_type: Literal["login", "file_access", "search", "sensitive_request", "decoy_trigger", "device_change", "location_change", "verification"]
    severity: str = "low"
    risk_points: int = 0
    details: dict[str, Any] | None = None


class ActivityEventUpdate(ORMModel):
    severity: str | None = None
    risk_points: int | None = None
    details: dict[str, Any] | None = None


class ActivityEventRead(ORMModel):
    id: int
    session_id: int
    user_id: int
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
    title: str
    summary: str = ""
    evidence_snapshot: dict[str, Any] | None = None
    analyst_notes: str | None = None


class IncidentUpdate(ORMModel):
    severity: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["open", "investigating", "resolved"] | None = None
    title: str | None = None
    summary: str | None = None
    evidence_snapshot: dict[str, Any] | None = None
    analyst_notes: str | None = None


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
    severity: str = "medium"
    status: str = "open"
    title: str
    message: str


class AlertUpdate(ORMModel):
    severity: str | None = None
    status: str | None = None
    title: str | None = None
    message: str | None = None


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
    action: str
    performed_by: str
    notes: str | None = None


class ResponseActionUpdate(ORMModel):
    action: str | None = None
    notes: str | None = None


class ResponseActionRead(ORMModel):
    id: int
    incident_id: int
    action: str
    performed_by: str
    notes: str | None
    timestamp: datetime


# Policies
class PolicyCreate(ORMModel):
    name: str
    rule_key: str
    value: float
    enabled: bool = True


class PolicyUpdate(ORMModel):
    name: str | None = None
    rule_key: str | None = None
    value: float | None = None
    enabled: bool | None = None


class PolicyRead(ORMModel):
    id: int
    name: str
    rule_key: str
    value: float
    enabled: bool


class LoginRequest(ORMModel):
    username: str
    password: str
    device_id: str
    location: str


class LoginSessionInfo(ORMModel):
    id: int
    user_id: int
    device_id: str
    location: str
    trust_score: int
    status: str
