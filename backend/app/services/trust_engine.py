"""Pure, bounded trust scoring with persisted history."""

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

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
    """Apply only unseen finding keys and write history on a score change."""

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
            details={"_dedup_key": _finding_key(finding), "rule_key": finding.rule_key, "reason": finding.reason},
            timestamp=datetime.utcnow(),
        )
        db.add(event)

    delta = float(new_score - previous)
    if delta:
        session.trust_score = new_score
        db.add(TrustHistory(
            session_id=session.id,
            score=float(new_score),
            delta=delta,
            reason="continuous_monitoring",
            timestamp=datetime.utcnow(),
        ))
    db.flush()
    return TrustAssessment(
        score=new_score,
        previous_score=previous,
        delta=delta,
        contributing_factors=factors,
    )
