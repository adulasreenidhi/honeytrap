"""Continuous behaviour detection rules."""

from dataclasses import dataclass
from datetime import datetime, timedelta
import math
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.activity import ActivityEvent
from app.models.incident import Policy
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.user import Device, User


@dataclass(frozen=True)
class Finding:
    rule_key: str
    risk_points: float
    reason: str
    dedup_key: str = ""
    mitre_attack_id: str = "T1078 Valid Accounts"


MITRE_BY_RULE = {
    "unknown_device": "T1078 Valid Accounts",
    "unverified_device": "T1078 Valid Accounts",
    "revoked_device": "T1078 Valid Accounts",
    "unusual_location": "T1078 Valid Accounts",
    "abnormal_file_access": "T1005 Data from Local System",
    "suspicious_behaviour": "T1083 File and Directory Discovery",
    "unauthorized_resource": "T1083 File and Directory Discovery",
    "sensitive_resource_access": "T1005 Data from Local System",
    "decoy_interaction": "T1552 Unsecured Credentials",
    "velocity_burst": "T1005 Data from Local System",
    "resource_enumeration": "T1083 File and Directory Discovery",
    "credential_hunting": "T1552 Unsecured Credentials",
    "privilege_probing": "T1069 Permission Groups Discovery",
    "impossible_travel": "T1078 Valid Accounts",
    "off_hours_access": "T1078 Valid Accounts",
    "token_context_change": "T1550 Use Alternate Authentication Material",
    "login_attack_pattern": "T1110 Brute Force",
    "slow_and_low_exfiltration": "T1005 Data from Local System",
}

DETECTION_RULE_DESCRIPTIONS = {
    "unknown_device": "Access from a device not present in the device registry.",
    "unverified_device": "Access from a device that has not completed verification.",
    "revoked_device": "Access from a device marked as revoked.",
    "unusual_location": "Access location differs from the user's usual location.",
    "abnormal_file_access": "File-access volume exceeds the configured short-window limit.",
    "suspicious_behaviour": "Search volume exceeds the configured short-window limit.",
    "unauthorized_resource": "A non-admin requests a resource outside their department.",
    "sensitive_resource_access": "An employee requests a high- or critical-sensitivity resource.",
    "decoy_interaction": "A request touches a monitored synthetic decoy.",
    "velocity_burst": "Resource requests exceed the configured short burst limit.",
    "resource_enumeration": "Resource IDs or departments are probed in a short window.",
    "credential_hunting": "Searches contain credential or sensitive-data terms.",
    "privilege_probing": "Repeated denied access decisions suggest privilege probing.",
    "impossible_travel": "Known demo locations change faster than the configured travel limit.",
    "off_hours_access": "Access occurs outside configured UTC working hours.",
    "token_context_change": "A request's client IP or User-Agent differs from login context.",
    "login_attack_pattern": "A successful login follows repeated failures across accounts or for that username.",
    "slow_and_low_exfiltration": "Sensitive-resource accesses accumulate beyond a long-window limit.",
}

DEMO_LOCATIONS = {
    "new york": (40.7128, -74.0060),
    "austin": (30.2672, -97.7431),
    "san francisco": (37.7749, -122.4194),
    "london": (51.5072, -0.1276),
    "seattle": (47.6062, -122.3321),
}


def utcnow() -> datetime:
    """Provide one replaceable UTC clock for deterministic, in-process simulations."""

    return datetime.utcnow()


def _finding(rule_key: str, risk: float, reason: str, dedup_key: str) -> Finding:
    return Finding(
        rule_key,
        risk,
        reason,
        dedup_key,
        MITRE_BY_RULE.get(rule_key, "T1078 Valid Accounts"),
    )


def policy_values(db: Session) -> dict[str, float]:
    """Load enabled policy values keyed by rule_key."""

    rows = db.query(Policy).filter(Policy.enabled.is_(True)).all()
    return {row.rule_key: float(row.value) for row in rows}


def log_event(
    db: Session,
    session: SessionModel,
    user: User,
    resource: Resource | None,
    event_type: str,
    details: dict[str, Any] | None,
    severity: str,
    risk_points: float,
) -> ActivityEvent:
    """Create an activity event and persist it."""

    event = ActivityEvent(
        session_id=session.id,
        user_id=user.id,
        resource_id=resource.id if resource else None,
        event_type=event_type,
        severity=severity,
        risk_points=int(risk_points),
        details=details or {},
        timestamp=utcnow(),
    )
    db.add(event)
    db.flush()
    return event


def window_counts(db: Session, session_id: int, minutes: int) -> tuple[int, int, int]:
    """Return file, search, and sensitive-request counts in a sliding window."""

    cutoff = utcnow() - timedelta(minutes=minutes)
    events = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.session_id == session_id)
        .filter(ActivityEvent.timestamp >= cutoff)
        .all()
    )
    files = sum(event.event_type == "file_access" for event in events)
    searches = sum(event.event_type == "search" for event in events)
    sensitive = sum(event.event_type == "sensitive_request" for event in events)
    return files, searches, sensitive


def is_decoy_triggered(resource: Resource | None) -> bool:
    """Identify a monitored decoy resource."""

    return bool(resource and resource.is_decoy)


def _recent_session_events(
    db: Session,
    session_id: int,
    cutoff: datetime,
    event_type: str | None = None,
) -> list[ActivityEvent]:
    query = db.query(ActivityEvent).filter(
        ActivityEvent.session_id == session_id,
        ActivityEvent.timestamp >= cutoff,
    )
    if event_type is not None:
        query = query.filter(ActivityEvent.event_type == event_type)
    return query.order_by(ActivityEvent.timestamp, ActivityEvent.id).all()


def _haversine_km(first: tuple[float, float], second: tuple[float, float]) -> float:
    """Calculate distance between the small set of synthetic demo locations."""

    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def analyze_login_attack(
    db: Session,
    user: User,
    session: SessionModel,
    username: str,
    client_ip: str,
) -> Finding | None:
    """Detect synthetic credential-stuffing or repeated-failure-then-success patterns."""

    policies = policy_values(db)
    now = utcnow()
    minutes = int(policies.get("login_attack_window_minutes", 60))
    failures = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.event_type == "login_failed",
            ActivityEvent.timestamp >= now - timedelta(minutes=minutes),
        )
        .order_by(ActivityEvent.timestamp, ActivityEvent.id)
        .all()
    )
    matching_ip = [
        event for event in failures
        if (event.details or {}).get("client_ip") == client_ip
    ]
    attempted_usernames = {
        str((event.details or {}).get("username", "")).casefold()
        for event in matching_ip
        if (event.details or {}).get("username")
    }
    username_failures = sum(
        str((event.details or {}).get("username", "")).casefold() == username.casefold()
        for event in matching_ip
    )
    across_accounts = len(attempted_usernames) >= int(
        policies.get("login_attack_min_usernames", 3)
    )
    repeated_then_success = username_failures >= int(
        policies.get("login_attack_min_failures", 2)
    )
    if not across_accounts and not repeated_then_success:
        return None

    bucket = int(now.timestamp() // max(1, minutes * 60))
    return _finding(
        "login_attack_pattern",
        float(policies.get("login_attack_pattern", 35)),
        "successful login followed repeated failures across accounts or for this username",
        f"login_attack:{client_ip}:{bucket}:{session.id}",
    )


def analyze_behaviour(
    db: Session,
    session: SessionModel,
    user: User,
    resource: Resource | None,
) -> list[Finding]:
    """Apply policy-backed behavioural and device rules without hardcoded thresholds."""

    policies = policy_values(db)
    findings: list[Finding] = []
    now = utcnow()

    device = db.query(Device).filter(Device.device_id == session.device_id).first()
    device_status = device.status if device else "unknown"
    resource_id = resource.id if resource else 0

    if device_status in {"unknown", "unverified", "revoked"}:
        rule_key = "unknown_device" if device_status == "unknown" else f"{device_status}_device"
        risk = float(policies.get("unknown_device", 0))
        if device_status == "revoked":
            reason = "device is revoked"
        elif device_status == "unverified":
            reason = "device is unverified"
        else:
            reason = "device is unknown"
        findings.append(_finding(
            rule_key, risk, reason, f"device:{device_status}:{session.device_id}"
        ))

    # Detect a new or unusual location compared with the employee's normal profile.
    recognized_travel_location = (
        device_status == "registered"
        and session.location.casefold() in DEMO_LOCATIONS
    )
    if (
        user.usual_location
        and session.location.casefold() != user.usual_location.casefold()
        and not recognized_travel_location
    ):
        findings.append(_finding(
            "unusual_location",
            float(policies.get("unusual_location", 0)),
            f"location {session.location} differs from usual location {user.usual_location}",
            f"location:{session.location}",
        ))

    window_minutes = int(policies.get("window_minutes", 5))
    files, searches, _ = window_counts(db, session.id, window_minutes)
    bucket = int(now.timestamp() // max(1, window_minutes * 60))
    if files > int(policies.get("max_files_per_window", 8)):
        findings.append(_finding(
            "abnormal_file_access",
            float(policies.get("abnormal_file_access", 0)),
            f"{files} file accesses exceeded the {int(policies.get('max_files_per_window', 8))}-file window limit",
            f"window:{bucket}:files",
        ))
    if searches > int(policies.get("max_searches_per_window", 5)):
        findings.append(_finding(
            "suspicious_behaviour",
            float(policies.get("suspicious_behaviour", 0)),
            f"{searches} searches exceeded the {int(policies.get('max_searches_per_window', 5))}-search window limit",
            f"window:{bucket}:searches",
        ))

    # Detect a short, high-rate burst separately from the five-minute volume rule.
    velocity_seconds = int(policies.get("velocity_burst_window_seconds", 30))
    velocity_cutoff = now - timedelta(seconds=velocity_seconds)
    burst_count = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "file_access",
            ActivityEvent.timestamp >= velocity_cutoff,
        )
        .count()
    )
    if burst_count > int(policies.get("velocity_burst_max_requests", 10)):
        burst_bucket = int(now.timestamp() // max(1, velocity_seconds))
        findings.append(_finding(
            "velocity_burst",
            float(policies.get("velocity_burst", 25)),
            f"{burst_count} resource requests exceeded the short burst limit",
            f"velocity:{burst_bucket}",
        ))

    # Detect sequential resource walking and broad department coverage.
    enumeration_seconds = int(policies.get("resource_enumeration_window_seconds", 60))
    enumeration_events = _recent_session_events(
        db, session.id, now - timedelta(seconds=enumeration_seconds), "file_access"
    )
    enumerated_ids = {
        event.resource_id for event in enumeration_events if event.resource_id is not None
    }
    resources = (
        db.query(Resource)
        .filter(Resource.id.in_(enumerated_ids))
        .all()
        if enumerated_ids else []
    )
    departments = {item.department for item in resources}
    ordered_ids = sorted(enumerated_ids)
    sequential = (
        len(ordered_ids) >= int(policies.get("resource_enumeration_min_sequential", 4))
        and ordered_ids[-1] - ordered_ids[0] <= len(ordered_ids) + 1
    )
    many_resources = len(enumerated_ids) >= int(
        policies.get("resource_enumeration_min_resources", 5)
    )
    many_departments = len(departments) >= int(
        policies.get("resource_enumeration_min_departments", 3)
    )
    if sequential or many_resources or many_departments:
        findings.append(_finding(
            "resource_enumeration",
            float(policies.get("resource_enumeration", 20)),
            "resource IDs or departments were enumerated in a short window",
            f"enumeration:{int(now.timestamp() // max(1, enumeration_seconds))}",
        ))

    # Detect high-risk search terms and raise the finding further when a decoy follows.
    search_cutoff = now - timedelta(minutes=window_minutes)
    search_events = _recent_session_events(db, session.id, search_cutoff, "search")
    credential_terms = re.compile(
        r"(?i)(?:\bpassword\b|\bcredentials?\b|\bsecrets?\b|\btoken\b|"
        r"\bsalary\b|\bbackup\b|\.env)"
    )
    matched_search = any(
        credential_terms.search(str((event.details or {}).get("query", "")))
        for event in search_events
    )
    decoy_in_window = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "decoy_trigger",
            ActivityEvent.timestamp >= search_cutoff,
        )
        .first()
        is not None
    )
    if matched_search:
        credential_risk = float(policies.get("credential_hunting", 15))
        credential_dedup_key = f"credential_hunting:{bucket}"
        if decoy_in_window or is_decoy_triggered(resource):
            base_key = credential_dedup_key
            seen_base = any(
                (event.details or {}).get("_dedup_key") == base_key
                for event in db.query(ActivityEvent)
                .filter(ActivityEvent.session_id == session.id)
                .all()
            )
            credential_dedup_key = f"credential_hunting_decoy:{bucket}"
            credential_risk = float(policies.get("credential_hunting_decoy_bonus", 25))
            if not seen_base:
                credential_risk += float(policies.get("credential_hunting", 15))
        findings.append(_finding(
            "credential_hunting",
            credential_risk,
            "search activity included credential or sensitive-data hunting terms",
            credential_dedup_key,
        ))

    # Detect repeated denies across the user's sessions; a denied token cannot be reused.
    privilege_window = int(policies.get("privilege_probing_window_minutes", 5))
    prior_decisions = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.user_id == user.id,
            ActivityEvent.event_type == "access_decision",
            ActivityEvent.timestamp >= now - timedelta(minutes=privilege_window),
        )
        .order_by(ActivityEvent.timestamp, ActivityEvent.id)
        .all()
    )
    denied_count = sum(
        (event.details or {}).get("decision") == "DENY"
        or (event.details or {}).get("status_code") == 403
        for event in prior_decisions
    )
    if denied_count >= int(policies.get("privilege_probing_min_denials", 2)):
        findings.append(_finding(
            "privilege_probing",
            float(policies.get("privilege_probing", 20)),
            f"{denied_count} denied access attempts occurred in the privilege-probing window",
            f"privilege_probing:{int(now.timestamp() // max(1, privilege_window * 60))}",
        ))

    # Detect implausible travel using only the synthetic locations used by this demo.
    location_events = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type.in_(["login", "location_change"]),
        )
        .order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc())
        .limit(2)
        .all()
    )
    if len(location_events) == 2:
        newest, previous = location_events
        newest_location = str((newest.details or {}).get("location", "")).casefold()
        previous_location = str((previous.details or {}).get("location", "")).casefold()
        if newest_location in DEMO_LOCATIONS and previous_location in DEMO_LOCATIONS:
            elapsed_hours = max(
                (newest.timestamp - previous.timestamp).total_seconds() / 3600,
                1 / 3600,
            )
            speed = _haversine_km(
                DEMO_LOCATIONS[previous_location],
                DEMO_LOCATIONS[newest_location],
            ) / elapsed_hours
            if speed > float(policies.get("impossible_travel_max_speed_kmh", 900)):
                findings.append(_finding(
                    "impossible_travel",
                    float(policies.get("impossible_travel", 25)),
                    "location changed faster than the configured demo travel limit",
                    f"impossible_travel:{previous.id}:{newest.id}",
                ))

    # Detect session-token replay when request context differs from login context.
    login_event = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "login",
        )
        .order_by(ActivityEvent.timestamp.desc(), ActivityEvent.id.desc())
        .first()
    )
    context_events = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type.in_(["file_access", "search"]),
            ActivityEvent.timestamp >= now - timedelta(seconds=enumeration_seconds),
        )
        .order_by(ActivityEvent.timestamp, ActivityEvent.id)
        .all()
    )
    contextual_event = next(
        (
            event for event in reversed(context_events)
            if (event.details or {}).get("client_ip") is not None
            or (event.details or {}).get("user_agent") is not None
        ),
        None,
    )
    if contextual_event is not None and login_event is not None:
        login_details = login_event.details or {}
        current_details = contextual_event.details or {}
        changed = any(
            login_details.get(key) is not None
            and current_details.get(key) is not None
            and login_details.get(key) != current_details.get(key)
            for key in ("client_ip", "user_agent")
        )
        if changed:
            findings.append(_finding(
                "token_context_change",
                float(policies.get("token_context_change", 35)),
                "token request context differs from the context recorded at login",
                f"token_context:{bucket}",
            ))

    # Detect access outside the policy-configured UTC working-hours interval.
    start_hour = int(policies.get("working_hours_start_hour", 8))
    end_hour = int(policies.get("working_hours_end_hour", 18))
    if now.hour < start_hour or now.hour >= end_hour:
        findings.append(_finding(
            "off_hours_access",
            float(policies.get("off_hours_access", 10)),
            "resource access occurred outside configured working hours",
            f"off_hours:{now.date().isoformat()}:{now.hour}",
        ))

    # Detect sensitive-resource accumulation over a long window, even when short windows are quiet.
    slow_minutes = int(policies.get("slow_and_low_window_minutes", 60))
    sensitive_count = (
        db.query(ActivityEvent)
        .join(Resource, ActivityEvent.resource_id == Resource.id)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "file_access",
            ActivityEvent.timestamp >= now - timedelta(minutes=slow_minutes),
            Resource.sensitivity.in_(["high", "critical"]),
        )
        .count()
    )
    if sensitive_count > int(policies.get("slow_and_low_max_sensitive_requests", 5)):
        findings.append(_finding(
            "slow_and_low_exfiltration",
            float(policies.get("slow_and_low_exfiltration", 25)),
            f"{sensitive_count} sensitive accesses accumulated in the long window",
            f"slow_and_low:{int(now.timestamp() // max(1, slow_minutes * 60))}",
        ))

    if resource:
        if resource.department != user.department and user.role != "admin":
            findings.append(_finding(
                "unauthorized_resource",
                float(policies.get("suspicious_behaviour", 0)),
                f"resource department {resource.department} differs from user department {user.department}",
                f"resource:{resource_id}:department",
            ))
        if user.role == "employee" and resource.sensitivity in {"high", "critical"}:
            findings.append(_finding(
                "sensitive_resource_access",
                float(policies.get("suspicious_behaviour", 0)),
                f"{resource.sensitivity} sensitivity resource requested by employee",
                f"resource:{resource_id}:sensitivity",
            ))
        if is_decoy_triggered(resource):
            findings.append(_finding(
                "decoy_interaction",
                float(policies.get("decoy_interaction", 50)),
                "monitored decoy resource accessed",
                f"resource:{resource_id}:decoy",
            ))

    return findings
