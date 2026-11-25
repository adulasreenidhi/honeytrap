"""Repeatable in-process detection and false-positive validation."""

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta
import json
import random
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.activity import ActivityEvent
from app.models.incident import Policy
from app.models.resource import Resource
from app.routes import auth_routes
from app.seed import DEMO_PASSWORD, seed
from app.services import detection_engine
from app.services.detection_engine import DETECTION_RULE_DESCRIPTIONS, MITRE_BY_RULE
from app.routes.report_routes import POLICY_KEY_BY_RULE, SIMULATION_RULE_COVERAGE
from tests.simulations import benign_profiles, scenarios


ATTACK_SCENARIOS = {
    "stolen_credentials_unknown_device": (
        scenarios.stolen_credentials_unknown_device,
        {"unknown_device", "unusual_location"},
    ),
    "insider_data_hoarding": (
        scenarios.insider_data_hoarding,
        {"abnormal_file_access"},
    ),
    "decoy_touch": (scenarios.decoy_touch, {"decoy_interaction"}),
    "slow_and_low": (scenarios.slow_and_low, {"slow_and_low_exfiltration"}),
    "privilege_escalation_probe": (
        scenarios.privilege_escalation_probe,
        {"privilege_probing"},
    ),
    "credential_stuffing": (
        scenarios.credential_stuffing,
        {"login_attack_pattern"},
    ),
    "token_replay": (scenarios.token_replay, {"token_context_change"}),
    "enumeration_scan": (scenarios.enumeration_scan, {"resource_enumeration"}),
}
BENIGN_SCENARIOS = {"benign_control": scenarios.benign_control}
PROFILE_ACTIONS = 220
THRESHOLD_SWEEP = (50, 60, 70, 80, 90)
WEIGHT_MULTIPLIERS = (0.75, 1.25)
TUNING_DECISIONS = [
    {
        "policy_key": "max_searches_per_window",
        "previous_value": 5,
        "final_value": 8,
        "rationale": (
            "The initial 20-repetition baseline triggered suspicious_behaviour "
            "in all 20 engineering-search profiles and one month-end profile, "
            "restricting 15 of 140 benign sessions and flagging 1515 of 26720 "
            "benign actions. The threshold was raised while retaining the rule."
        ),
        "initial_measurement": {
            "benign_sessions_restricted_or_denied": 15,
            "benign_sessions": 140,
            "benign_actions_flagged": 1515,
            "benign_actions": 26720,
            "engineer_profile_rule_runs": 20,
            "month_end_profile_rule_runs": 1,
        },
    }
]
DEFAULT_POLICY_KEYS = {
    "abnormal_file_access",
    "credential_hunting",
    "decoy_interaction",
    "impossible_travel",
    "login_attack_pattern",
    "off_hours_access",
    "privilege_probing",
    "resource_enumeration",
    "slow_and_low_exfiltration",
    "suspicious_behaviour",
    "token_context_change",
    "unknown_device",
    "unusual_location",
    "velocity_burst",
}
_SEEDED_DATABASE_IMAGE: bytes | None = None


class SimulationClock:
    """Mutable clock used by detection rules during local simulations."""

    def __init__(self) -> None:
        self.current = datetime.utcnow() + timedelta(minutes=1)

    def now(self) -> datetime:
        return self.current

    def advance(self, seconds: int = 0, minutes: int = 0) -> None:
        self.current += timedelta(seconds=seconds, minutes=minutes)

    def set_workday(self) -> None:
        self.set_hour(10)

    def set_hour(self, hour: int) -> None:
        self.current = self.current.replace(
            hour=hour, minute=0, second=0, microsecond=0
        )


class RecordingClient:
    """Record each local API action and the first response that contains a session."""

    def __init__(
        self,
        client: TestClient,
        factory: sessionmaker,
        clock: SimulationClock,
        rng: random.Random,
        started_at: datetime,
    ) -> None:
        self._client = client
        self._factory = factory
        self._clock = clock
        self._rng = rng
        self._started_at = started_at
        self.requests: list[dict[str, Any]] = []
        self.containment: dict[str, Any] | None = None

    def __getattr__(self, name: str):
        method = getattr(self._client, name)
        if name not in {"get", "post", "put", "patch", "delete"}:
            return method

        def call(url: str, *args, **kwargs):
            self._clock.advance(self._rng.randint(0, 2))
            response = method(url, *args, **kwargs)
            try:
                body = response.json()
            except ValueError:
                body = {}
            scenarios._assert_no_decoy_metadata(body)
            if not isinstance(body, dict):
                body = {}
            session = body.get("session")
            session_status = session.get("status") if isinstance(session, dict) else None
            decision = body.get("decision")
            rules = body.get("triggered_rules", [])
            if not isinstance(rules, list):
                rules = []
            request_path = url.split("?", 1)[0]
            is_login_failure = request_path == "/api/auth/login" and response.status_code in {401, 429}
            contained = (
                not is_login_failure
                and (
                    decision in {"RESTRICT", "DENY"}
                    or session_status in {"restricted", "denied"}
                    or response.status_code == 403
                )
            )
            item = {
                "endpoint": request_path,
                "status_code": response.status_code,
                "decision": decision,
                "session_status": session_status,
                "triggered_rules": rules,
                "flagged": bool(rules) or contained,
                "elapsed_seconds": max(
                    0.0, (self._clock.now() - self._started_at).total_seconds()
                ),
            }
            self.requests.append(item)
            if contained and self.containment is None:
                with self._factory() as db:
                    item["events_until_containment"] = db.query(
                        ActivityEvent.id
                    ).count()
                self.containment = item.copy()
            return response

        return call


@contextmanager
def simulation_harness(seed_value: int, policy_overrides: dict[str, float] | None = None):
    """Create one isolated SQLite database and TestClient without network traffic."""

    global _SEEDED_DATABASE_IMAGE
    if _SEEDED_DATABASE_IMAGE is None:
        seed_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(seed_engine)
        seed_factory = sessionmaker(
            bind=seed_engine, autoflush=False, autocommit=False
        )
        with seed_factory() as db:
            seed(db)
        seed_connection = seed_engine.raw_connection()
        try:
            _SEEDED_DATABASE_IMAGE = seed_connection.driver_connection.serialize()
        finally:
            seed_connection.close()
            seed_engine.dispose()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    restore_connection = engine.raw_connection()
    try:
        restore_connection.driver_connection.deserialize(_SEEDED_DATABASE_IMAGE)
    finally:
        restore_connection.close()
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as db:
        for rule_key, value in (policy_overrides or {}).items():
            policy = db.query(Policy).filter(Policy.rule_key == rule_key).one()
            policy.value = float(value)
        db.commit()

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    clock = SimulationClock()
    original_clock = detection_engine.utcnow
    detection_engine.utcnow = clock.now
    app.dependency_overrides[get_db] = override_get_db
    with auth_routes._login_rate_lock:
        auth_routes._login_failures.clear()
        auth_routes._login_lockouts.clear()
    client = TestClient(app)
    try:
        yield client, factory, clock, random.Random(seed_value)
    finally:
        client.close()
        app.dependency_overrides.clear()
        detection_engine.utcnow = original_clock
        with auth_routes._login_rate_lock:
            auth_routes._login_failures.clear()
            auth_routes._login_lockouts.clear()
        engine.dispose()


def _policy_defaults() -> dict[str, dict[str, Any]]:
    with simulation_harness(0) as (_, factory, _, _):
        with factory() as db:
            return {
                row.rule_key: {"value": float(row.value), "enabled": bool(row.enabled)}
                for row in db.query(Policy).order_by(Policy.rule_key).all()
            }


def _resource_ids(factory: sessionmaker) -> dict[str, int]:
    with factory() as db:
        return {row.name: row.id for row in db.query(Resource).all()}


def _step_rules(steps: list[dict[str, Any]]) -> set[str]:
    return {
        rule
        for step in steps
        for rule in step.get("triggered_rules", [])
    }


def _run_attack(
    name: str,
    function,
    expected_rules: set[str],
    repetition_seed: int,
    policy_overrides: dict[str, float] | None = None,
) -> dict[str, Any]:
    with simulation_harness(repetition_seed, policy_overrides) as (
        raw_client,
        factory,
        clock,
        rng,
    ):
        clock.set_workday()
        started_at = clock.now()
        client = RecordingClient(raw_client, factory, clock, rng, started_at)
        if name == "credential_stuffing":
            steps = function(client, clock)
        else:
            steps = function(client, factory, clock)
        observed_rules = _step_rules(steps) | _step_rules(client.requests)
        detected = expected_rules.issubset(observed_rules)
        contained = client.containment
        if name == "decoy_touch":
            assert contained is not None and contained["decision"] == "DENY", (
                "The decoy rule must deny access regardless of risk weights."
            )
        return {
            "scenario": name,
            "detected": detected,
            "expected_rules": sorted(expected_rules),
            "rules_fired": sorted(observed_rules),
            "contained": contained is not None,
            "decision_reached": (
                contained["decision"]
                if contained and contained.get("decision")
                else (
                    "DENY" if contained and contained["status_code"] == 403
                    else "RESTRICT" if contained
                    else "ALLOW"
                )
            ),
            "events_until_containment": (
                contained.get("events_until_containment") if contained else None
            ),
            "seconds_until_containment": (
                round(contained["elapsed_seconds"], 2) if contained else None
            ),
            "request_count": len(client.requests),
            "steps": steps,
        }


def _run_benign_scenario(
    name: str,
    function,
    repetition_seed: int,
    policy_overrides: dict[str, float] | None = None,
) -> dict[str, Any]:
    with simulation_harness(repetition_seed, policy_overrides) as (
        raw_client,
        factory,
        clock,
        rng,
    ):
        clock.set_workday()
        client = RecordingClient(raw_client, factory, clock, rng, clock.now())
        steps = function(client, factory, clock)
        rules = _step_rules(steps) | _step_rules(client.requests)
        flagged = sum(item["flagged"] for item in client.requests)
        return {
            "profile": name,
            "session_flagged": client.containment is not None,
            "action_count": len(client.requests),
            "actions_flagged": flagged,
            "rules_fired": sorted(rules),
            "decision_reached": (
                client.containment["decision"] or "DENY"
                if client.containment
                else "ALLOW"
            ),
        }


def _run_benign_profile(
    profile_factory,
    repetition_seed: int,
    action_count: int,
    policy_overrides: dict[str, float] | None = None,
) -> dict[str, Any]:
    profile = profile_factory(repetition_seed, action_count=action_count)
    with simulation_harness(repetition_seed, policy_overrides) as (
        raw_client,
        factory,
        clock,
        rng,
    ):
        clock.set_workday()
        started_at = clock.now()
        client = RecordingClient(raw_client, factory, clock, rng, started_at)
        id_by_name = _resource_ids(factory)
        for _ in range(profile["login_failures"]):
            response = client.post(
                "/api/auth/login",
                headers={"User-Agent": "HoneyGate benign profile"},
                json={
                    "username": profile["username"],
                    "password": "IntentionallyMistypedSyntheticPassword!",
                    "device_id": profile["device_id"],
                    "location": profile["location"],
                },
            )
            assert response.status_code == 401, response.text

        login = client.post(
            "/api/auth/login",
            headers={"User-Agent": "HoneyGate benign profile"},
            json={
                "username": profile["username"],
                "password": DEMO_PASSWORD,
                "device_id": profile["device_id"],
                "location": profile["location"],
            },
        )
        assert login.status_code == 200, login.text
        headers = {
            "Authorization": f"Bearer {login.json()['access_token']}",
            "User-Agent": "HoneyGate benign profile",
        }
        for action in profile["actions"]:
            clock.advance(max(0, action["wait_seconds"] + rng.randint(-10, 10)))
            if action["kind"] == "resource":
                resource_id = id_by_name[action["resource"]]
                client.post(
                    f"/api/access/resource/{resource_id}",
                    headers=headers,
                )
            else:
                client.post(
                    "/api/access/search",
                    headers=headers,
                    params={"q": action["query"]},
                )
        rules = _step_rules(client.requests)
        return {
            "profile": profile["name"],
            "session_flagged": client.containment is not None,
            "action_count": len(client.requests),
            "actions_flagged": sum(item["flagged"] for item in client.requests),
            "rules_fired": sorted(rules),
            "decision_reached": (
                client.containment["decision"] or "DENY"
                if client.containment
                else "ALLOW"
            ),
        }


def _execute_task(task: tuple[Any, ...]) -> dict[str, Any]:
    kind, name, function, rules, task_seed, policy_overrides, action_count = task
    if kind == "attack":
        return _run_attack(
            name,
            function,
            rules,
            task_seed,
            policy_overrides,
        )
    if kind == "benign_scenario":
        return _run_benign_scenario(
            name,
            function,
            task_seed,
            policy_overrides,
        )
    return _run_benign_profile(
        function,
        task_seed,
        action_count,
        policy_overrides,
    )


def _execute_tasks(
    tasks: list[tuple[Any, ...]],
    executor: ProcessPoolExecutor | None,
) -> list[dict[str, Any]]:
    if executor is None:
        return [_execute_task(task) for task in tasks]
    return list(executor.map(_execute_task, tasks, chunksize=1))


def _summarize(
    attacks: list[dict[str, Any]],
    benign: list[dict[str, Any]],
) -> dict[str, Any]:
    attack_count = len(attacks)
    benign_count = len(benign)
    true_positives = sum(item["detected"] for item in attacks)
    false_negatives = attack_count - true_positives
    benign_detected = sum(bool(item["rules_fired"]) for item in benign)
    true_negatives = benign_count - benign_detected
    contained_benign = sum(item["session_flagged"] for item in benign)
    benign_actions = sum(item["action_count"] for item in benign)
    flagged_benign_actions = sum(item["actions_flagged"] for item in benign)
    containment_events = [
        item["events_until_containment"]
        for item in attacks
        if item["events_until_containment"] is not None
    ]
    containment_seconds = [
        item["seconds_until_containment"]
        for item in attacks
        if item["seconds_until_containment"] is not None
    ]
    rule_counts = Counter(
        rule
        for item in attacks + benign
        for rule in item["rules_fired"]
    )
    profile_summary: dict[str, dict[str, Any]] = {}
    for item in benign:
        name = item["profile"]
        result = profile_summary.setdefault(name, {
            "sessions": 0,
            "sessions_restricted_or_denied": 0,
            "actions": 0,
            "actions_flagged": 0,
            "rules": Counter(),
        })
        result["sessions"] += 1
        result["sessions_restricted_or_denied"] += int(item["session_flagged"])
        result["actions"] += item["action_count"]
        result["actions_flagged"] += item["actions_flagged"]
        result["rules"].update(item["rules_fired"])
    for value in profile_summary.values():
        value["rules"] = dict(value["rules"])

    return {
        "detection_rate": true_positives / attack_count if attack_count else 0,
        "false_positive_session_rate": (
            contained_benign / benign_count if benign_count else 0
        ),
        "false_positive_action_rate": (
            flagged_benign_actions / benign_actions if benign_actions else 0
        ),
        "confusion_matrix": {
            "attack_flagged": true_positives,
            "attack_not_flagged": false_negatives,
            "benign_flagged": benign_detected,
            "benign_not_flagged": true_negatives,
            "flagged_means_any_detection_rule": True,
        },
        "mean_events_until_containment": (
            sum(containment_events) / len(containment_events)
            if containment_events else None
        ),
        "max_events_until_containment": max(containment_events) if containment_events else None,
        "mean_seconds_until_containment": (
            sum(containment_seconds) / len(containment_seconds)
            if containment_seconds else None
        ),
        "max_seconds_until_containment": (
            max(containment_seconds) if containment_seconds else None
        ),
        "most_fired_rules": rule_counts.most_common(),
        "benign_profiles": profile_summary,
    }


def _build_baseline(
    repetitions: int,
    seed_value: int,
    actions_per_profile: int,
    executor: ProcessPoolExecutor | None,
) -> dict[str, Any]:
    scheduled: list[tuple[Any, ...]] = []
    profile_factories = benign_profiles.BENIGN_PROFILES
    benign_scenarios = tuple(BENIGN_SCENARIOS.items())
    for repetition in range(repetitions):
        run_seed = seed_value + repetition * 10_007
        tasks = [
            ("attack", name, function, rules)
            for name, (function, rules) in ATTACK_SCENARIOS.items()
        ]
        tasks.extend(
            ("benign_scenario", name, function, set())
            for name, function in benign_scenarios
        )
        tasks.extend(
            ("benign_profile", factory.__name__, factory, set())
            for factory in profile_factories
        )
        random.Random(run_seed).shuffle(tasks)
        for index, (kind, name, function, rules) in enumerate(tasks):
            scheduled.append((
                kind,
                name,
                function,
                rules,
                run_seed + index,
                None,
                actions_per_profile,
            ))
        print(
            f"Prepared baseline repetition {repetition + 1}/{repetitions}",
            flush=True,
        )
    completed = _execute_tasks(scheduled, executor)
    attacks = [item for item in completed if "scenario" in item]
    benign = [item for item in completed if "profile" in item]
    return {
        "attacks": attacks,
        "benign": benign,
        "metrics": _summarize(attacks, benign),
    }


def _sweep_run(
    repetitions: int,
    seed_value: int,
    policy_overrides: dict[str, float],
    action_count: int,
    executor: ProcessPoolExecutor | None,
) -> dict[str, Any]:
    scheduled: list[tuple[Any, ...]] = []
    for repetition in range(repetitions):
        run_seed = seed_value + repetition * 10_007
        tasks = [
            ("attack", name, function, rules)
            for name, (function, rules) in ATTACK_SCENARIOS.items()
        ]
        tasks.extend(
            ("benign_scenario", name, function, set())
            for name, function in BENIGN_SCENARIOS.items()
        )
        tasks.extend(
            ("benign_profile", factory.__name__, factory, set())
            for factory in benign_profiles.BENIGN_PROFILES
        )
        random.Random(run_seed).shuffle(tasks)
        for index, (kind, name, function, rules) in enumerate(tasks):
            scheduled.append((
                kind,
                name,
                function,
                rules,
                run_seed + index,
                policy_overrides,
                action_count,
            ))
    completed = _execute_tasks(scheduled, executor)
    attacks = [item for item in completed if "scenario" in item]
    benign = [item for item in completed if "profile" in item]
    return _summarize(attacks, benign)


def _run_sensitivity_sweep(
    repetitions: int,
    seed_value: int,
    policy_defaults: dict[str, dict[str, Any]],
    action_count: int,
    executor: ProcessPoolExecutor | None,
) -> list[dict[str, Any]]:
    sweep_repetitions = min(2, repetitions)
    results = []
    for threshold in THRESHOLD_SWEEP:
        metrics = _sweep_run(
            sweep_repetitions,
            seed_value,
            {"restrict_threshold": float(threshold)},
            action_count,
            executor,
        )
        results.append({
            "kind": "restrict_threshold",
            "policy_key": "restrict_threshold",
            "value": threshold,
            "repetitions": sweep_repetitions,
            **{
                key: metrics[key]
                for key in (
                    "detection_rate",
                    "false_positive_session_rate",
                    "false_positive_action_rate",
                )
            },
        })

    for policy_key in sorted(DEFAULT_POLICY_KEYS):
        current = policy_defaults[policy_key]["value"]
        for multiplier in WEIGHT_MULTIPLIERS:
            value = max(0.0, min(100.0, current * multiplier))
            metrics = _sweep_run(
                sweep_repetitions,
                seed_value,
                {policy_key: value},
                action_count,
                executor,
            )
            results.append({
                "kind": "risk_weight",
                "policy_key": policy_key,
                "value": round(value, 2),
                "multiplier": multiplier,
                "repetitions": sweep_repetitions,
                **{
                    key: metrics[key]
                    for key in (
                        "detection_rate",
                        "false_positive_session_rate",
                        "false_positive_action_rate",
                    )
                },
            })
    return results


def _percent(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.2f}%"


def _render_report(results: dict[str, Any], report_path: Path) -> None:
    metrics = results["metrics"]
    scenario_rows = []
    for name in sorted(ATTACK_SCENARIOS):
        runs = [
            item
            for item in results["attack_scenarios"]
            if item["scenario"] == name
        ]
        successes = sum(item["detected"] for item in runs)
        containments = [
            item for item in runs if item["events_until_containment"] is not None
        ]
        mean_events = (
            sum(item["events_until_containment"] for item in containments)
            / len(containments)
            if containments else None
        )
        mean_seconds = (
            sum(item["seconds_until_containment"] for item in containments)
            / len(containments)
            if containments else None
        )
        rules = sorted({rule for item in runs for rule in item["rules_fired"]})
        scenario_rows.append(
            f"| {name} | {successes}/{len(runs)} ({_percent(successes / len(runs) if runs else 0)}) "
            f"| {', '.join(rules) or 'none'} | "
            f"{mean_events:.1f} | {mean_seconds:.2f}" if mean_events is not None else
            f"| {name} | {successes}/{len(runs)} ({_percent(successes / len(runs) if runs else 0)}) "
            f"| {', '.join(rules) or 'none'} | n/a | n/a"
        )
    profile_rows = []
    for name, item in sorted(metrics["benign_profiles"].items()):
        session_rate = (
            item["sessions_restricted_or_denied"] / item["sessions"]
            if item["sessions"] else 0
        )
        action_rate = item["actions_flagged"] / item["actions"] if item["actions"] else 0
        profile_rows.append(
            f"| {name} | {item['sessions_restricted_or_denied']}/{item['sessions']} "
            f"({_percent(session_rate)}) | {item['actions_flagged']}/{item['actions']} "
            f"({_percent(action_rate)}) | {', '.join(sorted(item['rules'])) or 'none'} |"
        )
    sweep_rows = [
        f"| {item['kind']} | {item['policy_key']} | {item['value']} | "
        f"{_percent(item['detection_rate'])} | "
        f"{_percent(item['false_positive_session_rate'])} | "
        f"{_percent(item['false_positive_action_rate'])} |"
        for item in results["sensitivity_sweep"]
    ]
    policy_rows = [
        f"| {key} | {value['value']:g} | {'yes' if value['enabled'] else 'no'} |"
        for key, value in sorted(results["policy_defaults"].items())
    ]
    mitre_rows = []
    for rule_key, technique in sorted(MITRE_BY_RULE.items()):
        policy_key = POLICY_KEY_BY_RULE.get(rule_key, rule_key)
        policy = results["policy_defaults"].get(policy_key, {})
        scenarios_for_rule = SIMULATION_RULE_COVERAGE.get(rule_key, [])
        mitre_rows.append(
            f"| {rule_key} | {DETECTION_RULE_DESCRIPTIONS[rule_key]} | {technique} | "
            f"{policy.get('value', 'n/a')} | "
            f"{'yes' if policy.get('enabled', False) else 'no'} | "
            f"{', '.join(scenarios_for_rule) or 'UNCOVERED'} |"
        )

    mean_events = metrics["mean_events_until_containment"]
    max_events = metrics["max_events_until_containment"]
    mean_seconds = metrics["mean_seconds_until_containment"]
    max_seconds = metrics["max_seconds_until_containment"]
    report = f"""# HoneyGate Detection Validation Report

## Methodology

All activity was generated in-process through FastAPI `TestClient` against synthetic seed data in a fresh in-memory SQLite database per run. No external hosts or network traffic were used. The baseline uses seed `{results['seed']}`, {results['repetitions']} repetitions, and {results['profile_action_count']} deterministic seeded-random actions per benign profile. Attack/profile order is shuffled from the run seed, with 0–2 seconds of request jitter; profile action intervals receive additional ±10-second variation. Measurements below are from the most recent validation run recorded in `tests/simulations/results.json`.

An attack is a true positive when its required scenario-specific rule set fires. Confusion-matrix “flagged” means any detection rule fired. The session false-positive rate counts benign sessions that receive RESTRICT or DENY; the action false-positive rate counts benign API actions with a rule finding or RESTRICT/DENY response. Failed login attempts that return 401 without a detection finding are not counted as a false positive.

## Headline results

- Attack detection rate: **{_percent(metrics['detection_rate'])}** ({metrics['confusion_matrix']['attack_flagged']}/{metrics['confusion_matrix']['attack_flagged'] + metrics['confusion_matrix']['attack_not_flagged']})
- Benign-session RESTRICT/DENY rate: **{_percent(metrics['false_positive_session_rate'])}**
- Benign-action flagged rate: **{_percent(metrics['false_positive_action_rate'])}**
- Confusion matrix (attack/benign × flagged/not flagged): TP {metrics['confusion_matrix']['attack_flagged']}, FN {metrics['confusion_matrix']['attack_not_flagged']}, FP {metrics['confusion_matrix']['benign_flagged']}, TN {metrics['confusion_matrix']['benign_not_flagged']}
- Time to contain: mean **{mean_events:.1f} ActivityEvents** / **{mean_seconds:.2f} seconds**; maximum **{max_events} ActivityEvents** / **{max_seconds:.2f} seconds**{'' if mean_events is not None else ' (no containment observed)'}
- Most-fired rules: {', '.join(f"{rule} ({count})" for rule, count in metrics['most_fired_rules'][:5]) or 'none'}

## Attack scenario results

| Scenario | Detection | Rules observed | Mean ActivityEvents to containment | Mean seconds to containment |
|---|---:|---|---:|---:|
{chr(10).join(scenario_rows)}

## Benign profile results

| Profile | Sessions RESTRICTED/DENIED | Actions flagged | Rules observed |
|---|---:|---:|---|
{chr(10).join(profile_rows)}

The six profiles represent HR policy reading, Finance file review, engineering documentation search, registered-device travel, month-end reporting, and two mistyped passwords. Any non-zero benign finding is reported above with its rule key; the profile and rule should be reviewed before interpreting aggregate rates as production performance.

## Sensitivity sweep

The sweep uses {results['sweep_repetitions']} repetition(s) per setting and {results['sweep_action_count']} actions per benign profile to make one-factor-at-a-time parameter comparisons reproducible. It varies the restrict threshold over 50/60/70/80/90 and each seeded risk weight independently at 0.75× and 1.25×. These are calibration measurements on a smaller sample, not the headline baseline. Decoy touches are asserted to remain DENY at every tested setting.

| Sweep | Policy | Value | Detection rate | Benign-session RESTRICT/DENY | Benign-action flagged |
|---|---|---:|---:|---:|---:|
{chr(10).join(sweep_rows)}

## Seeded defaults used

The values below are the final seeded defaults evaluated by the run. The final measured benign rates are {_percent(metrics['false_positive_session_rate'])} for contained sessions and {_percent(metrics['false_positive_action_rate'])} for flagged actions. The decoy response remains an unconditional DENY regardless of score or weight.

| Policy key | Value | Enabled |
|---|---:|---|
{chr(10).join(policy_rows)}

### Applied tuning

The initial 20-repetition run with `max_searches_per_window=5` produced `suspicious_behaviour` findings in all 20 engineering-search runs and one month-end run, restricting 15/140 benign sessions and flagging 1515/26720 benign actions. The search-volume threshold was raised to 8 while preserving the finding and its risk weight; the targeted simulation now sends ten searches inside five minutes to prove the rule still fires. The final-run benign rates above measure this change. The decoy weight and unconditional DENY behavior were not weakened.

## MITRE ATT&CK mapping and simulation coverage

| Rule | Description | Technique | Weight | Enabled | Covering simulation |
|---|---|---|---:|---|---|
{chr(10).join(mitre_rows)}

An `UNCOVERED` entry indicates the API coverage metadata reports no associated simulation scenario and requires follow-up test coverage.

## Limitations

- Data and user identities are synthetic; results are not a guarantee of production performance.
- Access and response actions are simulated locally. No external network or real endpoint is exercised.
- Detection is rule-based, not machine learning, and policy values are demonstration defaults.
- Demo-location travel calculations and the in-memory SQLite database do not represent full production geography, concurrency, or persistence.
- Decoys are indicators of compromise requiring investigation, not proof of identity or malicious intent.
- Randomized actions are deterministic for the recorded seed; different workflows and timing distributions may yield different results.

## Recommended next steps

1. Review every benign finding in the profile table and tune only the responsible rule/threshold; do not weaken the decoy DENY.
2. Expand labeled benign and attack simulations from observed, privacy-reviewed workflows.
3. Validate policy changes against held-out seeds and report confidence intervals before deployment.
4. Move rate limiting and audit-chain state to durable shared infrastructure before multi-worker production use.
5. Monitor audit-chain failures and treat detection results as indicators of compromise requiring investigation.

## Frontend follow-up note

The frontend can display `mitre_attack_id` on timeline events, `evidence_integrity` and `audit_integrity` status on incident reports, and the detection-coverage table fields `rule_key`, `description`, `mitre_attack_id`, `technique_name`, `current_weight`, `enabled`, and `simulation_covered`.
"""
    report_path.write_text(report, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repetitions", type=int, default=20)
    parser.add_argument("--seed", type=int, default=20_260_604)
    parser.add_argument("--actions-per-profile", type=int, default=PROFILE_ACTIONS)
    parser.add_argument("--sweep-actions", type=int, default=20)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--skip-sweep", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("results.json"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path(__file__).parents[2] / "DETECTION_REPORT.md",
    )
    args = parser.parse_args()
    if (
        args.repetitions < 1
        or args.actions_per_profile < 1
        or args.sweep_actions < 1
        or args.workers < 1
    ):
        parser.error("repetitions, action counts, and workers must be positive")

    print(
        f"Running {args.repetitions} baseline repetitions "
        f"({args.actions_per_profile} actions/profile)...",
        flush=True,
    )
    defaults = _policy_defaults()
    executor = (
        ProcessPoolExecutor(max_workers=args.workers)
        if args.workers > 1
        else None
    )
    try:
        baseline = _build_baseline(
            args.repetitions,
            args.seed,
            args.actions_per_profile,
            executor,
        )
        sweep = []
        if not args.skip_sweep:
            print("Running one-factor-at-a-time sensitivity sweep...", flush=True)
            sweep = _run_sensitivity_sweep(
                args.repetitions,
                args.seed,
                defaults,
                args.sweep_actions,
                executor,
            )
    finally:
        if executor is not None:
            executor.shutdown(wait=True)
    results = {
        "seed": args.seed,
        "repetitions": args.repetitions,
        "workers": args.workers,
        "profile_action_count": args.actions_per_profile,
        "sweep_repetitions": min(2, args.repetitions),
        "sweep_action_count": args.sweep_actions,
        "policy_defaults": defaults,
        "tuning_decisions": TUNING_DECISIONS,
        "attack_scenarios": baseline["attacks"],
        "benign_runs": baseline["benign"],
        "metrics": baseline["metrics"],
        "sensitivity_sweep": sweep,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    if not args.skip_sweep:
        _render_report(results, args.report)

    metrics = results["metrics"]
    print("\nScenario detection:")
    print("| Scenario | Detected | Decision | Rules fired | Events to contain |")
    print("|---|---:|---|---|---:|")
    for name in sorted(ATTACK_SCENARIOS):
        runs = [item for item in baseline["attacks"] if item["scenario"] == name]
        detected = sum(item["detected"] for item in runs)
        decisions = Counter(item["decision_reached"] for item in runs)
        rules = sorted({rule for item in runs for rule in item["rules_fired"]})
        event_values = [
            item["events_until_containment"]
            for item in runs
            if item["events_until_containment"] is not None
        ]
        mean_events = (
            f"{sum(event_values) / len(event_values):.1f}" if event_values else "n/a"
        )
        decision_text = ", ".join(
            f"{key} {count}" for key, count in sorted(decisions.items())
        )
        print(
            f"| {name} | {detected}/{len(runs)} | {decision_text} | "
            f"{', '.join(rules)} | {mean_events} |"
        )
    print("\nBenign profiles:")
    print("| Profile | Sessions restricted/denied | Actions flagged | Rules |")
    print("|---|---:|---:|---|")
    for name, item in sorted(metrics["benign_profiles"].items()):
        print(
            f"| {name} | {item['sessions_restricted_or_denied']}/{item['sessions']} | "
            f"{item['actions_flagged']}/{item['actions']} | "
            f"{', '.join(sorted(item['rules'])) or 'none'} |"
        )
    print("\nHeadline:")
    print(f"- Attack detection rate: {_percent(metrics['detection_rate'])}")
    print(f"- Benign-session false-positive rate: {_percent(metrics['false_positive_session_rate'])}")
    print(f"- Benign-action flagged rate: {_percent(metrics['false_positive_action_rate'])}")
    print(
        f"- Mean/max containment: {metrics['mean_events_until_containment']} / "
        f"{metrics['max_events_until_containment']} events; "
        f"{metrics['mean_seconds_until_containment']} / "
        f"{metrics['max_seconds_until_containment']} seconds"
    )
    print(
        "- Most-fired rules: "
        + (", ".join(
            f"{rule} ({count})" for rule, count in metrics["most_fired_rules"][:5]
        ) or "none")
    )
    print(f"- Results written to {args.output}")
    if not args.skip_sweep:
        print(f"- Report written to {args.report}")


if __name__ == "__main__":
    main()
