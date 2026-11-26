# HoneyGate

**Adaptive Cyber Deception & Continuous Trust Intelligence Platform**
*Don't just trust the login. Continuously verify the behaviour.*

HoneyGate scores every action a user takes after login, and plants decoy resources (honeytokens) that legitimate users have no reason to open. Each action produces an **ALLOW**, **RESTRICT** or **DENY** decision with an explanation.

> **Prototype:** all data, users, devices and response actions are simulated. No real credentials are used.

## How it works

1. A user logs in with a device profile and location.
2. Every action (open file, search) runs through a pipeline: validate session → log event → decoy check → behaviour analysis → trust score (0-100) → policy decision.
3. A decoy interaction is a critical event and always results in **DENY**, whatever the score.
4. Alerts and incidents are created automatically, with a timeline and a hashed evidence snapshot.
5. Analysts review incidents, tune policies, and export reports.

A decoy hit is an *indicator of compromise requiring investigation*, not proof of anyone's identity.

## Tech stack

- **Backend:** Python, FastAPI, SQLAlchemy, SQLite
- **Frontend:** React (Vite), Tailwind CSS v3, Recharts
- **Security logic:** rule-based detection engine, MITRE ATT&CK tagging, hash-chained audit log

## Project structure

```
backend/   FastAPI app, detection/trust/policy engines, tests, simulations
frontend/  React SOC dashboard and employee portal
```

## Run it

**Backend** (from `backend/`):

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

**Frontend** (from `frontend/`):

```powershell
npm install
npm run dev
```

App: http://localhost:5173

**Tests** (from `backend/`):

```powershell
python -m pytest -q
python -m tests.simulations.validate_detection
```


OpenCanary, Cowrie, T-Pot, NIST SP 800-207 (Zero Trust Architecture), MITRE ATT&CK
