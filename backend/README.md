# HoneyGate Backend

HoneyGate is a FastAPI + SQLite prototype for cyber-deception signals and continuous trust evaluation.

> **Simulation only:** all users, devices, resources, credentials, events, incidents, responses, and API responses are synthetic. Response actions update only the local demo database. The application performs no network containment, account changes, or other real-world response actions.

## Setup

From `backend/`, create and activate a virtual environment, then install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set `SECRET_KEY` in your environment for local development if desired. The built-in fallback is for demo use only. The default database is `sqlite:///./honeygate.db`.

## Run and seed

```powershell
python -m uvicorn app.main:app --reload
```

Startup creates missing tables and idempotently seeds demo users, devices, resources, decoys, and policies. The API is at `http://localhost:8000`; Swagger docs are at `http://localhost:8000/docs`. To restore seed data after creating demo activity, sign in as an admin and call `POST /api/demo/reset`.

## Demo accounts

All seeded users share this **DEMO ONLY** password:

`HoneyGate!Demo2026`

- `admin` — admin
- `analyst` — analyst
- `maya.hr`, `eva.hr` — HR employees
- `liam.finance` — Finance employee
- `zoe.engineering` — Engineering employee
- `noah.admin` — Admin department employee

Never use these accounts or password outside this synthetic prototype.

## Run tests

```powershell
python -m pytest -q
```

Tests use in-memory SQLite and synthetic data.

## Run the proposal scenario

Authenticate as `admin` at `POST /api/auth/login`, then call `POST /api/demo/run-scenario` with its bearer token. The scenario demonstrates normal access, file-volume detection, a sensitive-resource restriction, a decoy alert, an incident, and a simulated response. Review `GET /api/incidents`, `GET /api/reports/incident/{id}`, or the dashboard endpoints. All results remain local and simulated.

See [API_CONTRACT.md](./API_CONTRACT.md) for all paths, roles, request bodies, and response examples.
