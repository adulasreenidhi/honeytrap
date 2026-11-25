# HoneyGate API Contract

Base URL: `http://localhost:8000`. Except for health and login, endpoints require `Authorization: Bearer <access_token>`. Responses shown are abbreviated synthetic examples. Errors use `{"error":"...","detail":"..."}`. Pagination uses `page` (1-based) and `page_size` (bounded to 100, or 1000 for audit exports).

## Health and authentication

| Method | Path | Role | Request body / query | Sample response |
|---|---|---|---|---|
| GET | `/api/health` | Public | None | `{"status":"ok"}` |
| POST | `/api/auth/login` | Public | `{"username":"maya.hr","password":"<demo-only>","device_id":"dev-registered-001","location":"New York"}` | `{"access_token":"<JWT>","token_type":"bearer","session":{"id":12,"user_id":3,"device_id":"dev-registered-001","location":"New York","trust_score":100,"status":"active"}}` |
| GET | `/api/auth/me` | Any authenticated user | None | `{"user":{"id":3,"username":"maya.hr","role":"employee","department":"HR"},"session":{"id":12,"trust_score":100,"status":"active"}}` |
| POST | `/api/auth/logout` | Any authenticated user | None | `{"detail":"Session ended"}` |

## Resources, users, devices, and decoys

| Method | Path | Role | Request body / query | Sample response |
|---|---|---|---|---|
| GET | `/api/resources` | Any authenticated user | None; visibility is filtered by role/department | `[{"id":1,"name":"HR_Policy_Handbook.pdf","type":"document","department":"HR","sensitivity":"medium","content":"Harmless HoneyGate demo file."}]` |
| POST | `/api/users` | Admin | `{"username":"demo.user","email":"demo.user@honeygate.demo","password":"<demo-only>","role":"employee","department":"HR"}` | `{"id":8,"username":"demo.user","email":"demo.user@honeygate.demo","role":"employee","department":"HR","status":"active"}` |
| GET | `/api/users` | Admin | None | `[{"id":1,"username":"admin","role":"admin","department":"Admin"}]` |
| GET | `/api/users/{user_id}` | Admin | Path `user_id` | `{"id":3,"username":"maya.hr","role":"employee","department":"HR","status":"active"}` |
| PATCH | `/api/users/{user_id}` | Admin | Partial user fields; password may be changed | `{"id":3,"username":"maya.hr","role":"analyst","status":"active"}` |
| DELETE | `/api/users/{user_id}` | Admin | Path `user_id` | `204 No Content` |
| POST | `/api/devices` | Admin | `{"device_id":"demo-device-5","label":"Synthetic laptop","status":"unverified"}` | `{"id":5,"device_id":"demo-device-5","label":"Synthetic laptop","status":"unverified"}` |
| GET | `/api/devices` | Admin | None | `[{"id":1,"device_id":"dev-registered-001","label":"Corporate Laptop","status":"registered"}]` |
| GET | `/api/devices/{device_id}` | Admin | Path `device_id` is the device row ID | `{"id":1,"device_id":"dev-registered-001","label":"Corporate Laptop","status":"registered"}` |
| PATCH | `/api/devices/{device_id}` | Admin | `{"status":"revoked"}` | `{"id":1,"device_id":"dev-registered-001","status":"revoked"}` |
| DELETE | `/api/devices/{device_id}` | Admin | Path `device_id` is the device row ID | `204 No Content` |
| POST | `/api/decoys` | Admin | Resource fields, e.g. `{"name":"synthetic_admin_backup.txt","type":"credential","department":"Admin","sensitivity":"critical","content":"DEMO ONLY dummy values","is_decoy":true,"decoy_type":"honeytoken"}` | `{"id":26,"name":"synthetic_admin_backup.txt","is_decoy":true,"decoy_type":"honeytoken"}` |
| GET | `/api/decoys` | Admin | None | `[{"id":21,"name":"admin_passwords_backup.txt","is_decoy":true,"decoy_type":"password_backup"}]` |
| GET | `/api/decoys/{decoy_id}` | Admin | Path `decoy_id` | `{"id":21,"name":"admin_passwords_backup.txt","is_decoy":true,"decoy_type":"password_backup"}` |
| PATCH | `/api/decoys/{decoy_id}` | Admin | Partial resource fields | `{"id":21,"name":"admin_passwords_backup.txt","is_decoy":true}` |
| DELETE | `/api/decoys/{decoy_id}` | Admin | Path `decoy_id` | `204 No Content` |

Employee resource responses deliberately omit `is_decoy` and `decoy_type`.

## Continuous monitoring and trust

| Method | Path | Role | Request body / query | Sample response |
|---|---|---|---|---|
| POST | `/api/access/resource/{resource_id}` | Any authenticated user | Path resource ID; no body | `{"decision":"ALLOW","trust_score":100,"reasons":["no_risk_rules_triggered (+0): access matched normal policy"],"triggered_rules":[],"recommended_action":"none","content":"Harmless demo text"}` |
| POST | `/api/access/search?q={query}` | Any authenticated user | Query parameter `q` | `{"decision":"ALLOW","trust_score":100,"reasons":["no_risk_rules_triggered (+0): access matched normal policy"],"triggered_rules":[],"recommended_action":"none","content":null}` |
| POST | `/api/access/verify` | Any authenticated user | `{"otp":"123456"}`; mock OTP is simulated | `{"verified":true,"decision":"ALLOW","trust_score":90,"reasons":["step_up_verification (+10): restored trust"],"triggered_rules":["step_up_verification"],"recommended_action":"none"}` |
| GET | `/api/sessions/{session_id}/trust` | Own session; admin/analyst may view any | Path `session_id` | `{"current_assessment":{"score":80,"status":"restricted","previous_score":80,"delta":0,"contributing_factors":[]},"history":[{"score":80,"delta":-20,"reason":"continuous_monitoring"}]}` |
| GET | `/api/sessions/active` | Admin, analyst | None | `[{"id":12,"user_id":3,"device_id":"dev-registered-001","location":"New York","trust_score":100,"status":"active"}]` |
| POST | `/api/simulate/device-change` | Admin, analyst | `{"session_id":12,"device_id":"dev-unknown-002"}` | `{"decision":"RESTRICT","trust_score":85,"reasons":["unknown_device (+15): device is unknown"],"triggered_rules":["unknown_device"],"recommended_action":"require_step_up_verification","content":null}` |
| POST | `/api/simulate/location-change` | Admin, analyst | `{"session_id":12,"location":"Remote Demo Location"}` | `{"decision":"ALLOW","trust_score":90,"reasons":["unusual_location (+10): location differs from usual location"],"triggered_rules":["unusual_location"],"recommended_action":"none","content":null}` |

On `DENY`, resource access returns HTTP 403 with the decision body. `RESTRICT` returns HTTP 200 without resource content.

Each detection `Finding` includes `rule_key`, `risk_points`, `reason`, and
`mitre_attack_id`. Finding event details and incident evidence preserve the
MITRE identifier for timeline and report use.

## Activity, alerts, incidents, and policies

| Method | Path | Role | Request body / query | Sample response |
|---|---|---|---|---|
| GET | `/api/activity` | Any authenticated user; employees see only their own | Optional `user_id`, `session_id`, `event_type`, `page`, `page_size` | `{"items":[{"id":44,"session_id":12,"user_id":3,"event_type":"file_access","severity":"low","risk_points":0,"details":{}}],"total":1,"page":1,"page_size":20}` |
| GET | `/api/alerts` | Admin, analyst | Optional `severity`, `status`, `page`, `page_size` | `{"items":[{"id":2,"incident_id":1,"session_id":12,"severity":"critical","status":"open","title":"Monitored security indicator","message":"A monitored event is an indicator of compromise requiring investigation."}],"total":1,"page":1,"page_size":20}` |
| PATCH | `/api/alerts/{alert_id}` | Admin, analyst | `{"status":"acknowledged","severity":"high"}` | `{"id":2,"incident_id":1,"session_id":12,"severity":"high","status":"acknowledged","title":"Monitored security indicator"}` |
| GET | `/api/incidents` | Admin, analyst | Optional `severity`, `status`, `page`, `page_size` | `{"items":[{"id":1,"session_id":12,"user_id":7,"severity":"critical","status":"open","title":"Monitored security indicator","summary":"A monitored event is an indicator of compromise requiring investigation."}],"total":1,"page":1,"page_size":20}` |
| GET | `/api/incidents/{incident_id}` | Admin, analyst | Path `incident_id` | `{"id":1,"severity":"critical","status":"open","evidence_snapshot":{"sha256_digest":"<sha256>","findings":[]},"evidence_integrity":{"valid":true},"timeline":[{"kind":"activity","event_type":"decoy_trigger","details":{"mitre_attack_id":"T1552 Unsecured Credentials"}}]}` |
| PATCH | `/api/incidents/{incident_id}` | Admin, analyst | `{"status":"investigating","analyst_notes":"Review synthetic evidence."}` | `{"id":1,"status":"investigating","analyst_notes":"Review synthetic evidence."}` |
| POST | `/api/incidents/{incident_id}/respond` | Admin, analyst | `{"action":"restrict_session","notes":"Demo response"}`; actions are simulated | `{"id":1,"incident_id":1,"action":"restrict_session","performed_by":"analyst","session_status":"restricted","simulated":true}` |
| GET | `/api/policies` | Admin, analyst | None | `[{"id":1,"name":"Unknown device","rule_key":"unknown_device","value":15.0,"enabled":true}]` |
| PUT | `/api/policies/{policy_id}` | Admin | `{"value":25,"enabled":true}` | `{"id":1,"name":"Unknown device","rule_key":"unknown_device","value":25.0,"enabled":true}` |

Supported response actions: `restrict_session`, `terminate_session`, `block_sensitive_resources`, `require_step_up_verification`, `suspend_user`, and `mark_device_revoked`. Policy weights and thresholds must be 0–100; window/count policies must be 1–10000.

## Reports and dashboard

| Method | Path | Role | Request body / query | Sample response |
|---|---|---|---|---|
| GET | `/api/reports/incident/{incident_id}` | Admin, analyst | Path `incident_id` | `{"report_type":"incident","incident":{"id":1,"severity":"critical","status":"open"},"evidence_snapshot":{"sha256_digest":"<sha256>"},"evidence_integrity":{"valid":true},"audit_integrity":{"valid":true,"checked":44,"first_broken_event_id":null},"timeline":[{"kind":"decision","decision":"DENY","mitre_attack_ids":["T1552 Unsecured Credentials"]}]}` |
| GET | `/api/reports/audit` | Admin, analyst | Optional ISO `from`, `to`; `format=json|csv`; optional `page`, `page_size` | JSON: `{"items":[{"id":44,"event_type":"decoy_trigger","severity":"critical"}],"total":1,"page":1,"page_size":100}`. CSV: `id,session_id,user_id,resource_id,event_type,severity,risk_points,details,timestamp` |
| GET | `/api/reports/audit/integrity` | Admin, analyst | None | `{"valid":true,"checked":44,"first_broken_event_id":null}` |
| GET | `/api/reports/detection-coverage` | Admin, analyst | None | `[{"rule_key":"decoy_interaction","description":"A request touches a monitored synthetic decoy.","mitre_attack_id":"T1552 Unsecured Credentials","technique_name":"Unsecured Credentials","current_weight":50.0,"enabled":true,"simulation_covered":true,"simulation_scenarios":["decoy_touch"]}]` |
| GET | `/api/dashboard/summary` | Admin, analyst | None | `{"active_sessions":2,"monitored_devices":4,"decoy_count":5,"open_alerts":1,"incidents_by_severity":{"low":0,"medium":0,"high":0,"critical":1},"average_trust":82.5}` |
| GET | `/api/dashboard/trust-trends` | Admin, analyst | None | `[{"time":"2026-11-25T10:00:00","value":90.0}]` |
| GET | `/api/dashboard/events-over-time` | Admin, analyst | None | `[{"time":"2026-11-25T10:00:00","value":5}]` |

## Demo simulations

| Method | Path | Role | Request body / query | Sample response |
|---|---|---|---|---|
| POST | `/api/demo/run-scenario` | Admin | None | `{"simulated":true,"session_id":13,"employee":"liam.finance","steps":[{"step":"employee_login","trust_score":100,"decision":"ALLOW","reasons":[]}],"final_status":"denied","alert_and_incident_created":true}` |
| POST | `/api/demo/reset` | Admin | None | `{"reset":true,"simulated":true,"detail":"HoneyGate seed data restored"}` |

The demo scenario and reset operate only on synthetic records in the local database. No real credentials or external response actions are used.

Activity events are chained in ID order using SHA-256 hashes stored in the
existing event `details` JSON. Incident evidence snapshots include a separate
SHA-256 digest; read endpoints report whether that digest still matches.
