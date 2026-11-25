"""Idempotent demo data seeding."""

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models.incident import Policy
from app.models.resource import Resource
from app.models.user import Device, User

DEMO_PASSWORD = "HoneyGate!Demo2026"


def seed(db: Session) -> None:
    """Populate HoneyGate with safe demo users, devices, resources, and policies."""

    users = [
        ("admin", "admin@honeygate.demo", "admin", "Admin"),
        ("analyst", "analyst@honeygate.demo", "analyst", "Admin"),
        ("maya.hr", "maya.hr@honeygate.demo", "employee", "HR"),
        ("liam.finance", "liam.finance@honeygate.demo", "employee", "Finance"),
        ("zoe.engineering", "zoe.engineering@honeygate.demo", "employee", "Engineering"),
        ("noah.admin", "noah.admin@honeygate.demo", "employee", "Admin"),
        ("eva.hr", "eva.hr@honeygate.demo", "employee", "HR"),
    ]
    for username, email, role, department in users:
        if db.query(User).filter(User.username == username).first():
            continue
        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(DEMO_PASSWORD),
            role=role,
            department=department,
            status="active",
            registered_device_id="dev-registered-001" if username != "eva.hr" else "dev-unverified-003",
            usual_location="New York" if department != "Engineering" else "Austin",
        )
        db.add(user)

    devices = [
        ("dev-registered-001", "Corporate Laptop", "registered"),
        ("dev-unknown-002", "Unknown Mobile", "unknown"),
        ("dev-unverified-003", "Temporary Workstation", "unverified"),
        ("dev-revoked-004", "Retired Laptop", "revoked"),
    ]
    for device_id, label, status in devices:
        if db.query(Device).filter(Device.device_id == device_id).first():
            continue
        db.add(Device(device_id=device_id, label=label, status=status))

    normal_resources = [
        ("HR_Policy_Handbook.pdf", "document", "HR", "medium"),
        ("Benefits_Overview.docx", "document", "HR", "low"),
        ("Employee_Onboarding_Checklist.pdf", "document", "HR", "low"),
        ("Payroll_Schedule_Template.xlsx", "finance", "Finance", "medium"),
        ("Quarterly_Budget_Plan.xlsx", "finance", "Finance", "high"),
        ("Expense_Approval_Workflow.pdf", "finance", "Finance", "medium"),
        ("Vendor_List_Sample.csv", "finance", "Finance", "low"),
        ("Platform_Roadmap.docx", "project", "Engineering", "medium"),
        ("API_Integration_Guide.pdf", "document", "Engineering", "medium"),
        ("Release_Checklist.xlsx", "project", "Engineering", "medium"),
        ("Architecture_Diagram.svg", "project", "Engineering", "high"),
        ("Test_Environment_Catalog.csv", "project", "Engineering", "low"),
        ("Incident_Response_Playbook.pdf", "admin", "Admin", "high"),
        ("Support_Runbook.docx", "admin", "Admin", "high"),
        ("Office_Access_Policy.pdf", "document", "Admin", "medium"),
        ("Service_Account_Inventory.xlsx", "credential", "Admin", "high"),
        ("Conference_Room_Schedule.xlsx", "document", "Admin", "low"),
        ("Engineering_Hiring_Plan.docx", "project", "Engineering", "medium"),
        ("Training_Materials.zip", "document", "HR", "low"),
        ("Audit_Reference_Report.pdf", "document", "Admin", "critical"),
    ]
    for name, resource_type, department, sensitivity in normal_resources:
        if db.query(Resource).filter(Resource.name == name).first():
            continue
        db.add(Resource(
            name=name,
            type=resource_type,
            department=department,
            sensitivity=sensitivity,
            content="Harmless HoneyGate demo file. This synthetic resource contains no real data.",
            is_decoy=False,
            decoy_type=None,
        ))

    decoys = [
        ("admin_passwords_backup.txt", "credential", "Admin", "critical", "password_backup", "DEMO ONLY: synthetic honeytoken placeholders."),
        ("Q4_Salary_Master.xlsx", "finance", "Finance", "critical", "salary_sheet", "DEMO ONLY: no real employee or payroll data."),
        ("prod_db_credentials.env", "credential", "Admin", "critical", "honeytoken", "DEMO_ONLY_USERNAME=dummy\nDEMO_ONLY_PASSWORD=not-a-real-secret"),
        ("Executive_Drive_Access_List.xlsx", "document", "Admin", "high", "decoy_document", "Synthetic access list containing no real identities."),
        ("Legacy_Customer_Database.csv", "document", "Admin", "critical", "decoy_database_record", "DEMO ONLY: fabricated database-record sample."),
    ]
    for name, resource_type, department, sensitivity, decoy_type, content in decoys:
        if db.query(Resource).filter(Resource.name == name).first():
            continue
        db.add(Resource(
            name=name,
            type=resource_type,
            department=department,
            sensitivity=sensitivity,
            content=content,
            is_decoy=True,
            decoy_type=decoy_type,
        ))

    policies = [
        ("Unknown device", "unknown_device", 15.0),
        ("Unusual location", "unusual_location", 10.0),
        ("Abnormal file access", "abnormal_file_access", 20.0),
        ("Suspicious behaviour", "suspicious_behaviour", 15.0),
        ("Decoy interaction", "decoy_interaction", 50.0),
        ("Restrict threshold", "restrict_threshold", 70.0),
        ("Window minutes", "window_minutes", 5.0),
        ("Maximum files per window", "max_files_per_window", 8.0),
        ("Maximum searches per window", "max_searches_per_window", 5.0),
    ]
    for name, rule_key, value in policies:
        if db.query(Policy).filter(Policy.rule_key == rule_key).first():
            continue
        db.add(Policy(name=name, rule_key=rule_key, value=value, enabled=True))

    db.commit()
