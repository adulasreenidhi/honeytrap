# HoneyGate Frontend

HoneyGate is a synthetic cyber-deception and continuous-trust prototype built with React 18, Vite, Tailwind CSS 3, React Router v6, Recharts, and Lucide.

## Setup and run

Start the backend from `backend/`:

```powershell
python -m uvicorn app.main:app --reload
```

In another PowerShell window, from `frontend/`:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The default `VITE_API_URL` is `http://localhost:8000`; change it in `.env` if needed. The backend CORS configuration allows the frontend's `localhost:5173` origin.

Run checks with:

```powershell
npm run lint
npm run build
```

## Role-based page map

| Route | Access |
|---|---|
| `/login` | Public |
| `/portal` | Employee |
| `/admin` (SOC dashboard) | Admin, analyst |
| `/admin/trust` | Admin, analyst |
| `/admin/alerts` | Admin, analyst |
| `/admin/incidents` | Admin, analyst |
| `/admin/incidents/:id` | Admin, analyst |
| `/admin/activity` | Admin, analyst |
| `/admin/policies` | Admin (editable), analyst (read-only) |
| `/admin/reports` | Admin, analyst |
| `/admin/reports/:id` | Admin, analyst |
| `/admin/users` | Admin |
| `/admin/devices` | Admin |
| `/admin/decoys` | Admin |
| `/admin/demo` | Admin |

Employees attempting to open admin routes are redirected to `/portal`. Unmatched paths show the 404 page. See the [backend README](../backend/README.md) for seeded synthetic accounts and the documented DEMO password.

## Demo walkthrough

1. Sign in as `liam.finance` with the registered corporate laptop and New York.
2. In Company Environment, open a few normal Finance files. Then request `Q4_Salary_Master.xlsx`, which appears as an ordinary file to employees and triggers the synthetic decoy workflow.
3. Log out and sign in as `admin`. Review the SOC dashboard's latest signals, then open Alerts and the linked incident timeline.
4. Alternatively, as admin, open **Demo mode → Run attack scenario** to animate a simulated employee login, access decisions, alert/incident creation, and contained session. **Trust monitoring** also has simulated device/location changes.
5. To restore seeded data, use **Demo mode → Reset demo data** and confirm. This clears only local synthetic records.

All data and responses are simulated. No real credentials or external containment actions are used.
