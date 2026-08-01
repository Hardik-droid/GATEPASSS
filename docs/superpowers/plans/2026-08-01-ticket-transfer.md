# Ticket Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a ticket holder transfer a ticket to another registered GatePass user, with the recipient confirming before ownership moves, and the ticket usable by exactly one person at all times.

**Architecture:** Ticket ownership becomes server-authoritative — `server/store.ts` stops truncating the reporting tables and upserts instead, deliberately never overwriting the three ownership columns on `public.tickets`. The transfer engine lives in the FastAPI backend beside the scanner, which already owns the `scanner.*` schema and resolves the signed-in user. Ownership moves by ending one row in `scanner.ticket_assignments` and inserting another inside a single transaction; an existing partial unique index makes a double-accept impossible at the database level. No QR credential is ever revoked or reissued.

**Tech Stack:** FastAPI + SQLAlchemy Core (`text()` queries) on Neon Postgres, Express/Node for the state API, React + TypeScript + Tailwind frontend, pytest and `node:test`/supertest for tests.

Full design rationale: `docs/superpowers/specs/2026-08-01-ticket-transfer-design.md`.

## Global Constraints

- **No database migration.** `scanner.ticket_transfers` and `scanner.ticket_assignments.transfer_id` already exist with the required partial unique indexes. Do not create one.
- **Never revoke or reissue a QR credential.** `scanner.qr_credentials` is not touched by this feature at all.
- Stored transfer statuses are exactly `pending`, `accepted`, `declined`, `cancelled`. `expired` is **derived on read** and never written.
- `expires_at = min(created_at + 7 days, event.starts_at)`.
- Ticket ids are identical across schemas: `scanner.ticket_entitlements.id == public.tickets.id`. No translation table.
- Ownership columns `attendee_email`, `attendee_name`, `attendee_phone` on `public.tickets` are owned **solely** by the transfer engine. The state-blob sync must never write them on an existing row.
- FastAPI route paths must be flat (no dynamic path segments) to match the Vercel filesystem-entrypoint convention.
- Follow existing patterns: routers in `backend/*_routes.py` included by `backend/main.py`; Vercel entrypoints in `api/**/*.py` containing only `from backend.main import app`; frontend API clients in `src/*Api.ts` using `authFetch` + `SCANNER_API_BASE_URL`.

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/transfer_service.py` (create) | Pure domain logic: expiry calculation, derived status, eligibility rules. No database access, no HTTP. |
| `backend/transfer_routes.py` (create) | HTTP layer: the four endpoints, request validation, transaction orchestration. |
| `backend/main.py` (modify) | Include the new router. |
| `api/tickets/mine.py`, `api/transfers/list.py`, `api/transfers/create.py`, `api/transfers/respond.py` (create) | Vercel entrypoints, one line each. |
| `server/store.ts` (modify) | Upsert instead of truncate; exclude ownership columns from the ticket `DO UPDATE`. |
| `src/transferApi.ts` (create) | Frontend API client + shared types. |
| `src/pages/Approvals.tsx` (modify) | My Tickets tab, incoming transfers in the Requests tab. |
| `src/App.tsx` (modify) | Pass `addToast` to Approvals; include pending incoming transfers in the nav badge. |
| `tests/test_transfer_service.py` (create) | Unit tests for the pure domain logic. |
| `tests/test_transfer_routes.py` (create) | Endpoint tests with mocked DB sessions. |
| `server/app.test.ts` (modify) | Regression test that the sync never rewrites ownership columns. |

---

### Task 1: Stop the state sync from destroying ticket ownership

Without this, every transfer is silently reverted the next time any browser autosaves. It must land first.

**Files:**
- Modify: `server/store.ts` (the `syncReportingTables` method, ~line 165 onward)
- Test: `server/app.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: exported constant `TICKET_UPSERT_SQL: string` from `server/store.ts`, used by the test in this task.

- [ ] **Step 1: Write the failing test**

Add to `server/app.test.ts` (imports at top of file: add `TICKET_UPSERT_SQL` to the existing `./store.js` import, and `readFile` from `node:fs/promises`):

```typescript
test("ticket upsert never overwrites owner columns", () => {
  const doUpdate = TICKET_UPSERT_SQL.split(/DO UPDATE SET/i)[1];
  assert.ok(doUpdate, "ticket upsert must have a DO UPDATE clause");
  for (const column of ["attendee_email", "attendee_name", "attendee_phone"]) {
    assert.ok(
      !doUpdate.includes(column),
      `${column} is owned by the transfer engine and must not be in DO UPDATE`,
    );
  }
  assert.ok(doUpdate.includes("category_name"), "non-owner columns must still update");
});

test("state sync never truncates the reporting tables", async () => {
  const source = await readFile(new URL("./store.ts", import.meta.url), "utf8");
  assert.ok(
    !/TRUNCATE/i.test(source),
    "TRUNCATE deletes rows created by other users; use upserts",
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api`
Expected: FAIL — `TICKET_UPSERT_SQL` is not exported, and `TRUNCATE` is still present in `store.ts`.

- [ ] **Step 3: Extract the ticket upsert SQL as an exported constant**

In `server/store.ts`, above the `PostgresAppStateStore` class:

```typescript
// attendee_email / attendee_name / attendee_phone are deliberately absent from
// DO UPDATE: they are owned by the transfer engine (backend/transfer_routes.py).
// The client state blob may carry a stale owner and must never win.
export const TICKET_UPSERT_SQL = `INSERT INTO tickets (
  id, event_id, order_id, category_id, category_name, price, attendee_name, attendee_phone, attendee_email,
  qr_token, status, issued_at, checked_in_at, gate_scanned, scanned_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::ticket_status, $12, $13, $14, $15)
ON CONFLICT (id) DO UPDATE SET
  event_id = EXCLUDED.event_id,
  order_id = EXCLUDED.order_id,
  category_id = EXCLUDED.category_id,
  category_name = EXCLUDED.category_name,
  price = EXCLUDED.price,
  qr_token = EXCLUDED.qr_token,
  status = EXCLUDED.status,
  issued_at = EXCLUDED.issued_at,
  checked_in_at = EXCLUDED.checked_in_at,
  gate_scanned = EXCLUDED.gate_scanned,
  scanned_by = EXCLUDED.scanned_by,
  updated_at = now()`;
```

- [ ] **Step 4: Delete the TRUNCATE and use the constant**

In `syncReportingTables`, delete the whole `await client.query(\`TRUNCATE TABLE … RESTART IDENTITY CASCADE\`)` call (currently `server/store.ts:173-187`).

Replace the ticket insert (currently `server/store.ts:327`) so it uses the constant — the parameter array is unchanged:

```typescript
await client.query(TICKET_UPSERT_SQL, [
  ticketDbId,
  eventIds.get(ticket.eventId),
  orderIds.get(ticket.orderId),
  category ? categoryIds.get(category.id) ?? null : null,
  ticket.categoryName,
  ticket.price,
  ticket.attendeeName,
  ticket.attendeePhone,
  ticket.attendeeEmail,
  ticket.qrToken,
  ticket.status,
  toDate(ticket.issuedAt),
  ticket.checkedInAt ? toDate(ticket.checkedInAt) : null,
  ticket.gateScanned ?? null,
  ticket.scannedBy ?? null,
]);
```

- [ ] **Step 5: Add ON CONFLICT to every other insert in the method**

Removing TRUNCATE makes every remaining `INSERT` fail on the second save with a duplicate-key error. Append an `ON CONFLICT (id) DO UPDATE SET` clause listing that statement's non-id columns to each of: `organizations`, `users`, `access_requests`, `invite_passes`, `events`, `ticket_categories`, `orders`, `scan_logs`, `settlements`, `audit_logs`.

Pattern to follow, using `events` as the worked example:

```typescript
await client.query(
  `INSERT INTO events (
    id, organization_id, title, description, event_type, venue, start_time, end_time, banner_url, capacity
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    event_type = EXCLUDED.event_type,
    venue = EXCLUDED.venue,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    banner_url = EXCLUDED.banner_url,
    capacity = EXCLUDED.capacity,
    updated_at = now()`,
  [ /* unchanged parameter array */ ],
);
```

Two notes: only tables that have an `updated_at` column get the `updated_at = now()` line (`organizations`, `users`, `events`, `ticket_categories`, `orders`, `tickets`, `access_requests`, `invite_passes`, `settlements`); and `tickets` is the **only** table with columns excluded from `DO UPDATE`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api`
Expected: PASS — all previously passing tests plus the two new ones.

- [ ] **Step 7: Typecheck**

Run: `npm run lint`
Expected: no output (clean).

- [ ] **Step 8: Commit**

```bash
git add server/store.ts server/app.test.ts
git commit -m "fix(state): upsert reporting tables instead of truncating

TRUNCATE ... CASCADE deleted every row on each save, so one browser's
autosave destroyed data created by another user, and any server-side
change to ticket ownership was reverted on the next save.

Upsert instead, and deliberately exclude attendee_email/name/phone from
the ticket DO UPDATE so ticket ownership is owned solely by the transfer
engine."
```

---

### Task 2: Transfer domain logic

Pure functions, no database and no HTTP, so every eligibility rule is testable without mocks.

**Files:**
- Create: `backend/transfer_service.py`
- Test: `tests/test_transfer_service.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `TRANSFER_PENDING`, `TRANSFER_ACCEPTED`, `TRANSFER_DECLINED`, `TRANSFER_CANCELLED`, `TRANSFER_EXPIRED: str`
  - `transfer_expiry(created_at: datetime, event_starts_at: datetime) -> datetime`
  - `effective_status(status: str, expires_at: datetime, now: datetime) -> str`
  - `ticket_block_reason(*, entry_count: int, ticket_status: str, event_starts_at: datetime, now: datetime) -> str | None`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_transfer_service.py`:

```python
from datetime import datetime, timedelta, timezone

from backend.transfer_service import (
    TRANSFER_EXPIRED,
    TRANSFER_PENDING,
    effective_status,
    ticket_block_reason,
    transfer_expiry,
)

NOW = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)


def test_expiry_is_seven_days_when_event_is_far_away():
    assert transfer_expiry(NOW, NOW + timedelta(days=30)) == NOW + timedelta(days=7)


def test_expiry_is_capped_at_event_start():
    starts = NOW + timedelta(hours=1)
    assert transfer_expiry(NOW, starts) == starts


def test_pending_transfer_past_expiry_reads_as_expired():
    assert effective_status(TRANSFER_PENDING, NOW - timedelta(seconds=1), NOW) == TRANSFER_EXPIRED


def test_pending_transfer_before_expiry_stays_pending():
    assert effective_status(TRANSFER_PENDING, NOW + timedelta(days=1), NOW) == TRANSFER_PENDING


def test_terminal_status_is_never_rewritten_by_expiry():
    assert effective_status("accepted", NOW - timedelta(days=9), NOW) == "accepted"


def test_scanned_ticket_is_not_transferable():
    reason = ticket_block_reason(
        entry_count=1, ticket_status="active", event_starts_at=NOW + timedelta(days=1), now=NOW
    )
    assert reason == "TICKET_ALREADY_SCANNED"


def test_refunded_ticket_is_not_transferable():
    reason = ticket_block_reason(
        entry_count=0, ticket_status="refunded", event_starts_at=NOW + timedelta(days=1), now=NOW
    )
    assert reason == "TICKET_NOT_ACTIVE"


def test_started_event_blocks_transfer():
    reason = ticket_block_reason(
        entry_count=0, ticket_status="active", event_starts_at=NOW - timedelta(minutes=1), now=NOW
    )
    assert reason == "EVENT_ALREADY_STARTED"


def test_clean_ticket_has_no_block_reason():
    assert ticket_block_reason(
        entry_count=0, ticket_status="issued", event_starts_at=NOW + timedelta(days=1), now=NOW
    ) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_transfer_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.transfer_service'`.

- [ ] **Step 3: Write the implementation**

Create `backend/transfer_service.py`:

```python
"""Pure domain rules for ticket transfers.

No database and no HTTP: every rule here is a function of its arguments so it
can be tested directly. The HTTP layer lives in backend/transfer_routes.py.
"""

from datetime import datetime, timedelta

TRANSFER_PENDING = "pending"
TRANSFER_ACCEPTED = "accepted"
TRANSFER_DECLINED = "declined"
TRANSFER_CANCELLED = "cancelled"
TRANSFER_EXPIRED = "expired"  # derived on read, never stored

TRANSFER_WINDOW = timedelta(days=7)

# Ticket states that may still be transferred.
_TRANSFERABLE_TICKET_STATUSES = {"ACTIVE", "ISSUED", "PAID"}


def transfer_expiry(created_at: datetime, event_starts_at: datetime) -> datetime:
    """A transfer must never be acceptable once the event has begun."""
    return min(created_at + TRANSFER_WINDOW, event_starts_at)


def effective_status(status: str, expires_at: datetime, now: datetime) -> str:
    """Report a lapsed pending transfer as expired without writing to the row.

    Deriving expiry on read is what lets this feature work with no scheduler.
    """
    if status == TRANSFER_PENDING and expires_at <= now:
        return TRANSFER_EXPIRED
    return status


def ticket_block_reason(
    *,
    entry_count: int,
    ticket_status: str,
    event_starts_at: datetime,
    now: datetime,
) -> str | None:
    """Return an error code if this ticket cannot be transferred, else None.

    Called at both initiate and accept: arbitrary time passes in between, during
    which the ticket may be scanned or the event may start.
    """
    if entry_count > 0:
        return "TICKET_ALREADY_SCANNED"
    if str(ticket_status).upper() not in _TRANSFERABLE_TICKET_STATUSES:
        return "TICKET_NOT_ACTIVE"
    if event_starts_at <= now:
        return "EVENT_ALREADY_STARTED"
    return None
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python -m pytest tests/test_transfer_service.py -v`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/transfer_service.py tests/test_transfer_service.py
git commit -m "feat(transfer): add pure domain rules for ticket transfer

Expiry capped at event start, expired derived on read so no scheduler is
needed, and the eligibility rules that must hold at both initiate and
accept."
```

---

### Task 3: Transfer endpoints

**Files:**
- Create: `backend/transfer_routes.py`
- Create: `api/tickets/mine.py`, `api/transfers/list.py`, `api/transfers/create.py`, `api/transfers/respond.py`
- Modify: `backend/main.py`
- Test: `tests/test_transfer_routes.py`

**Interfaces:**
- Consumes: everything `backend/transfer_service.py` produces (Task 2).
- Produces, for the frontend in Tasks 4-5:
  - `GET /api/tickets/mine` → `{"tickets": [{id, ticket_type, event_id, event_name, venue, starts_at, entry_count, pending_transfer: {id, to_email, expires_at} | null}]}`
  - `GET /api/transfers/list` → `{"incoming": [T], "outgoing": [T]}` where `T = {id, ticket_id, ticket_type, event_name, starts_at, from_name, from_email, to_email, status, created_at, expires_at}`
  - `POST /api/transfers/create` body `{ticket_id: str, to_email: str}` → `{"id": str, "status": "pending", "expires_at": str}`
  - `POST /api/transfers/respond` body `{transfer_id: str, action: "accept"|"decline"|"cancel"}` → `{"status": str}`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_transfer_routes.py`:

```python
"""Endpoint tests for the transfer API, with the DB session mocked.

Follows the pattern in tests/test_scanner_validate.py: dependency overrides
supply a fake user and a MagicMock session, so no database is required.
"""

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.db import get_db
from backend.main import app
from backend.models import User
from backend.security import get_current_user


def _user(email: str = "sender@example.com", name: str = "Sender"):
    u = MagicMock(spec=User)
    u.id = uuid.uuid4()
    u.email = email
    u.display_name = name
    u.status = "active"
    return u


@pytest.fixture
def client_and_db():
    db = MagicMock()
    caller = _user()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: caller
    yield TestClient(app), db, caller
    app.dependency_overrides.clear()


def test_create_rejects_unregistered_recipient(client_and_db):
    client, db, _ = client_and_db
    db.execute.return_value.mappings.return_value.one_or_none.return_value = None

    response = client.post(
        "/api/transfers/create",
        json={"ticket_id": str(uuid.uuid4()), "to_email": "nobody@example.com"},
    )

    assert response.status_code == 404
    assert "account" in response.json()["detail"].lower()


def test_create_rejects_transfer_to_self(client_and_db):
    client, db, caller = client_and_db

    response = client.post(
        "/api/transfers/create",
        json={"ticket_id": str(uuid.uuid4()), "to_email": caller.email},
    )

    assert response.status_code == 409
    assert "yourself" in response.json()["detail"].lower()


def test_respond_rejects_unknown_action(client_and_db):
    client, _, _ = client_and_db

    response = client.post(
        "/api/transfers/respond",
        json={"transfer_id": str(uuid.uuid4()), "action": "steal"},
    )

    assert response.status_code == 422


def test_endpoints_require_authentication():
    # No dependency overrides: the real get_current_user rejects a missing token.
    client = TestClient(app)
    assert client.get("/api/tickets/mine").status_code == 401
    assert client.get("/api/transfers/list").status_code == 401
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python -m pytest tests/test_transfer_routes.py -v`
Expected: FAIL — all routes return 404, since the router does not exist yet.

- [ ] **Step 3: Write the router**

Create `backend/transfer_routes.py`:

```python
"""Ticket transfer endpoints.

Ownership moves by ending one scanner.ticket_assignments row and inserting
another inside a single transaction. The partial unique index
ix_one_active_assignment_per_ticket makes a concurrent double-accept fail at
the database level rather than relying on application checks.

No QR credential is touched: a user's QR identifies the person, and the
scanner resolves person -> active assignments. Moving the assignment is what
makes the ticket work for the recipient and stop working for the sender.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User
from backend.security import get_current_user
from backend.transfer_service import (
    TRANSFER_ACCEPTED,
    TRANSFER_CANCELLED,
    TRANSFER_DECLINED,
    TRANSFER_PENDING,
    effective_status,
    ticket_block_reason,
    transfer_expiry,
)

router = APIRouter(tags=["transfers"])


class CreateTransferRequest(BaseModel):
    ticket_id: str = Field(min_length=1, max_length=64)
    to_email: str = Field(min_length=3, max_length=320)

    @field_validator("to_email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        local, separator, domain = email.partition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("Enter a valid email address")
        return email


class RespondTransferRequest(BaseModel):
    transfer_id: str = Field(min_length=1, max_length=64)
    action: str

    @field_validator("action")
    @classmethod
    def known_action(cls, value: str) -> str:
        if value not in {"accept", "decline", "cancel"}:
            raise ValueError("action must be accept, decline or cancel")
        return value


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/api/tickets/mine")
def my_tickets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.execute(
            text(
                """
                SELECT
                    te.id, te.ticket_type, te.entry_count,
                    e.id AS event_id, e.name AS event_name, e.venue, e.starts_at,
                    tr.id AS transfer_id, tr.to_email, tr.expires_at
                FROM scanner.ticket_assignments ta
                JOIN scanner.ticket_entitlements te ON te.id = ta.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                LEFT JOIN scanner.ticket_transfers tr
                       ON tr.ticket_id = te.id AND tr.status = 'pending'
                WHERE ta.assigned_to_user_id = :uid
                  AND ta.status = 'active'
                  AND e.ends_at > now()
                  AND lower(te.status) NOT IN ('cancelled', 'refunded', 'expired')
                ORDER BY e.starts_at
                """
            ),
            {"uid": str(user.id)},
        )
        .mappings()
        .all()
    )
    return {
        "tickets": [
            {
                "id": str(row["id"]),
                "ticket_type": row["ticket_type"],
                "event_id": str(row["event_id"]),
                "event_name": row["event_name"],
                "venue": row["venue"],
                "starts_at": row["starts_at"].isoformat(),
                "entry_count": row["entry_count"],
                "pending_transfer": (
                    {
                        "id": str(row["transfer_id"]),
                        "to_email": row["to_email"],
                        "expires_at": row["expires_at"].isoformat(),
                    }
                    if row["transfer_id"]
                    else None
                ),
            }
            for row in rows
        ]
    }


@router.get("/api/transfers/list")
def list_transfers(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rows = (
        db.execute(
            text(
                """
                SELECT
                    tr.id, tr.ticket_id, tr.from_user_id, tr.to_user_id,
                    tr.to_email, tr.status, tr.created_at, tr.expires_at,
                    te.ticket_type, e.name AS event_name, e.starts_at,
                    sender.display_name AS from_name, sender.email AS from_email
                FROM scanner.ticket_transfers tr
                JOIN scanner.ticket_entitlements te ON te.id = tr.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                JOIN scanner.users sender ON sender.id = tr.from_user_id
                WHERE tr.from_user_id = :uid OR tr.to_user_id = :uid
                ORDER BY tr.created_at DESC
                """
            ),
            {"uid": str(user.id)},
        )
        .mappings()
        .all()
    )
    now = _now()
    incoming, outgoing = [], []
    for row in rows:
        item = {
            "id": str(row["id"]),
            "ticket_id": str(row["ticket_id"]),
            "ticket_type": row["ticket_type"],
            "event_name": row["event_name"],
            "starts_at": row["starts_at"].isoformat(),
            "from_name": row["from_name"],
            "from_email": row["from_email"],
            "to_email": row["to_email"],
            "status": effective_status(row["status"], row["expires_at"], now),
            "created_at": row["created_at"].isoformat(),
            "expires_at": row["expires_at"].isoformat(),
        }
        if str(row["to_user_id"]) == str(user.id):
            incoming.append(item)
        else:
            outgoing.append(item)
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/api/transfers/create")
def create_transfer(
    request: CreateTransferRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if request.to_email == user.email.strip().lower():
        raise HTTPException(409, "You cannot transfer a ticket to yourself")

    recipient = (
        db.execute(
            text("SELECT id FROM scanner.users WHERE lower(email) = :email LIMIT 1"),
            {"email": request.to_email},
        )
        .mappings()
        .one_or_none()
    )
    if recipient is None:
        raise HTTPException(
            404,
            "No GatePass account for that email. Ask them to sign up first, then try again.",
        )

    ticket = (
        db.execute(
            text(
                """
                SELECT te.id, te.status, te.entry_count, e.starts_at
                FROM scanner.ticket_assignments ta
                JOIN scanner.ticket_entitlements te ON te.id = ta.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                WHERE ta.ticket_id = :ticket_id
                  AND ta.assigned_to_user_id = :uid
                  AND ta.status = 'active'
                """
            ),
            {"ticket_id": request.ticket_id, "uid": str(user.id)},
        )
        .mappings()
        .one_or_none()
    )
    if ticket is None:
        raise HTTPException(404, "That ticket is not assigned to you")

    now = _now()
    reason = ticket_block_reason(
        entry_count=ticket["entry_count"],
        ticket_status=ticket["status"],
        event_starts_at=ticket["starts_at"],
        now=now,
    )
    if reason is not None:
        raise HTTPException(409, reason)

    transfer_id = str(uuid.uuid4())
    expires_at = transfer_expiry(now, ticket["starts_at"])
    try:
        db.execute(
            text(
                """
                INSERT INTO scanner.ticket_transfers (
                    id, ticket_id, from_user_id, to_user_id, to_email, status, expires_at
                ) VALUES (
                    :id, :ticket_id, :from_id, :to_id, :to_email, 'pending', :expires_at
                )
                """
            ),
            {
                "id": transfer_id,
                "ticket_id": request.ticket_id,
                "from_id": str(user.id),
                "to_id": str(recipient["id"]),
                "to_email": request.to_email,
                "expires_at": expires_at,
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This ticket already has a pending transfer")

    return {"id": transfer_id, "status": TRANSFER_PENDING, "expires_at": expires_at.isoformat()}


@router.post("/api/transfers/respond")
def respond_to_transfer(
    request: RespondTransferRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    transfer = (
        db.execute(
            text(
                """
                SELECT tr.id, tr.ticket_id, tr.from_user_id, tr.to_user_id,
                       tr.status, tr.expires_at, te.status AS ticket_status,
                       te.entry_count, e.starts_at
                FROM scanner.ticket_transfers tr
                JOIN scanner.ticket_entitlements te ON te.id = tr.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                WHERE tr.id = :id
                FOR UPDATE OF tr
                """
            ),
            {"id": request.transfer_id},
        )
        .mappings()
        .one_or_none()
    )
    if transfer is None:
        raise HTTPException(404, "Transfer not found")

    now = _now()
    status = effective_status(transfer["status"], transfer["expires_at"], now)
    if status != TRANSFER_PENDING:
        db.rollback()
        raise HTTPException(409, f"This transfer is already {status}")

    is_recipient = str(transfer["to_user_id"]) == str(user.id)
    is_sender = str(transfer["from_user_id"]) == str(user.id)

    if request.action == "cancel":
        if not is_sender:
            raise HTTPException(403, "Only the sender can cancel a transfer")
        new_status = TRANSFER_CANCELLED
    elif request.action == "decline":
        if not is_recipient:
            raise HTTPException(403, "Only the recipient can decline a transfer")
        new_status = TRANSFER_DECLINED
    else:
        if not is_recipient:
            raise HTTPException(403, "Only the recipient can accept a transfer")
        new_status = TRANSFER_ACCEPTED

    if new_status != TRANSFER_ACCEPTED:
        db.execute(
            text("UPDATE scanner.ticket_transfers SET status = :s WHERE id = :id"),
            {"s": new_status, "id": request.transfer_id},
        )
        db.commit()
        return {"status": new_status}

    # Accept: re-check eligibility, then move ownership atomically.
    reason = ticket_block_reason(
        entry_count=transfer["entry_count"],
        ticket_status=transfer["ticket_status"],
        event_starts_at=transfer["starts_at"],
        now=now,
    )
    if reason is not None:
        db.rollback()
        raise HTTPException(409, reason)

    db.execute(
        text(
            """
            UPDATE scanner.ticket_assignments
            SET status = 'ended', ended_at = now()
            WHERE ticket_id = :ticket_id AND status = 'active'
            """
        ),
        {"ticket_id": str(transfer["ticket_id"])},
    )
    db.execute(
        text(
            """
            INSERT INTO scanner.ticket_assignments (
                id, ticket_id, assigned_to_user_id, status, transfer_id
            ) VALUES (:id, :ticket_id, :uid, 'active', :transfer_id)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "ticket_id": str(transfer["ticket_id"]),
            "uid": str(user.id),
            "transfer_id": request.transfer_id,
        },
    )
    # public.tickets is the fallback the scanner reads when the scanner.* rows
    # are missing, and the organizer console reads it directly, so both must
    # agree. attendee_phone is cleared rather than carried over: scanner.users
    # holds no phone number and keeping the sender's would leak it.
    db.execute(
        text(
            """
            UPDATE public.tickets
            SET attendee_email = :email, attendee_name = :name, attendee_phone = '',
                updated_at = now()
            WHERE id = :ticket_id
            """
        ),
        {
            "email": user.email.strip().lower(),
            "name": user.display_name,
            "ticket_id": str(transfer["ticket_id"]),
        },
    )
    db.execute(
        text(
            """
            UPDATE scanner.ticket_transfers
            SET status = 'accepted', accepted_at = now()
            WHERE id = :id
            """
        ),
        {"id": request.transfer_id},
    )
    db.commit()
    return {"status": TRANSFER_ACCEPTED}
```

- [ ] **Step 4: Register the router**

In `backend/main.py`, beside the existing router imports and includes:

```python
from backend.transfer_routes import router as transfer_router
```

```python
app.include_router(transfer_router)
```

- [ ] **Step 5: Create the four Vercel entrypoints**

Each file contains exactly this, matching `api/scanner/validate.py`. Create `api/tickets/mine.py`, `api/transfers/list.py`, `api/transfers/create.py`, and `api/transfers/respond.py`, changing only the docstring:

```python
"""Vercel entrypoint for the ticket transfer API."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.main import app  # noqa: E402

__all__ = ["app"]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `python -m pytest tests/test_transfer_routes.py -v`
Expected: PASS — 4 tests.

- [ ] **Step 7: Run the whole Python suite for regressions**

Run: `python -m pytest tests/ -q`
Expected: PASS — all pre-existing tests plus the new ones.

- [ ] **Step 8: Commit**

```bash
git add backend/transfer_routes.py backend/main.py api/tickets api/transfers tests/test_transfer_routes.py
git commit -m "feat(transfer): add ticket transfer endpoints

Create, list, accept, decline and cancel. Accept moves the assignment
inside one transaction; the existing partial unique index makes a
concurrent double-accept impossible. No QR credential is touched."
```

---

### Task 4: My Tickets tab — see tickets and start a transfer

**Files:**
- Create: `src/transferApi.ts`
- Modify: `src/pages/Approvals.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: the four endpoints from Task 3.
- Produces, for Task 5:
  - `src/transferApi.ts` exports types `MyTicket`, `TransferSummary`, `TransferLists` and functions `fetchMyTickets()`, `fetchTransfers()`, `createTransfer(ticketId, toEmail)`, `respondToTransfer(transferId, action)`.
  - `ApprovalsInvites` accepts a new optional prop `onToast?: (type: "success" | "error" | "warning" | "info", text: string) => void`.

- [ ] **Step 1: Write the API client**

Create `src/transferApi.ts`, mirroring `src/scannerApi.ts`:

```typescript
import { authFetch } from "./authFetch";
import { SCANNER_API_BASE_URL } from "./apiBase";

export type TransferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export interface MyTicket {
  id: string;
  ticket_type: string;
  event_id: string;
  event_name: string;
  venue: string;
  starts_at: string;
  entry_count: number;
  pending_transfer: { id: string; to_email: string; expires_at: string } | null;
}

export interface TransferSummary {
  id: string;
  ticket_id: string;
  ticket_type: string;
  event_name: string;
  starts_at: string;
  from_name: string;
  from_email: string;
  to_email: string;
  status: TransferStatus;
  created_at: string;
  expires_at: string;
}

export interface TransferLists {
  incoming: TransferSummary[];
  outgoing: TransferSummary[];
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.detail ?? data?.message ?? `Request failed (${response.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data as T;
}

export async function fetchMyTickets(): Promise<MyTicket[]> {
  const data = await readJson<{ tickets: MyTicket[] }>(
    await authFetch(`${SCANNER_API_BASE_URL}/api/tickets/mine`),
  );
  return data.tickets;
}

export async function fetchTransfers(): Promise<TransferLists> {
  return readJson<TransferLists>(
    await authFetch(`${SCANNER_API_BASE_URL}/api/transfers/list`),
  );
}

export async function createTransfer(ticketId: string, toEmail: string): Promise<void> {
  await readJson(
    await authFetch(`${SCANNER_API_BASE_URL}/api/transfers/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, to_email: toEmail }),
    }),
  );
}

export async function respondToTransfer(
  transferId: string,
  action: "accept" | "decline" | "cancel",
): Promise<void> {
  await readJson(
    await authFetch(`${SCANNER_API_BASE_URL}/api/transfers/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_id: transferId, action }),
    }),
  );
}
```

- [ ] **Step 2: Typecheck the client**

Run: `npm run lint`
Expected: no output (clean).

- [ ] **Step 3: Load tickets and transfers in Approvals**

In `src/pages/Approvals.tsx`, extend the props interface with `onToast?: (type: "success" | "error" | "warning" | "info", text: string) => void;`, widen the tab state, and add the data-loading effect:

Change the existing React import from `import React, { useState } from "react";` to
`import React, { useEffect, useState } from "react";`, then add:

```typescript
import {
  createTransfer,
  fetchMyTickets,
  fetchTransfers,
  respondToTransfer,
  type MyTicket,
  type TransferLists,
} from "../transferApi";
```

```typescript
const [activeTab, setActiveTab] = useState<"requests" | "invites" | "tickets">("requests");
const [myTickets, setMyTickets] = useState<MyTicket[]>([]);
const [transfers, setTransfers] = useState<TransferLists>({ incoming: [], outgoing: [] });
const [transferBusy, setTransferBusy] = useState(false);
const [transferTarget, setTransferTarget] = useState<MyTicket | null>(null);
const [recipientEmail, setRecipientEmail] = useState("");

const loadTransferData = async () => {
  try {
    const [tickets, lists] = await Promise.all([fetchMyTickets(), fetchTransfers()]);
    setMyTickets(tickets);
    setTransfers(lists);
  } catch (error) {
    onToast?.("error", error instanceof Error ? error.message : "Could not load tickets.");
  }
};

useEffect(() => {
  void loadTransferData();
}, []);
```

- [ ] **Step 4: Add the transfer action handlers**

```typescript
const handleCreateTransfer = async () => {
  if (!transferTarget || !recipientEmail.trim()) return;
  setTransferBusy(true);
  try {
    await createTransfer(transferTarget.id, recipientEmail.trim());
    onToast?.("success", `Transfer request sent to ${recipientEmail.trim()}.`);
    setTransferTarget(null);
    setRecipientEmail("");
    await loadTransferData();
  } catch (error) {
    onToast?.("error", error instanceof Error ? error.message : "Transfer failed.");
  } finally {
    setTransferBusy(false);
  }
};

const handleCancelTransfer = async (transferId: string) => {
  setTransferBusy(true);
  try {
    await respondToTransfer(transferId, "cancel");
    onToast?.("info", "Transfer cancelled.");
    await loadTransferData();
  } catch (error) {
    onToast?.("error", error instanceof Error ? error.message : "Could not cancel.");
  } finally {
    setTransferBusy(false);
  }
};
```

- [ ] **Step 5: Add the tab button**

Beside the two existing tab buttons, matching their styling exactly:

```tsx
<button
  id="btn-tickets-tab"
  onClick={() => setActiveTab("tickets")}
  className={`flex-1 py-3 text-center rounded-lg font-bold text-xs tracking-wider transition-all cursor-pointer ${
    activeTab === "tickets"
      ? "bg-white text-primary shadow-sm"
      : "text-on-surface-variant hover:text-charcoal-dark"
  }`}
>
  MY TICKETS ({myTickets.length})
</button>
```

- [ ] **Step 6: Add the tab content and transfer modal**

After the existing `{activeTab === "invites" && ( … )}` block:

```tsx
{activeTab === "tickets" && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {myTickets.length === 0 ? (
      <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-outline-variant/20">
        <h3 className="font-bold text-charcoal-dark">No tickets yet</h3>
        <p className="text-sm text-on-surface-variant mt-1">
          Tickets you buy or receive will appear here.
        </p>
      </div>
    ) : (
      myTickets.map((ticket) => (
        <div key={ticket.id} className="bg-white rounded-2xl p-5 border border-outline-variant/20 flex flex-col gap-3">
          <div>
            <h3 className="font-extrabold text-charcoal-dark text-base">{ticket.event_name}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {ticket.ticket_type} · {ticket.venue}
            </p>
            <p className="text-xs text-outline mt-0.5">
              {new Date(ticket.starts_at).toLocaleString()}
            </p>
          </div>
          {ticket.pending_transfer ? (
            <div className="flex items-center justify-between gap-2 border-t border-surface-container pt-3">
              <span className="text-xs font-bold text-status-warning">
                Transfer pending → {ticket.pending_transfer.to_email}
              </span>
              <button
                onClick={() => void handleCancelTransfer(ticket.pending_transfer!.id)}
                disabled={transferBusy}
                className="px-3 py-2 rounded-lg text-xs font-bold border border-outline-variant text-charcoal-dark disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setTransferTarget(ticket)}
              className="min-h-11 rounded-lg bg-charcoal-dark text-white text-xs font-black uppercase tracking-wider"
            >
              Transfer ticket
            </button>
          )}
        </div>
      ))
    )}
  </div>
)}

{transferTarget && (
  <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
    <div className="w-full max-w-sm bg-white rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-black text-charcoal-dark">Transfer ticket</h3>
        <p className="text-xs text-on-surface-variant mt-1">
          {transferTarget.event_name} · {transferTarget.ticket_type}
        </p>
      </div>
      <label className="text-xs font-bold text-outline uppercase" htmlFor="recipient-email">
        Recipient's GatePass email
      </label>
      <input
        id="recipient-email"
        type="email"
        value={recipientEmail}
        onChange={(e) => setRecipientEmail(e.target.value)}
        placeholder="friend@example.com"
        className="min-h-12 w-full border border-outline-variant rounded-lg px-3 text-sm font-semibold"
      />
      <p className="text-[11px] text-on-surface-variant">
        They must already have a GatePass account. The ticket stays yours until they accept.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setTransferTarget(null); setRecipientEmail(""); }}
          className="min-h-11 rounded-lg border border-outline-variant text-xs font-bold"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleCreateTransfer()}
          disabled={transferBusy || !recipientEmail.trim()}
          className="min-h-11 rounded-lg bg-primary text-white text-xs font-black disabled:opacity-40"
        >
          Send request
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Show outgoing transfer outcomes**

The spec requires the sender to be notified when the recipient accepts or
declines. In-app, that is the outgoing list — without this the sender only ever
sees "pending" and never learns the outcome.

Add below the ticket grid inside the `{activeTab === "tickets" && ( … )}` block,
after the closing `</div>` of the grid:

```tsx
{transfers.outgoing.length > 0 && (
  <div className="mt-6">
    <h3 className="text-xs font-black uppercase tracking-wider text-outline mb-3">
      Transfers you sent
    </h3>
    <div className="flex flex-col gap-2">
      {transfers.outgoing.map((transfer) => (
        <div
          key={transfer.id}
          className="bg-white rounded-xl p-4 border border-outline-variant/20 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-charcoal-dark truncate">
              {transfer.event_name}
            </p>
            <p className="text-xs text-on-surface-variant truncate">
              To {transfer.to_email} · {new Date(transfer.created_at).toLocaleDateString()}
            </p>
          </div>
          <span
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
              transfer.status === "accepted"
                ? "bg-status-success/10 text-status-success"
                : transfer.status === "pending"
                  ? "bg-status-warning/10 text-status-warning"
                  : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {transfer.status}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

This renders all five statuses, satisfying the spec's "Transfer Status" display
requirement for the sender.

- [ ] **Step 8: Pass the toast handler from App**

In `src/App.tsx`, on the `<ApprovalsInvites … />` element, add `onToast={addToast}`.

- [ ] **Step 9: Typecheck**

Run: `npm run lint`
Expected: no output (clean).

- [ ] **Step 10: Commit**

```bash
git add src/transferApi.ts src/pages/Approvals.tsx src/App.tsx
git commit -m "feat(transfer): add My Tickets tab with transfer and cancel

Attendees had no view of their own tickets at all - the tickets list was
only ever passed to the organizer console."
```

---

### Task 5: Incoming transfers — accept and decline

**Files:**
- Modify: `src/pages/Approvals.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `transfers.incoming`, `respondToTransfer`, `loadTransferData` from Task 4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the accept/decline handler**

In `src/pages/Approvals.tsx`, beside the Task 4 handlers:

```typescript
const handleRespondToTransfer = async (
  transferId: string,
  action: "accept" | "decline",
  eventName: string,
) => {
  setTransferBusy(true);
  try {
    await respondToTransfer(transferId, action);
    onToast?.(
      action === "accept" ? "success" : "info",
      action === "accept"
        ? `Ticket for ${eventName} is now yours.`
        : `Declined the ticket for ${eventName}.`,
    );
    await loadTransferData();
  } catch (error) {
    onToast?.("error", error instanceof Error ? error.message : "Could not respond.");
  } finally {
    setTransferBusy(false);
  }
};

const pendingIncoming = transfers.incoming.filter((t) => t.status === "pending");
```

- [ ] **Step 2: Show incoming transfers in the Requests tab**

Inside the `{activeTab === "requests" && ( … )}` block, immediately before the existing access-request list:

```tsx
{pendingIncoming.map((transfer) => (
  <div key={transfer.id} className="bg-white rounded-2xl p-5 border-2 border-primary/30 flex flex-col gap-3">
    <div>
      <span className="text-[10px] font-black uppercase tracking-wider text-primary">
        Ticket transfer
      </span>
      <h3 className="font-extrabold text-charcoal-dark text-base mt-1">
        {transfer.event_name}
      </h3>
      <p className="text-xs text-on-surface-variant mt-0.5">
        {transfer.ticket_type} · from {transfer.from_name}
      </p>
      <p className="text-[11px] text-outline mt-1">
        Expires {new Date(transfer.expires_at).toLocaleString()}
      </p>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => void handleRespondToTransfer(transfer.id, "decline", transfer.event_name)}
        disabled={transferBusy}
        className="min-h-11 rounded-lg border border-outline-variant text-xs font-bold disabled:opacity-40"
      >
        Decline
      </button>
      <button
        onClick={() => void handleRespondToTransfer(transfer.id, "accept", transfer.event_name)}
        disabled={transferBusy}
        className="min-h-11 rounded-lg bg-primary text-white text-xs font-black disabled:opacity-40"
      >
        Accept
      </button>
    </div>
  </div>
))}
```

Then update the empty-state condition so it accounts for both lists — change `pendingRequests.length === 0` to `pendingRequests.length === 0 && pendingIncoming.length === 0`, and the tab label to `INCOMING REQUESTS ({pendingRequests.length + pendingIncoming.length})`.

- [ ] **Step 3: Include pending transfers in the nav badge**

In `src/App.tsx`, add state and a load on mount:

```typescript
const [pendingTransferCount, setPendingTransferCount] = useState(0);

useEffect(() => {
  if (!isAuthenticated) return;
  fetchTransfers()
    .then((lists) =>
      setPendingTransferCount(lists.incoming.filter((t) => t.status === "pending").length),
    )
    .catch(() => setPendingTransferCount(0));
}, [isAuthenticated]);
```

Import `fetchTransfers` from `./transferApi`. Then in both places the Approvals badge is rendered, replace `requests.filter(r => r.status === "pending").length` with a single derived value defined near the other derived values:

```typescript
const pendingApprovalsCount =
  requests.filter((r) => r.status === "pending").length + pendingTransferCount;
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: no output (clean).

- [ ] **Step 5: Run every test suite**

Run: `npm run test:api && python -m pytest tests/ -q`
Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Approvals.tsx src/App.tsx
git commit -m "feat(transfer): accept or decline incoming ticket transfers

Incoming transfers appear beside access requests and are counted in the
nav badge, so the existing panel serves as the notification surface."
```

---

## Manual verification

After Task 5, with two accounts (a second Google account, or a colleague):

1. Sign in as A, buy a ticket for an event that has not started.
2. Approvals & Invites → My Tickets → Transfer → enter B's email → Send.
   Ticket still shows under A, marked "Transfer pending".
3. Enter an unregistered email: expect "No GatePass account for that email".
4. Sign in as B → Approvals & Invites → Incoming Requests shows the transfer → Accept.
5. Ticket now appears under B's My Tickets and is gone from A's.
6. Scan B's QR at that event's gate → approved. Scan A's QR → "No ticket for this event is assigned to this attendee".
7. Reload A's browser (forcing a state autosave) and re-check step 5 — ownership must not revert. This is the Task 1 guarantee.

## Known deviation from the original requirements

The original requirement said the sender may enter "the recipient's registered
email address **or GatePass user ID**". Only email is implemented. A user id is
an opaque UUID that nobody can read off a friend's screen, so it is not a route
a real user would take, and every lookup path it would add is a second way to
address the same record. If it is genuinely wanted, it is a small change:
`create_transfer` would try a uuid parse before falling back to the email
lookup.

## Deferred to the email phase

The Resend integration is being provisioned separately. Once `RESEND_API_KEY` is in the project env, emails hook onto the state transitions this plan already implements: send on create (both parties), on accept, on decline, and on cancel. No change to the transfer engine is required — only a notifier called at each transition.
