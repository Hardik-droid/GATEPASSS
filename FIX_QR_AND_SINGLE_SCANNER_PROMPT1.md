# Production-Ready GatePass QR + Scanner — Execution Prompt

You are working inside my existing GatePass project.

Project root:

```text
C:\Users\Asus\Downloads\gatepass
```

The current Node QR/scanner implementation is temporary and insecure. I do not want another patch or mock. I want the approved production implementation completed end-to-end.

Approved implementation plan:

```text
docs/superpowers/plans/2026-07-20-gatepass-scanner.md
```

Do not use Git commands.

---

## Primary objective

Replace every temporary QR/scanner path with one production-grade FastAPI scanner service backed by Neon PostgreSQL and the dedicated `scanner.*` schema.

The FastAPI scanner service must become the only authority for:

- permanent user QR credentials
- QR signature verification
- scanner provisioning
- scanner pairing
- scanner sessions
- event ticket entitlements
- current ticket assignments
- ticket transfers
- attendance
- facility access
- entry counters
- approved/rejected scan logs

Do not call the feature complete while any mock, fake token, hardcoded code, insecure fallback, simulated scan, or browser-controlled authorization remains active.

---

# 1. Final architecture

Use:

```text
Frontend: React + TypeScript + Vite
Scanner backend: standalone FastAPI service
Database: Neon PostgreSQL
Authoritative schema: scanner.*
Frontend scanner API variable: VITE_SCANNER_API_BASE_URL
```

Existing Node and ASP.NET services may remain for unrelated legacy features, but they must not make QR/scanner security decisions.

The scanner service must never depend on the client-owned JSON blob at scan time.

---

# 2. Remove all mocks and insecure fallbacks

Search the entire repository for:

```text
gp:v1:<studentId>
gp:v1:894-32A
123456
gp_scanner_session_token
token.includes
mock QR
demo QR
simulate scanner
SIMULATE SCANNER CHECK-IN
Demo QR Pass token
SCANNER HUB
AWAITING QR PASS TRANSMISSION
temporary QR mock
temporary scanner
```

For each result:

1. Identify whether it is part of a temporary mock.
2. Remove it from production paths.
3. Remove dead imports, components, CSS, routes, tests, and fake API helpers.
4. Do not leave hidden fallback routes in production mode.
5. Do not silently fall back to Node when FastAPI is unavailable.

Production must fail closed.

Temporary Node QR/scanner routes must be removed after FastAPI integration passes.

---

# 3. Neon database boundary

Use a dedicated `scanner` PostgreSQL schema.

The scanner service must not:

- write to `public.*`
- create foreign keys into `public.*`
- depend on `public.*` at runtime
- use the owner connection string in application runtime

Use separate connection strings:

```env
SCANNER_DATABASE_URL=<runtime pooled URL>
SCANNER_DIRECT_DATABASE_URL=<migration direct URL>
LEGACY_IMPORT_DATABASE_URL=<temporary importer URL>
```

Required role boundaries:

```text
scanner runtime role:
- SELECT/INSERT/UPDATE/DELETE on scanner.*
- no DDL
- no public.* access

scanner migration role:
- DDL on scanner.*
- no public.* runtime dependency

legacy importer role:
- read-only public.events/public.tickets
- limited insert/select into scanner import targets
- no truncate/delete
```

No cross-schema foreign keys.

---

# 4. Required scanner schema

Implement all approved tables:

```text
scanner.users
scanner.events
scanner.ticket_entitlements
scanner.ticket_assignments
scanner.ticket_transfers
scanner.qr_credentials
scanner.scanners
scanner.scanner_pairing_codes
scanner.scanner_sessions
scanner.scan_logs
scanner.attendance_records
scanner.resources
scanner.access_grants
```

Use:

- UUID primary keys
- `timestamptz`
- check constraints
- foreign keys only inside `scanner.*`
- partial unique indexes
- production-safe indexes for scan lookups

Required constraints:

```text
one active QR per user
one active assignment per ticket
one active scanner for this MVP
unique scanner_id + idempotency_key
unique scanner session token hash
one attendance row per user/event
unique legacy IDs when present
0 <= entry_count <= max_entries
scanner purpose must match event/resource requirements
```

Do not overload events for building/facility access. Use `resources` and `access_grants`.

Do not invent a purchaser during legacy import.

---

# 5. Permanent QR implementation

Each verified user receives one active permanent QR credential.

QR format:

```text
gp:v1:<opaque-public-id>.<base64url-signature>
```

Requirements:

- at least 128 bits of cryptographic entropy
- no PII
- no email or phone
- no ticket or event information
- no internal sequential database ID
- HMAC-SHA256
- canonical signed message:

```text
gp:v1:<public-id>
```

- constant-time signature comparison
- one active QR credential per user
- reissue revokes old QR immediately
- retry reuses the current active QR
- high QR error correction
- PNG endpoint returns `image/png`

Required environment variable:

```env
GATEPASS_QR_SIGNING_KEY=<stable production secret, at least 32 characters>
```

Do not generate a new signing key on startup.

Do not expose it to frontend code.

---

# 6. Google authentication

User/admin endpoints must verify a real Google ID token.

Verify:

- signature
- issuer
- audience
- expiration
- `email_verified`

Identify users by:

```text
google_issuer + google_subject
```

Do not identify accounts by email alone.

Do not trust:

- email sent in request body
- unchecked claims
- `gp_session_<subject>`
- Node mock session strings
- scanner session tokens on user/admin routes

User identity and scanner-device identity must remain separate.

---

# 7. Admin authorization

For MVP, use:

```env
GATEPASS_ADMIN_EMAILS=admin1@example.com,admin2@example.com
```

Only evaluate the allowlist after successful Google-token verification.

Implement admin authorization behind one isolated dependency/helper so it can later be replaced by organization roles.

Frontend visibility is not authorization.

---

# 8. Exactly one scanner

For the current MVP, only one scanner may be active.

Canonical scanner:

```text
Name: GatePass Main Scanner
Purpose: TICKET_VALIDATION
Gate: MAIN_GATE
Status: ACTIVE
```

Requirements:

- backend-level singleton enforcement
- no scanner switching UI
- no multiple-scanner selector
- do not create a scanner on every restart
- provide one explicit provisioning/seed command
- preserve old scan history
- mark extra scanner rows inactive/revoked instead of deleting history

Do not enforce this only in frontend code.

---

# 9. Scanner pairing security

Pairing codes must be:

- cryptographically random
- stored only as hashes
- single-use
- expiring
- atomically marked used
- returned only once
- never logged

Scanner sessions must be:

- cryptographically random
- stored only as hashes
- expiring
- revocable
- tied to one scanner
- returned only once
- updated with `last_seen_at`
- never accepted on user/admin endpoints

Remove all hardcoded codes and fixed tokens.

---

# 10. Scanner API

Use:

```http
POST /api/scanner/scan
Authorization: Bearer <scanner-session-token>
```

Request body:

```json
{
  "qr_payload": "gp:v1:...",
  "idempotency_key": "uuid"
}
```

Do not accept from frontend:

- scanner ID
- purpose
- event ID
- gate ID
- organization ID

Derive all scanner context from the authenticated scanner session.

Authenticate scanner session before returning detailed QR errors.

---

# 11. Ticket validation

Use authoritative `scanner.*` records only.

Validate:

- scanner active
- scanner session active
- QR signature
- QR credential active
- user active
- active ticket assignment
- correct scanner event
- ticket active
- validity window
- entry limit

Use row locks and transactions.

When multiple tickets are eligible, use deterministic order:

```text
1. valid_until ASC NULLS LAST
2. created_at ASC
3. id ASC
```

Consume the first eligible ticket.

Do not approve based on original purchaser.

Approve based on the current active assignment.

Increment entry count atomically.

---

# 12. Ticket transfers

Transfer assignment, not QR.

Rules:

- only current holder may initiate
- only one pending transfer per ticket
- cancelled/expired ticket cannot transfer
- ticket cannot transfer after `entry_count > 0`
- recipient must have verified GatePass identity
- old assignment ends atomically
- new assignment starts atomically
- old holder stops validating immediately
- recipient uses their own permanent QR
- QR image is never sent to recipient

All transfer changes must be transactional.

---

# 13. Attendance

Use:

```text
scanner.attendance_records
```

Enforce:

```text
UNIQUE(user_id, event_id)
```

Concurrent scans must not create duplicate attendance.

Every scan attempt must still be recorded in `scan_logs`.

Return:

```text
ATTENDANCE_MARKED
ATTENDANCE_ALREADY_MARKED
```

---

# 14. Access control

Use:

```text
scanner.resources
scanner.access_grants
```

Do not model facilities as fake long-running events.

Validate:

- scanner resource
- organization
- user status
- active grant
- validity period
- scanner authorization

---

# 15. Scan logs and idempotency

Log every approval and rejection.

Include:

- scanner
- user when resolved
- QR credential when resolved
- ticket when relevant
- purpose
- event/resource
- gate
- decision
- reason
- idempotency key
- timestamp
- safe metadata

Never log:

- Google ID token
- raw scanner token
- raw pairing code
- signing key
- database password

Idempotent replay must:

- return the original result
- not increment entry again
- not create duplicate attendance
- not repeat transfer effects

---

# 16. Identity-page QR integration

The `/identity` page must use the real FastAPI QR endpoint.

Use:

```env
VITE_SCANNER_API_BASE_URL=<FastAPI scanner API URL>
```

Do not use Node mock QR data.

If the PNG endpoint requires Authorization, do not use a plain protected `<img src>`.

Fetch the PNG as an authenticated Blob:

```http
Authorization: Bearer <Google ID token>
```

Display using an object URL and revoke it during cleanup.

The identity page must:

- display the permanent QR
- never open scanner
- never request camera access
- never call scan API
- show friendly errors
- allow retry
- reuse the same active QR

---

# 17. Scanner frontend

Keep one scanner route:

```text
/scanner
```

Optional pairing route:

```text
/scanner/pair
```

Use the real camera with the current library or `@zxing/browser`.

Remove:

- simulated scanner
- demo ticket selector
- fake check-in button
- fake node/controller status
- scanner switching
- duplicate scanner modals
- duplicate scanner components

Client pre-check:

```ts
qrPayload.startsWith("gp:v1:")
```

Backend signature verification remains mandatory.

---

# 18. CORS and transport security

Development origins may include:

```text
http://localhost:5173
http://localhost:5175
```

Production requirements:

- exact frontend origins only
- no wildcard origin with credentials
- HTTPS only
- debug disabled
- no stack traces in responses
- trusted proxy configuration
- HSTS at proxy/platform layer
- secure cookies when cookies are used
- appropriate SameSite policy

---

# 19. Rate limiting

Implement production enforcement for:

- scanner pairing
- scanner scan endpoint
- admin endpoints
- QR reissue
- transfer creation
- Google-token verification

Use appropriate keys:

- IP
- scanner session
- user identity
- endpoint

Add audit logging for repeated failures.

Do not rely only on client-side throttling.

---

# 20. Secret management

No secrets may appear in:

- source code
- committed `.env`
- Vite environment variables
- logs
- error responses
- tests

Provide `.env.example` with placeholders only.

Document secret rotation.

QR signing-key rotation must use a controlled version/key-ring strategy or explicit full reissue because changing the key invalidates all existing QR signatures.

---

# 21. Legacy importer

Importer must be:

- manually invoked
- idempotent
- read-only against `public.*`
- never run at startup
- never run during migration
- never run automatically in CI
- safe to rerun
- explicit about imported/skipped records

Unmatched attendees receive no entitlement.

No automatic grants from name or phone alone.

Store legacy IDs as ordinary columns, never foreign keys.

---

# 22. Alembic and migrations

Requirements:

- use current real migration head
- no placeholder revision IDs
- version table inside `scanner` schema
- `include_schemas=True`
- direct Neon URL for migrations
- proper upgrade and downgrade
- do not edit applied migrations
- Node/EF migrations must not own `scanner.*`

Create one-time role SQL separately.

Do not claim production migration succeeded without live Neon credentials.

---

# 23. Health, readiness, and observability

Add:

```text
GET /health
GET /ready
```

`/health` checks the process.

`/ready` checks required config and database connectivity.

Also add:

- structured logs
- request IDs
- scan IDs
- safe error categories
- latency metrics
- scan-decision metrics
- scanner-session failure metrics
- migration/version visibility

Do not expose secrets or full configuration.

---

# 24. Production startup

FastAPI must be importable from project root:

```text
backend.main:app
```

Production command must not use reload mode.

Example:

```text
uvicorn backend.main:app --host 0.0.0.0 --port 8010 --workers 2
```

Migrations must run once as a release step, not once per worker.

---

# 25. Required tests

Execute real tests for:

1. QR generation
2. QR verification
3. tampered QR rejection
4. revoked QR rejection
5. QR reissue
6. one active QR per user
7. pairing expiry
8. pairing single use
9. invalid pairing code
10. scanner session expiry
11. scanner revocation after pairing
12. scanner inactive through scan endpoint
13. non-GatePass QR rejection
14. valid ticket approval
15. wrong-event rejection
16. cancelled ticket
17. expired ticket
18. not-yet-valid ticket
19. entry limit
20. idempotent scan replay
21. real concurrent double-scan protection using separate DB connections
22. transfer makes recipient valid
23. transfer makes previous holder invalid
24. transfer blocked after entry
25. attendance uniqueness
26. concurrent attendance uniqueness
27. access-grant validation
28. admin authorization
29. invalid Google token
30. wrong Google audience
31. unverified Google email
32. protected QR PNG response
33. authenticated Blob QR loading
34. one-request-at-a-time scanner frontend
35. Blob URL cleanup

No fake/stub-only tests.

---

# 26. Validation gate

Run:

```powershell
npm install
npm run lint
npx tsc --noEmit
npm run build
```

Run backend tests:

```powershell
python -m pytest backend -q
```

Run Alembic checks:

```powershell
python -m alembic check
python -m alembic upgrade head
```

Run existing dependency/security checks.

Verify locally:

- frontend identity page
- FastAPI health
- FastAPI readiness
- QR PNG
- scanner pairing
- valid scan
- rejected scan
- transfer
- attendance
- access control
- scan log
- scanner revocation
- QR reissue

Do not call the system production-ready if any required validation fails.

---

# 27. Production deployment checklist

Before production release:

1. Create Neon roles.
2. Create `scanner` schema.
3. Configure pooled runtime URL.
4. Configure direct migration URL.
5. Run Alembic once.
6. Set stable QR signing key.
7. Set Google client ID.
8. Set admin email allowlist.
9. Set exact production frontend origins.
10. Set `VITE_SCANNER_API_BASE_URL`.
11. Remove Node QR/scanner mocks.
12. Build frontend.
13. Deploy FastAPI.
14. Verify `/health`.
15. Verify `/ready`.
16. Pair the one canonical scanner.
17. Issue one test entitlement.
18. Scan a production test user.
19. Confirm scan log.
20. Confirm duplicate entry rejection.
21. Confirm scanner revocation.
22. Confirm QR reissue invalidates old QR.
23. Confirm scanner runtime role cannot access `public.*`.
24. Confirm no secrets appear in build artifacts or logs.

Use a Neon staging/development branch first.

Do not run untested migrations directly on production.

---

# 28. Rollout strategy

Use:

```text
Development Neon branch
        ↓
Staging deployment
        ↓
End-to-end scanner test
        ↓
Security review
        ↓
Production migration
        ↓
Production deployment
        ↓
Canonical scanner pairing
        ↓
Controlled pilot
        ↓
Full rollout
```

Do not operate Node mock scanner and FastAPI scanner as two simultaneous authorities.

---

# 29. Execution method

Use Subagent-Driven Execution based on the approved plan.

Requirements:

1. Execute tasks in the documented order.
2. Review after every task.
3. Run task-specific tests immediately.
4. Do not continue when the current task has failing tests or broken imports.
5. Do not perform destructive production database operations without explicit approval.
6. Do not claim live Neon steps succeeded without credentials.
7. Maintain a running task report.
8. Do not use Git commands.

---

# 30. Completion report

Report actual results only:

1. Mock routes removed.
2. Files created.
3. Files modified.
4. Tables and constraints created.
5. Neon role SQL created.
6. Alembic revision created.
7. Google auth completed.
8. QR signing completed.
9. Pairing completed.
10. Scanner sessions completed.
11. Ticket validation completed.
12. Transfers completed.
13. Attendance completed.
14. Access control completed.
15. Identity-page QR completed.
16. Single scanner UI completed.
17. Legacy mock scanner removed.
18. Tests executed and exact results.
19. Lint result.
20. TypeScript result.
21. Build result.
22. Alembic result.
23. Health/readiness result.
24. Remaining steps requiring live Neon credentials.
25. Production deployment commands.
26. Production verification checklist.
27. Unresolved risks.

Do not say “production-ready” unless:

- no mock security path remains
- all required tests pass
- production build passes
- migrations validate
- secrets are externalized
- FastAPI is the only scanner authority
- staging end-to-end verification is complete
- live production configuration has been verified

Begin by reading the approved plan and inventorying every mock QR/scanner route and component that must be removed.
