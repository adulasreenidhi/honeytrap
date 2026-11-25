"""Seeded, synthetic employee activity profiles for false-positive testing."""

import random
from typing import Any


def _build_profile(
    *,
    name: str,
    username: str,
    location: str,
    resource_names: tuple[str, ...],
    search_terms: tuple[str, ...],
    seed: int,
    action_count: int,
    search_ratio: float = 0.15,
    login_failures: int = 0,
) -> dict[str, Any]:
    rng = random.Random(seed)
    actions = []
    for _ in range(action_count):
        wait_seconds = rng.randint(30, 105)
        if search_terms and rng.random() < search_ratio:
            actions.append({
                "kind": "search",
                "query": rng.choice(search_terms),
                "wait_seconds": wait_seconds,
            })
        else:
            actions.append({
                "kind": "resource",
                "resource": rng.choice(resource_names),
                "wait_seconds": wait_seconds,
            })
    rng.shuffle(actions)
    return {
        "name": name,
        "username": username,
        "device_id": "dev-registered-001",
        "location": location,
        "login_failures": login_failures,
        "actions": actions,
    }


def hr_clerk(seed: int, action_count: int = 220) -> dict[str, Any]:
    """Routine policy and onboarding-document reads."""

    return _build_profile(
        name="hr_clerk",
        username="maya.hr",
        location="New York",
        resource_names=(
            "HR_Policy_Handbook.pdf",
            "Benefits_Overview.docx",
            "Employee_Onboarding_Checklist.pdf",
            "Training_Materials.zip",
        ),
        search_terms=("leave policy", "benefits overview", "onboarding checklist"),
        seed=seed,
        action_count=action_count,
        search_ratio=0.12,
    )


def finance_analyst(seed: int, action_count: int = 220) -> dict[str, Any]:
    """Repeatedly reviews ordinary, non-sensitive files in Finance."""

    return _build_profile(
        name="finance_analyst",
        username="liam.finance",
        location="New York",
        resource_names=(
            "Payroll_Schedule_Template.xlsx",
            "Expense_Approval_Workflow.pdf",
            "Vendor_List_Sample.csv",
        ),
        search_terms=("quarterly reporting template", "expense workflow", "vendor list"),
        seed=seed,
        action_count=action_count,
        search_ratio=0.1,
    )


def engineer_document_research(seed: int, action_count: int = 220) -> dict[str, Any]:
    """Searches documentation and occasionally opens routine engineering guides."""

    return _build_profile(
        name="engineer_document_research",
        username="zoe.engineering",
        location="Austin",
        resource_names=(
            "Platform_Roadmap.docx",
            "API_Integration_Guide.pdf",
            "Release_Checklist.xlsx",
        ),
        search_terms=(
            "release checklist",
            "platform roadmap",
            "API integration guide",
            "build documentation",
        ),
        seed=seed,
        action_count=action_count,
        search_ratio=0.72,
    )


def registered_device_legitimate_travel(seed: int, action_count: int = 220) -> dict[str, Any]:
    """Uses a registered device from a recognized but non-usual demo location."""

    return _build_profile(
        name="registered_device_legitimate_travel",
        username="maya.hr",
        location="London",
        resource_names=(
            "HR_Policy_Handbook.pdf",
            "Benefits_Overview.docx",
            "Employee_Onboarding_Checklist.pdf",
        ),
        search_terms=("HR policy", "benefits", "onboarding"),
        seed=seed,
        action_count=action_count,
        search_ratio=0.2,
    )


def month_end_report_crunch(seed: int, action_count: int = 220) -> dict[str, Any]:
    """Runs a longer work session over ordinary Finance reports and templates."""

    return _build_profile(
        name="month_end_report_crunch",
        username="liam.finance",
        location="New York",
        resource_names=(
            "Payroll_Schedule_Template.xlsx",
            "Expense_Approval_Workflow.pdf",
            "Vendor_List_Sample.csv",
        ),
        search_terms=("month end checklist", "expense totals", "report template"),
        seed=seed,
        action_count=action_count,
        search_ratio=0.28,
    )


def two_password_typos(seed: int, action_count: int = 220) -> dict[str, Any]:
    """Makes two password typos, then performs normal HR work after login."""

    return _build_profile(
        name="two_password_typos",
        username="maya.hr",
        location="New York",
        resource_names=(
            "HR_Policy_Handbook.pdf",
            "Benefits_Overview.docx",
            "Employee_Onboarding_Checklist.pdf",
        ),
        search_terms=("benefits", "policy", "onboarding"),
        seed=seed,
        action_count=action_count,
        search_ratio=0.12,
        login_failures=2,
    )


BENIGN_PROFILES = (
    hr_clerk,
    finance_analyst,
    engineer_document_research,
    registered_device_legitimate_travel,
    month_end_report_crunch,
    two_password_typos,
)
