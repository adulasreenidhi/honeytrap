# HoneyGate Backend Security

## Threat model

### Assets

- User credentials, role assignments, signed access tokens, and session state.
- Synthetic resources, decoy definitions, trust assessments, activity events, incidents, and policy configuration.
- Audit/report output and the integrity of the local demonstration state.

### Actors

- Employees using the React client to access only their own activity and session information.
- Analysts reviewing monitoring data and applying simulated responses.
- Administrators managing users, devices, decoys, policies, and demo scenarios.
- Unauthenticated clients sending malformed, oversized, or repeated login requests.

### Trust boundaries

- Browser/client input crosses the HTTP boundary into FastAPI validation and SQLAlchemy.
- Bearer tokens cross the client/server boundary and are checked against the configured signature key and live session row.
- Employee-visible API responses are a separate trust boundary from admin/analyst monitoring data.
- CSV downloads cross into spreadsheet software, which may interpret cells as formulas.
- SQLite and the process-local limiter are local prototype infrastructure, not shared production services.

## Controls

- JWTs use the configured signing algorithm, require `exp`, `iat`, `sub`, `session_id`, and `jti`, and are checked against an active user and live session. Logout, denied, ended, missing, or mismatched sessions invalidate their tokens.
- Non-debug configurations reject the sample key and keys shorter than 32 characters. Local debug configuration keeps the repository runnable for its synthetic demo.
- Login performs a dummy password hash verification for unknown users, returns generic credential errors, logs failures without credentials, and limits/temporarily locks out attempts by username and client IP.
- Password create/update validation enforces length and mixed character classes. User response schemas do not include password hashes. Password changes end the target user's sessions.
- Administrative routes follow `API_CONTRACT.md` role requirements; employee session/activity filters are constrained to the caller. Self-role changes and administrator self/last-admin deletion are blocked.
- Employee responses omit decoy flags/types, internal activity metadata, and exposed policy weights. `DENY` and `RESTRICT` decisions contain no resource content.
- SQLAlchemy expressions bind user values; request schemas bound lengths, enums, identifiers, and pagination; search strips control characters. Error responses omit validation input, stack traces, and internal paths.
- CSV string cells beginning with `=`, `+`, `-`, or `@` receive a leading apostrophe to prevent spreadsheet formula execution.
- Middleware enforces a request body cap, creates server-generated request IDs, applies security headers, disables API caching, and sets a restrictive CSP on non-documentation responses. The configured localhost CORS origins remain unchanged.
- Security logs cover login failures, role changes, policy edits, and simulated response actions. Request logs omit bodies and authorization headers; password, token, and OTP values are not logged.

## Known limitations of this prototype

- SQLite is suitable for the local demo, not concurrent multi-instance production operation or high-volume audit workloads.
- Login rate limiting is in-memory and process-local; it resets on restart and is not shared across workers.
- Monitoring and response actions are simulated local state changes; no external identity, endpoint, or network controls are invoked.
- Demo users, passwords, devices, and resources are synthetic and intended only for local testing.
- The default development configuration enables debug mode and includes a demo key. Deployments must disable debug and provide a unique secret of at least 32 characters.
