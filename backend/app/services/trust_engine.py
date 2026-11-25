"""Pure, bounded trust scoring with persisted history."""

from dataclasses import dataclass
from datetime import timedelta
from typing import Iterable

from sqlalchemy.orm import Session

from app.services import detection_engine
from app.models.activity import ActivityEvent
from app.models.session import Session as SessionModel
from app.models.session import TrustHistory
from app.services.detection_engine import Finding


@dataclass(frozen=True)
class TrustAssessment:
    score: int
    previous_score: int
    delta: float
    contributing_factors: list[str]


def bounded_score(score: int | float) -> int:
    """Clamp a trust score to the inclusive 0-100 range."""

    return max(0, min(100, int(score)))


def apply_risk(previous_score: int | float, findings: Iterable[Finding]) -> tuple[int, list[str]]:
    """Purely apply finding weights to a score."""

    score = bounded_score(previous_score)
    factors: list[str] = []
    for finding in findings:
        score = bounded_score(score - finding.risk_points)
        factors.append(f"{finding.rule_key} (+{int(finding.risk_points)}): {finding.reason}")
    return score, factors


def _existing_dedup_keys(db: Session, session_id: int) -> set[str]:
    events = db.query(ActivityEvent).filter(ActivityEvent.session_id == session_id).all()
    keys: set[str] = set()
    for event in events:
        details = event.details or {}
        key = details.get("_dedup_key")
        if key:
            keys.add(str(key))
    return keys


def _finding_key(finding: Finding) -> str:
    """Build a stable fallback key for externally constructed findings."""

    return finding.dedup_key or f"{finding.rule_key}:{finding.reason}"


def recalculate(db: Session, session: SessionModel, findings: list[Finding]) -> TrustAssessment:
    """Apply unseen findings and cautiously restore trust after sustained normal activity."""

    previous = bounded_score(session.trust_score)
    seen = _existing_dedup_keys(db, session.id)
    unseen = [finding for finding in findings if _finding_key(finding) not in seen]
    new_score, factors = apply_risk(previous, unseen)

    for finding in unseen:
        event = ActivityEvent(
            session_id=session.id,
            user_id=session.user_id,
            resource_id=None,
            event_type="verification" if finding.rule_key.endswith("_device") else "sensitive_request",
            severity="critical" if finding.rule_key == "decoy_interaction" else "medium",
            risk_points=int(finding.risk_points),
            details={
                "_dedup_key": _finding_key(finding),
                "rule_key": finding.rule_key,
                "reason": finding.reason,
                "mitre_attack_id": finding.mitre_attack_id,
            },
            timestamp=detection_engine.utcnow(),
        )
        db.add(event)

    now = detection_engine.utcnow()
    decoy_seen = (
        db.query(ActivityEvent)
        .filter(
            ActivityEvent.session_id == session.id,
            ActivityEvent.event_type == "decoy_trigger",
        )
        .first()
        is not None
    )
    if not findings and not unseen and new_score < 100 and not decoy_seen and session.status not in {"denied", "ended"}:
        policies = detection_engine.policy_values(db)
        interval = int(policies.get("risk_decay_interval_minutes", 15))
        latest_history = (
            db.query(TrustHistory)
            .filter(TrustHistory.session_id == session.id)
            .order_by(TrustHistory.timestamp.desc(), TrustHistory.id.desc())
            .first()
        )
        if (
            latest_history is not None
            and latest_history.timestamp <= now - timedelta(minutes=interval)
        ):
            points = float(policies.get("risk_decay_points", 2))
            new_score = bounded_score(new_score + points)
            if new_score > previous:
                factors.append(f"risk_decay (+{new_score - previous}): sustained normal activity")

    delta = float(new_score - previous)
    if delta:
        session.trust_score = new_score
        db.add(TrustHistory(
            session_id=session.id,
            score=float(new_score),
            delta=delta,
            reason="risk_decay" if delta > 0 else "continuous_monitoring",
            timestamp=now,
        ))
    db.flush()
    return TrustAssessment(
        score=new_score,
        previous_score=previous,
        delta=delta,
        contributing_factors=factors,
    )
