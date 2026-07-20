# GatePass Scanner — Design Spec

Date: 2026-07-20
Status: Direction approved; revised with round-2 corrections below. Pending
implementation plan.

**Revision note:** the round-1 version of this spec used a single database
role, an overloaded `events`/`ticket_entitlements` pair for access control,
`scan_logs` alone for attendance uniqueness, and an unordered ticket pick on
multi-ticket scans. All four were corrected below based on review feedback
before any code was written (constraint 12/round-1: spec + plan approved
before code).

## 1. Problem

GatePass needs a scanner feature: every registered user gets one permanent,
opaque QR credential that a locked-down scanner device can check against
server-side entitlements (event ticket, identity, attendance, facility
access), without the frontend or the QR itself ever carrying PII, ticket
data, or permissions.

## 2. Existing system (why this can't be "just add an endpoint")

The repo has three backend-shaped things already:

- **`server/`** (Express/TS, deployed to Railway via `nixpacks.toml`). Its
  `PostgresAppStateStore` (`server/store.ts`) is the only code that populates
  the relational schema in `db/postgres18_schema.sql` (`organizations`,
  `users`, `events`, `ticket_categories`, `orders`, `tickets`, `scan_logs`,
  ...). It does this by **truncating and fully re-inserting every one of
  those tables on every `PUT /api/state` call**, deriving all rows from the
  client-owned JSON blob (`app_state.payload`).
- **`GatepassApi/`** (ASP.NET Core 8, built by the root `Dockerfile`). Its
  `GatepassDbContext` only maps `app_state`. It never touches
  `users`/`events`/`tickets`.
- Neither backend has a real session system. "Auth" is Google ID-token
  verification that returns a session-token-*shaped* string
  (`gp_session_{subject}`), unchecked on subsequent requests.

Consequences that drove this design:

- The existing `public.users`/`events`/`tickets` tables are not safe to
  build on: any FK into them can be destroyed by a routine frontend save
  (`TRUNCATE ... CASCADE` in `syncReportingTables`).
- Existing `tickets` rows have no link to a GatePass account (just
  `attendee_name/phone/email` strings), so "current holder" and "transfer
  between accounts" aren't representable there today.
- There is no admin/role system reachable from a new service.
- There is no real payment webhook — `payment_status` is a client-set
  string with no gateway confirmation.

## 3. Architecture

A **fourth, standalone service**: a Python/FastAPI app at `backend/` (repo
root), its own venv, connecting to the same Neon/Postgres database, but
writing exclusively to a **dedicated `scanner` Postgres schema**. It does
not read, write, or foreign-key into `public.*` at runtime.

```
Neon Postgres (one database)
├── public.*        — existing app_state blob + Node-synced reporting tables
│                      (untouched by this feature at runtime)
└── scanner.*        — new, owned entirely by backend/ (FastAPI)
```

Three separate Postgres roles/connections are used (see constraint 1 and
§11) so that no single credential can both read `public.*` and act as the
scanning authority:

- **Runtime role** (`SCANNER_DATABASE_URL`) — DML only (`SELECT/INSERT/
  UPDATE/DELETE`) on `scanner.*`. No grants on `public.*` at all, and no DDL
  rights. This is what the FastAPI app uses for every request.
- **Migration role** (`SCANNER_MIGRATIONS_DATABASE_URL`) — owns/can `CREATE`
  within the `scanner` schema. Used only by Alembic, never by the running
  app.
- **Legacy-import role** (`LEGACY_IMPORT_DATABASE_URL`) — read-only on
  `public.*` plus DML on `scanner.*`. Used only by the manual importer CLI
  (§10), never by the runtime app or Alembic.

The frontend gets two new routes (`/scanner`, `/scanner/pair`) that talk to
this service on its own base URL (`VITE_SCANNER_API_BASE_URL`), since it's a
separate service from the existing Node/.NET API.

## 4. Mandatory constraints

1. Three separate, least-privilege Postgres roles/connection strings —
   runtime (DML-only, `scanner.*` only), Alembic migrations (DDL, `scanner`
   schema only), and the legacy importer (read `public.*`, write
   `scanner.*`). No single role has both `public.*` read and scanner write
   in the runtime path. (See §3, §11.)
2. No foreign keys from `scanner.*` to `public.*`, ever.
3. Legacy public-schema IDs (from the one-time import) are stored as plain
   reference columns (`legacy_ticket_id`, `legacy_event_id`, ...), not FKs.
4. Identify users by verified Google **issuer + subject (`sub`)**, not email
   alone (email can change/be reused; `sub` is stable per Google account).
5. Google ID token verification must check signature, issuer (`accounts.google.com`
   or `https://accounts.google.com`), audience (`GATEPASS_GOOGLE_CLIENT_ID`),
   expiration, and `email_verified`.
6. Scanner-device authentication (pairing code → scanner session token) is
   completely separate from user authentication (Google ID token). A scanner
   session never identifies a user; a user token never operates a scanner.
7. `GATEPASS_ADMIN_EMAILS` is an MVP-only allowlist, and it is only
   consulted **after** a Google ID token has been fully verified (constraint
   5) — never as a standalone credential.
8. `scanner.*` is the sole authority for ticket/gate decisions. The scan
   endpoint never reads `public.*` at request time.
9. Manual admin ticket issuance (no payment webhook) is the correct MVP
   behavior, not a shortcut to fix later within this project's scope.
10. The legacy importer is a manually-invoked, idempotent CLI command. It
    never runs automatically (not on startup, not on migration, not on
    deploy).
11. Legacy attendee records that can't be matched to a verified
    (issuer, sub) identity at import time are recorded as skipped and get
    **no** entitlement — no silent best-effort grants.
12. Spec (this doc) and implementation plan exist and are approved before
    any code is written.
13. Attendance uniqueness is enforced by a dedicated
    `scanner.attendance_records` table (`UNIQUE(user_id, event_id)`), not by
    `scan_logs`. Every scan attempt — approved, rejected, or
    already-marked — is still written to `scan_logs`.
14. `ACCESS_CONTROL` is modeled with dedicated `scanner.resources` and
    `scanner.access_grants` tables, not by overloading `events`/
    `ticket_entitlements`. `scanner.scanners` gets a `resource_id` column
    alongside `event_id`.
15. `ticket_entitlements.purchased_by_user_id` is nullable.
    `issued_by_admin_user_id`, `source_type`, and `source_reference` are
    added so admin-issued and legacy-imported tickets are distinguishable.
    The legacy importer never fabricates a purchaser — if no verified user
    match exists, no row is created at all (constraint 11).
16. The QR HMAC signs the full canonical string `gp:v1:<public_id>` (not the
    bare `public_id`), and signature comparison is constant-time. The
    scanner session is authenticated **before** any part of the QR payload
    is parsed or verified.
17. When a user holds multiple eligible tickets for the same event, the scan
    locks and consumes the **earliest eligible** ticket
    (`ORDER BY created_at ASC ... FOR UPDATE`) — never an unordered
    `LIMIT 1`.
18. Ticket transfer is rejected if the ticket has already consumed an entry,
    is cancelled/expired, or already has another pending transfer.
19. A database check constraint enforces which scanner `purpose` values
    require `event_id`, which require `resource_id`, and which require
    neither.

## 5. Data model (`scanner` schema)

All tables live in schema `scanner`. All PKs are UUIDs
(`gen_random_uuid()`). Timestamps are `timestamptz`.

### Identity

```
scanner.users
  id                  uuid PK
  google_issuer       text NOT NULL
  google_subject      text NOT NULL
  email               text NOT NULL          -- last-verified email, informational
  display_name        text NOT NULL
  photo_url            text
  status              text NOT NULL DEFAULT 'active'   -- active | disabled
  created_at, updated_at
  UNIQUE (google_issuer, google_subject)
```

No password, no session table for users — every request re-verifies a fresh
Google ID token (constraint 5). This keeps user auth stateless and avoids
building a second session system alongside the scanner-session one.

### Ticketing (admin-managed; source of truth per constraint 8)

```
scanner.events
  id                  uuid PK
  organization_name    text NOT NULL     -- free text; no organizations table needed yet
  name                text NOT NULL
  starts_at, ends_at  timestamptz NOT NULL
  venue               text
  status              text NOT NULL DEFAULT 'active'   -- active | cancelled | completed
  legacy_event_id      text              -- plain reference, no FK (constraint 3)
  created_at, updated_at

scanner.ticket_entitlements
  id                       uuid PK
  event_id                 uuid NOT NULL REFERENCES scanner.events(id)
  purchased_by_user_id     uuid REFERENCES scanner.users(id)   -- nullable (constraint 15)
  issued_by_admin_user_id  uuid REFERENCES scanner.users(id)   -- nullable
  source_type              text NOT NULL   -- ADMIN_ISSUED | LEGACY_IMPORT
  source_reference          text            -- free text (e.g. import batch id), not a FK
  ticket_type              text NOT NULL
  status                   text NOT NULL   -- active | cancelled | expired
  valid_from, valid_until  timestamptz
  max_entries              integer NOT NULL DEFAULT 1 CHECK (max_entries >= 1)
  entry_count              integer NOT NULL DEFAULT 0 CHECK (entry_count >= 0)
  legacy_ticket_id          text            -- plain reference, no FK
  created_at, updated_at
  CHECK (entry_count <= max_entries)
  CHECK (
    (source_type = 'ADMIN_ISSUED'  AND issued_by_admin_user_id IS NOT NULL AND purchased_by_user_id IS NULL) OR
    (source_type = 'LEGACY_IMPORT' AND purchased_by_user_id IS NOT NULL AND issued_by_admin_user_id IS NULL)
  )

scanner.ticket_assignments
  id                  uuid PK
  ticket_id           uuid NOT NULL REFERENCES scanner.ticket_entitlements(id)
  assigned_to_user_id uuid NOT NULL REFERENCES scanner.users(id)
  status              text NOT NULL   -- active | ended
  assigned_at         timestamptz NOT NULL DEFAULT now()
  ended_at            timestamptz
  transfer_id         uuid REFERENCES scanner.ticket_transfers(id)
  -- partial unique index: only one active assignment per ticket
  UNIQUE (ticket_id) WHERE status = 'active'   -- implemented as partial unique index

scanner.ticket_transfers
  id                  uuid PK
  ticket_id           uuid NOT NULL REFERENCES scanner.ticket_entitlements(id)
  from_user_id        uuid NOT NULL REFERENCES scanner.users(id)
  to_user_id          uuid REFERENCES scanner.users(id)
  to_email            text NOT NULL
  status              text NOT NULL   -- pending | accepted | expired | cancelled
  expires_at          timestamptz NOT NULL
  accepted_at         timestamptz
  created_at          timestamptz NOT NULL DEFAULT now()
  -- partial unique index: only one pending transfer per ticket (constraint 18)
  UNIQUE (ticket_id) WHERE status = 'pending'
```

Entry count is incremented under a row lock on `ticket_entitlements` at scan
time. When a user has multiple eligible tickets for the same event, the
scan locks candidate rows in a deterministic order and consumes the
earliest one (constraint 17; see §8). Transfers create a new
`ticket_assignments` row and end the old one atomically; the old holder's QR
stops validating for that ticket immediately because entitlement lookup
joins through the **active** assignment, not the original purchaser.

**Transfer preconditions** (constraint 18), checked under a row lock on
`ticket_entitlements` at transfer-creation time:
- `entry_count = 0` (no entry has been consumed) — else
  `TRANSFER_BLOCKED_ENTRY_CONSUMED`.
- `ticket_entitlements.status = 'active'` (not cancelled/expired) — else
  `TRANSFER_BLOCKED_TICKET_INACTIVE`.
- No existing `pending` transfer for the ticket — enforced at the
  application layer and additionally guaranteed by the partial unique index
  above — else `TRANSFER_BLOCKED_PENDING_TRANSFER_EXISTS`.

**MVP limitation:** admin-issued tickets (`source_type = 'ADMIN_ISSUED'`)
require the recipient to already have a `scanner.users` row, i.e. to have
logged into GatePass at least once — `ticket_assignments.assigned_to_user_id`
is `NOT NULL` and is never invented. Pre-issuing tickets to people who have
never logged in is out of scope for this MVP (they can be added once they've
logged in once).

### Attendance

```
scanner.attendance_records
  id            uuid PK
  user_id       uuid NOT NULL REFERENCES scanner.users(id)
  event_id      uuid NOT NULL REFERENCES scanner.events(id)
  scanner_id    uuid NOT NULL REFERENCES scanner.scanners(id)
  marked_at     timestamptz NOT NULL DEFAULT now()
  UNIQUE (user_id, event_id)
```

First successful `INSERT ... ON CONFLICT (user_id, event_id) DO NOTHING`
wins; a conflict means attendance was already marked (constraint 13). This
table is the sole source of attendance-uniqueness truth; `scan_logs` records
every attempt but is never queried to *determine* uniqueness.

### Access control

```
scanner.resources
  id                  uuid PK
  organization_name    text NOT NULL
  name                text NOT NULL     -- e.g. "Building A", "Main Campus Gate"
  status              text NOT NULL DEFAULT 'active'   -- active | inactive
  created_at, updated_at

scanner.access_grants
  id                        uuid PK
  resource_id               uuid NOT NULL REFERENCES scanner.resources(id)
  user_id                   uuid NOT NULL REFERENCES scanner.users(id)
  grant_type                text NOT NULL   -- free text, e.g. STANDARD | STAFF | VIP
  status                    text NOT NULL   -- active | revoked | expired
  valid_from, valid_until   timestamptz
  granted_by_admin_user_id  uuid REFERENCES scanner.users(id)
  created_at, updated_at
  -- partial unique index: one active grant per (resource, user)
  UNIQUE (resource_id, user_id) WHERE status = 'active'
```

Access control (constraint 14) is intentionally **not** modeled as a ticket:
there's no entry-count/consumption semantics for facility access in the
original ask, just "does this user currently have a valid grant for this
resource" — `access_grants` says exactly that and nothing more.

### QR credentials

```
scanner.qr_credentials
  id                  uuid PK
  user_id             uuid NOT NULL REFERENCES scanner.users(id)
  public_id           text NOT NULL UNIQUE   -- >=128 bits entropy, base32/url-safe
  status              text NOT NULL DEFAULT 'active'   -- active | revoked
  created_at          timestamptz NOT NULL DEFAULT now()
  revoked_at          timestamptz
  -- partial unique index: one active credential per user
  UNIQUE (user_id) WHERE status = 'active'
```

QR payload format: `gp:v1:<public_id>.<base64url(HMAC_SHA256(key, "gp:v1:" || public_id))>`.
The HMAC signs the **full canonical string including the `gp:v1:` prefix**
(constraint 16), not the bare `public_id` — this binds the signature to the
version tag, so a future `gp:v2:` scheme can't have its payloads replayed
under `v1` verification just because the trailing `<public_id>.<sig>` shape
looks similar. Verification uses `hmac.compare_digest` (constant-time).
No internal sequential ID, no PII, ever, in the payload.

### Scanner devices

```
scanner.scanners
  id                  uuid PK
  name                text NOT NULL
  organization_name    text NOT NULL
  purpose             text NOT NULL   -- TICKET_VALIDATION | IDENTITY_VERIFICATION | ATTENDANCE | ACCESS_CONTROL
  event_id            uuid REFERENCES scanner.events(id)      -- nullable
  resource_id         uuid REFERENCES scanner.resources(id)   -- nullable
  gate_id             text            -- nullable, free text
  status              text NOT NULL DEFAULT 'active'   -- active | revoked
  created_at, updated_at
  -- constraint 19: which purposes require which locator
  CHECK (
    (purpose = 'TICKET_VALIDATION'      AND event_id IS NOT NULL AND resource_id IS NULL) OR
    (purpose = 'ATTENDANCE'             AND event_id IS NOT NULL AND resource_id IS NULL) OR
    (purpose = 'ACCESS_CONTROL'         AND resource_id IS NOT NULL AND event_id IS NULL) OR
    (purpose = 'IDENTITY_VERIFICATION'  AND event_id IS NULL AND resource_id IS NULL)
  )

scanner.scanner_pairing_codes
  id                  uuid PK
  scanner_id          uuid NOT NULL REFERENCES scanner.scanners(id)
  code_hash           text NOT NULL     -- sha256, never store raw code
  expires_at          timestamptz NOT NULL
  used_at             timestamptz
  created_at          timestamptz NOT NULL DEFAULT now()

scanner.scanner_sessions
  id                  uuid PK
  scanner_id          uuid NOT NULL REFERENCES scanner.scanners(id)
  token_hash          text NOT NULL     -- sha256, never store raw token
  expires_at          timestamptz NOT NULL
  revoked_at          timestamptz
  last_seen_at        timestamptz
  device_name         text
  created_at          timestamptz NOT NULL DEFAULT now()

scanner.scan_logs
  id                  uuid PK
  scanner_id          uuid NOT NULL REFERENCES scanner.scanners(id)
  qr_credential_id    uuid REFERENCES scanner.qr_credentials(id)
  user_id             uuid REFERENCES scanner.users(id)
  ticket_id           uuid REFERENCES scanner.ticket_entitlements(id)
  resource_id         uuid REFERENCES scanner.resources(id)
  access_grant_id     uuid REFERENCES scanner.access_grants(id)
  purpose             text NOT NULL
  event_id            uuid REFERENCES scanner.events(id)
  gate_id             text
  decision            text NOT NULL   -- APPROVED | REJECTED
  reason              text NOT NULL   -- machine-readable code
  idempotency_key     text NOT NULL
  scanned_at          timestamptz NOT NULL DEFAULT now()
  metadata            jsonb NOT NULL DEFAULT '{}'
  UNIQUE (scanner_id, idempotency_key)
```

Every FK above targets only `scanner.*` tables (constraint 2). No FK targets
anything in `public`.

## 6. Auth model

Two independent authentication tracks that never cross:

- **User identity** (for QR issuance, `/scanner/pair`'s operator is *not* a
  "user" — see below): frontend sends the raw Google ID token on each
  relevant request (`/api/qr/me`, admin endpoints); backend verifies it
  fresh every time (signature/issuer/audience/exp/email_verified), resolves
  `(issuer, sub)` to a `scanner.users` row (creating one on first sight).
  No server-side session is issued for users.
- **Scanner-device session** (for `/api/scanner/*`): established once via
  pairing (constraint 6), stored as a bearer token the device holds. This
  token identifies a *scanner*, never a user, and is never accepted on
  admin/user endpoints. Per constraint 16, this token is verified **first**,
  before any QR payload is touched — see §8 step order.
- **Admin authorization**: an admin endpoint requires a valid, freshly
  verified Google ID token (same as user identity) whose email is present in
  `GATEPASS_ADMIN_EMAILS` (constraint 7). There's no separate admin login.

## 7. Scanner provisioning & pairing

1. Admin creates any `scanner.resources` row needed for `ACCESS_CONTROL`
   scanners (`POST /api/admin/resources`), same as events are created for
   ticketing/attendance scanners.
2. Admin calls `POST /api/admin/scanners` with `purpose` and the matching
   locator (`event_id` for `TICKET_VALIDATION`/`ATTENDANCE`, `resource_id`
   for `ACCESS_CONTROL`, neither for `IDENTITY_VERIFICATION`). The API
   validates this pairing itself (friendly 400 on mismatch) in addition to
   the DB check constraint (constraint 19) — belt and suspenders. Scanner
   row created, one-time pairing code generated, only its hash stored,
   plaintext code returned once.
3. Operator opens `/scanner/pair`, enters scanner ID + pairing code + device
   name.
4. Backend validates code (exists, unexpired, unused, scanner active),
   atomically marks it used, issues a scanner session token (hash stored,
   plaintext returned once).
5. Device stores the session token (see §9) and calls `/api/scanner/me` to
   render its locked configuration (purpose/event/resource/gate — never
   editable by the frontend).
6. `/api/scanner/scan` accepts only `qr_payload` + `idempotency_key`; all
   context (purpose, event, resource, gate) comes from the authenticated
   scanner session, never from the request body.

Admin can revoke a scanner, issue a new pairing code, or revoke all sessions
for a scanner via the endpoints in the original ask.

## 8. Scan algorithm

### Preflight (applies to every scan, in this exact order)

1. **Authenticate the scanner session first** (constraint 16): bearer token
   must hash to an unexpired, unrevoked `scanner_sessions` row; the
   referenced `scanner.scanners` row must be `active` — else
   `SCANNER_SESSION_EXPIRED` / `SCANNER_INACTIVE`. Update `last_seen_at`.
2. **Idempotency check**, using only `(scanner_id, idempotency_key)` — both
   already known from step 1 and the request body, with no QR parsing
   needed yet. If a `scan_logs` row already exists for this pair, return its
   stored decision/reason immediately; do not reprocess.
3. Only now parse the QR: reject if `qr_payload` doesn't start with
   `gp:v1:` → `INVALID_QR_FORMAT`.
4. Verify the HMAC over the canonical string `gp:v1:<public_id>` using
   constant-time comparison → else `INVALID_QR_SIGNATURE`.
5. Look up `qr_credentials` by `public_id`; must be `active` → else
   `QR_REVOKED`.
6. Look up `scanner.users` by the credential's `user_id`; must be `active`
   → else `USER_NOT_FOUND` / `USER_INACTIVE`.

Every outcome from here down — approved or rejected — is written to
`scan_logs` (constraint: log everything).

### TICKET_VALIDATION

Using the scanner's own `event_id` (never client-supplied):

1. `SELECT te.* FROM ticket_entitlements te JOIN ticket_assignments ta ON
   ta.ticket_id = te.id AND ta.status = 'active' WHERE te.event_id = :event_id
   AND ta.assigned_to_user_id = :user_id ORDER BY te.created_at ASC FOR
   UPDATE OF te` — locks all of this user's tickets for this event, in
   creation order (constraint 17: deterministic, never an unordered
   `LIMIT 1`).
2. Walk the locked rows in order and pick the first one that is
   simultaneously `status = 'active'`, within `[valid_from, valid_until]`,
   and `entry_count < max_entries`.
3. If none qualify, classify the rejection using this fixed precedence over
   the locked set (first match wins, since a user's tickets can fail for
   different reasons at once and the reason returned must be deterministic):
   no rows at all → `NO_VALID_TICKET`; else if any row is otherwise eligible
   but at its limit → `ENTRY_LIMIT_REACHED`; else if any row is otherwise
   eligible but not yet valid → `TICKET_NOT_YET_VALID`; else if any row is
   otherwise eligible but past `valid_until` → `TICKET_EXPIRED`; else (every
   row is `cancelled`) → `TICKET_CANCELLED`.
4. On success: increment `entry_count` on the chosen row, log, return
   `ticket_type`, `entry_count`, `max_entries`, and the holder's name/photo
   (the current assignee, not necessarily `purchased_by_user_id`).

### IDENTITY_VERIFICATION

Return only name/photo/verification status. Reason: `IDENTITY_VERIFIED`.
No event/resource/ticket lookups at all.

### ATTENDANCE

Using the scanner's own `event_id`:

1. `INSERT INTO attendance_records (user_id, event_id, scanner_id) VALUES
   (...) ON CONFLICT (user_id, event_id) DO NOTHING RETURNING id`
   (constraint 13).
2. A row returned → `APPROVED` / `ATTENDANCE_MARKED`. No row returned
   (conflict) → `REJECTED` / `ATTENDANCE_ALREADY_MARKED`. Either way, a
   `scan_logs` row is written.

### ACCESS_CONTROL

Using the scanner's own `resource_id`:

1. `SELECT * FROM access_grants WHERE resource_id = :resource_id AND
   user_id = :user_id AND status = 'active' AND (valid_from IS NULL OR
   valid_from <= now()) AND (valid_until IS NULL OR valid_until >= now())`.
2. Found → `APPROVED` / `ACCESS_GRANTED`. Not found → `REJECTED` /
   `NO_ACCESS_GRANT`.

## 9. Frontend

- `/scanner/pair` — pairing form; session token stored via one small
  `scannerSession.ts` service (sessionStorage, since this is a
  single-purpose kiosk-style device page, not the main app's auth). This is
  documented as a limitation (no HttpOnly cookie, since the scanner page is
  static-hosted alongside the SPA and doesn't share a backend origin with
  either existing API).
- `/scanner` — camera scanning UI using `@zxing/browser` (new dependency),
  client-side `gp:v1:` prefix pre-check, one in-flight request at a time,
  UUID idempotency key per physical scan, large APPROVED/REJECTED result,
  auto-reset.
- Both routes are added to whatever routing currently exists in `src/App.tsx`
  (to be confirmed exact mechanism during planning — the app may not use
  `react-router` today).

## 10. Legacy import (manual, one-off)

A CLI command (`python -m backend.scanner.import_legacy`), run with
`LEGACY_IMPORT_DATABASE_URL` (constraint 1), that:
- Reads `public.events` / `public.tickets` (best-effort, read-only,
  never at scan time — constraint 8).
- Attempts to match each ticket's attendee to an **existing** `scanner.users`
  row by email. A match is only possible if that person has already logged
  into GatePass at least once (which is what creates a `scanner.users` row
  in the first place, via verified `(issuer, sub)`) — so a match implies a
  real verified identity, not just a name/email string. Only then does the
  importer create the `ticket_entitlements` (`source_type = 'LEGACY_IMPORT'`,
  `purchased_by_user_id` = the matched user) + active `ticket_assignments`
  rows. Unmatched attendees (never logged in) are reported as skipped, get
  no row and no entitlement at all (constraints 11, 15); re-running the
  importer later, after they've logged in, will pick them up.
- Inserts idempotently (safe to re-run), storing `legacy_event_id` /
  `legacy_ticket_id` as plain columns.
- Prints/returns a report of imported vs. skipped rows with reasons.
- Is never invoked by app startup, Alembic migrations, or CI.

## 11. Environment variables

```
GATEPASS_QR_SIGNING_KEY              (required, >=32 chars, stable across restarts)
GATEPASS_PUBLIC_APP_URL
GATEPASS_SCANNER_SESSION_HOURS        (default 12)
GATEPASS_SCANNER_PAIRING_MINUTES      (default 10)
GATEPASS_GOOGLE_CLIENT_ID             (same Google OAuth client already used by the frontend/.NET)
GATEPASS_ADMIN_EMAILS                 (comma-separated allowlist, MVP only — constraint 7)
SCANNER_DATABASE_URL                  (runtime role: DML on scanner.* only, zero public.* grants — constraint 1)
SCANNER_MIGRATIONS_DATABASE_URL       (Alembic/DDL role: scanner schema only — constraint 1)
LEGACY_IMPORT_DATABASE_URL            (importer-only role: read public.*, write scanner.* — constraint 1)
```

All point at the same Neon database, as different Postgres roles/
credentials. Loaded from the project-root `.env` via `python-dotenv`.
Missing signing key is a hard startup failure locally; tests inject a
deterministic key.

## 12. Non-goals / explicitly deferred

- Migrating the rest of the app off the JSON-blob model.
- A real payment gateway webhook (constraint 9 says manual issuance is
  correct for now).
- Any change to `server/store.ts`'s truncate-and-resync behavior (it's a
  pre-existing hazard for the *existing* tables, but this feature simply
  never touches those tables, so fixing it is out of scope here).
- Unifying the two existing backends (Node/.NET) — not touched by this work.
- Pre-issuing tickets to people who have never logged into GatePass (see the
  MVP limitation note under §5 Ticketing).

## 13. Testing plan

The 20 scenarios from the original ask, mapped onto this data model, plus
scenarios added by the round-2 corrections:

QR generation/verification/tamper/revocation, pairing expiry/single-use/
invalid-code, scanner revoked/session-expired, non-GatePass QR, ticket
valid/wrong-event/cancelled/expired/duplicate-entry/concurrent-double-scan,
idempotent replay, transfer making new holder valid and old holder invalid,
attendance duplicate prevention, access-control grant validation, **plus**:
multi-ticket-for-same-event deterministic (earliest-first) consumption,
transfer rejected when an entry was already consumed, transfer rejected when
a pending transfer already exists, `ACCESS_CONTROL` scanner rejected from
referencing an `event_id` (and vice versa) by the DB check constraint,
attendance uniqueness enforced by `attendance_records` even under concurrent
duplicate scans, and a runtime-role connection verified to fail against
`public.*` (proving constraint 1 is actually enforced, not just documented).
