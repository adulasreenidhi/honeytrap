"""Tamper-evident chaining for ActivityEvent records and incident snapshots."""

import hashlib
import hmac
import json
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session as OrmSession

from app.models.activity import ActivityEvent

AUDIT_DETAILS_KEY = "_audit_integrity"
GENESIS_HASH = "0" * 64


def _without_audit_metadata(details: dict[str, Any] | None) -> dict[str, Any]:
    values = dict(details or {})
    values.pop(AUDIT_DETAILS_KEY, None)
    return values


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")


def compute_event_hash(event: ActivityEvent, prev_hash: str) -> str:
    """Hash canonical event fields together with the preceding event hash."""

    canonical = {
        "id": event.id,
        "session_id": event.session_id,
        "user_id": event.user_id,
        "resource_id": event.resource_id,
        "event_type": event.event_type,
        "severity": event.severity,
        "risk_points": event.risk_points,
        "details": _without_audit_metadata(event.details),
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "prev_hash": prev_hash,
    }
    return hashlib.sha256(_canonical_json(canonical)).hexdigest()


def compute_snapshot_digest(snapshot: dict[str, Any]) -> str:
    """Hash an incident snapshot, excluding its own digest field."""

    canonical = {
        key: value
        for key, value in snapshot.items()
        if key != "sha256_digest"
    }
    return hashlib.sha256(_canonical_json(canonical)).hexdigest()


def seal_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    sealed = dict(snapshot)
    sealed["sha256_digest"] = compute_snapshot_digest(sealed)
    return sealed


def verify_snapshot(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    snapshot = snapshot or {}
    stored = snapshot.get("sha256_digest")
    computed = compute_snapshot_digest(snapshot)
    valid = isinstance(stored, str) and hmac.compare_digest(stored, computed)
    return {
        "valid": valid,
        "stored_sha256": stored,
        "computed_sha256": computed,
    }


def _set_audit_metadata(
    activity_event: ActivityEvent,
    prev_hash: str,
    prev_event_id: int | None,
    next_event_id: int | None,
) -> None:
    metadata = {
        "prev_hash": prev_hash,
        "prev_event_id": prev_event_id,
        "event_hash": compute_event_hash(activity_event, prev_hash),
        "next_event_id": next_event_id,
    }
    details = _without_audit_metadata(activity_event.details)
    details[AUDIT_DETAILS_KEY] = metadata
    activity_event.details = details


def initialize_chain(db: OrmSession) -> None:
    """Backfill the complete legacy event log once before serving requests."""

    events = (
        db.query(ActivityEvent)
        .order_by(ActivityEvent.id)
        .all()
    )
    if not events or any(
        (activity_event.details or {}).get(AUDIT_DETAILS_KEY)
        for activity_event in events
    ):
        return

    previous_hash = GENESIS_HASH
    previous_id = None
    for index, activity_event in enumerate(events):
        next_id = events[index + 1].id if index + 1 < len(events) else None
        _set_audit_metadata(activity_event, previous_hash, previous_id, next_id)
        previous_hash = activity_event.details[AUDIT_DETAILS_KEY]["event_hash"]
        previous_id = activity_event.id
    db.commit()


def verify_chain(db: OrmSession) -> dict[str, Any]:
    """Verify all event hashes and links, reporting the earliest broken row or gap."""

    events = db.query(ActivityEvent).order_by(ActivityEvent.id).all()
    ids = {activity_event.id for activity_event in events}
    previous_hash = GENESIS_HASH
    previous_id = None

    for index, activity_event in enumerate(events):
        checked = index + 1
        metadata = (activity_event.details or {}).get(AUDIT_DETAILS_KEY)
        if not isinstance(metadata, dict):
            return {
                "valid": False,
                "checked": checked,
                "first_broken_event_id": activity_event.id,
            }

        recorded_previous_id = metadata.get("prev_event_id")
        if recorded_previous_id != previous_id:
            broken_id = (
                recorded_previous_id
                if recorded_previous_id is not None and recorded_previous_id not in ids
                else activity_event.id
            )
            return {
                "valid": False,
                "checked": checked,
                "first_broken_event_id": broken_id,
            }
        if metadata.get("prev_hash") != previous_hash:
            return {
                "valid": False,
                "checked": checked,
                "first_broken_event_id": activity_event.id,
            }
        expected_hash = compute_event_hash(activity_event, previous_hash)
        stored_hash = metadata.get("event_hash")
        if not isinstance(stored_hash, str) or not hmac.compare_digest(
            stored_hash, expected_hash
        ):
            return {
                "valid": False,
                "checked": checked,
                "first_broken_event_id": activity_event.id,
            }

        expected_next_id = events[index + 1].id if index + 1 < len(events) else None
        recorded_next_id = metadata.get("next_event_id")
        if recorded_next_id != expected_next_id:
            broken_id = (
                recorded_next_id
                if recorded_next_id is not None and recorded_next_id not in ids
                else activity_event.id
            )
            return {
                "valid": False,
                "checked": checked,
                "first_broken_event_id": broken_id,
            }
        previous_hash = stored_hash
        previous_id = activity_event.id

    return {
        "valid": True,
        "checked": len(events),
        "first_broken_event_id": None,
    }


def _before_flush(db: OrmSession, _flush_context, _instances) -> None:
    pending = db.info.setdefault("_audit_pending_activity_events", [])
    for activity_event in db.new:
        if isinstance(activity_event, ActivityEvent) and activity_event not in pending:
            pending.append(activity_event)


def _after_flush_postexec(db: OrmSession, _flush_context) -> None:
    pending = db.info.pop("_audit_pending_activity_events", [])
    new_events = sorted(
        (activity_event for activity_event in pending if activity_event.id is not None),
        key=lambda activity_event: activity_event.id,
    )
    if not new_events:
        return

    with db.no_autoflush:
        prior = (
            db.query(ActivityEvent)
            .filter(ActivityEvent.id < new_events[0].id)
            .order_by(ActivityEvent.id.desc())
            .first()
        )
    if prior is not None and not (prior.details or {}).get(AUDIT_DETAILS_KEY):
        raise RuntimeError("Activity event audit chain must be initialized before appending")

    previous_hash = (
        (prior.details or {}).get(AUDIT_DETAILS_KEY, {}).get("event_hash")
        if prior is not None else GENESIS_HASH
    )
    previous_id = prior.id if prior is not None else None
    for activity_event in new_events:
        if prior is not None:
            details = _without_audit_metadata(prior.details)
            metadata = dict((prior.details or {}).get(AUDIT_DETAILS_KEY, {}))
            metadata["next_event_id"] = activity_event.id
            details[AUDIT_DETAILS_KEY] = metadata
            prior.details = details
        _set_audit_metadata(
            activity_event,
            previous_hash,
            previous_id,
            None,
        )
        previous_hash = activity_event.details[AUDIT_DETAILS_KEY]["event_hash"]
        previous_id = activity_event.id
        prior = activity_event


event.listen(OrmSession, "before_flush", _before_flush)
event.listen(OrmSession, "after_flush_postexec", _after_flush_postexec)
