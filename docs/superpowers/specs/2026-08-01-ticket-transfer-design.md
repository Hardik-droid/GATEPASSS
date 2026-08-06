# Ticket Transfer — Design

**Date:** 2026-08-01
**Status:** Approved, ready for implementation planning
**Scope:** Server-authoritative ticket ownership + full transfer lifecycle + in-app
notifications. Transactional email is explicitly **deferred to a later phase**.

## Problem

A ticket purchaser must be able to hand a ticket to another registered GatePass
user. The recipient confirms before ownership moves, and afterwards only the
recipient can use the ticket.

Flow, as stated by the product owner:

> Sender transfers → receiver gets a pending approval → receiver accepts →
> ownership updates → the ticket is visible only in the receiver's account.

## Findings that shaped this design

Three facts about the current codebase changed the shape of the feature. They
are recorded here because they are not obvious and they justify decisions that
otherwise look like deviations from the original requirements.

### 1. The transfer schema already exists and is unused

`0001_scanner_schema.py` created `scanner.ticket_transfers` and
`scanner.ticket_assignments.transfer_id`, plus two partial unique indexes:

- `ix_one_pending_transfer_per_ticket` — `UNIQUE (ticket_id) WHERE status = 'pending'`
- `ix_one_active_assignment_per_ticket` — `UNIQUE (ticket_id) WHERE status = 'active'`

The second index is the "one ticket can never be held by two people" guarantee,
enforced by the database rather than by application logic. Nothing currently
writes to either table; `scanner_routes.py` hardcodes `is_transferred: False`.

**No migration is required for this feature.**

### 2. Ticket ownership is currently client-owned and destroyed on every save

`server/store.ts` `syncReportingTables()` runs
`TRUNCATE TABLE … tickets, orders, events, ticket_categories … RESTART IDENTITY CASCADE`
on **every** `PUT /api/state`, then re-inserts every row from the shared
frontend state blob. A database trigger then re-syncs
`scanner.ticket_entitlements` / `ticket_assignments` from `public.tickets`.

Consequence: any transfer written to `scanner.*` is silently reverted the next
time any browser autosaves. Ownership must become server-authoritative before
transfers can hold. Exempting `tickets` alone is not sufficient — it cascades
from `orders`, `events`, and `ticket_categories`.

### 3. The QR code identifies a person, not a ticket

`/api/qr/me` issues **one permanent QR per user**, and
`scanner.qr_credentials` has a unique-active-per-user index. The scanner
resolves *a person* from the scanned QR, then asks "does this person hold a
ticket for this event?" (`_lookup_ticket(db, scanned_user.email, event_id)`).

Consequence: literally "deactivating the sender's QR and issuing a new one"
would revoke the sender's entire campus pass and every other ticket they hold.
See *QR behaviour* below for how the security intent is met instead.

## Architecture

Chosen approach: **upsert instead of truncate, with server-owned ownership
columns**, and the transfer engine living in the FastAPI backend.

Rejected alternatives:

- **Carve tickets/orders/events out of the blob into REST resources.** The right
  long-term end state, but it rewrites the purchase flow, organizer console, and
  events page simultaneously. Available as a clean follow-up.
- **Transfer inside the state blob, client-side.** The client would decide
  ownership and the shared blob makes "one ticket, one holder" unenforceable.

The transfer engine belongs in FastAPI because that backend already owns the
`scanner.*` schema, already resolves the signed-in user via
`get_current_user`, and already contains the ticket-lookup logic the transfer
must stay consistent with.

## Data model

No new tables or columns. Existing shape:

`scanner.ticket_transfers`
| column | notes |
| --- | --- |
| `id` | uuid pk |
| `ticket_id` | → `scanner.ticket_entitlements.id` |
| `from_user_id` | → `scanner.users.id` |
| `to_user_id` | → `scanner.users.id`; nullable in schema, **always set** here (unregistered recipients are blocked) |
| `to_email` | recipient email as entered |
| `status` | `pending` \| `accepted` \| `declined` \| `cancelled` (`expired` is derived, never stored) |
| `expires_at` | not null |
| `accepted_at` | set on accept only |
| `created_at` | |

`scanner.ticket_assignments` — `ticket_id`, `assigned_to_user_id`, `status`
(`active` \| `ended`), `assigned_at`, `ended_at`, `transfer_id`.

**Identifiers.** A ticket's id is the same value in both schemas: the sync
trigger inserts `scanner.ticket_entitlements` using `NEW.id` from
`public.tickets`. So `ticket_id` in this API refers to both rows and no
translation table is needed.

Deliberately **not** added: `declined_at` / `cancelled_at`. The requirements ask
only that status be displayed; `status` plus `created_at` cover it. One nullable
column can be added later if the panel ever needs resolution timestamps.

## State machine

Only `PENDING` is actionable. Every other state is terminal.

```
PENDING ──accept  (recipient)──→ ACCEPTED    ownership moves
        ──decline (recipient)──→ DECLINED
        ──cancel  (sender)────→ CANCELLED
        ──now > expires_at────→ EXPIRED      derived on read
```

`expires_at = min(created_at + 7 days, event.start_time)`.

A transfer must never be acceptable after the event has begun, so the event
start caps the window. A transfer for an event starting in one hour therefore
expires in one hour, which is correct.

`EXPIRED` is **derived on read**, never written: a row whose `status = 'pending'`
and whose `expires_at` has passed is reported as expired and refuses all
actions. This removes the need for a scheduler or cron job.

## Eligibility rules

Checked at **both** initiate and accept. Re-checking on accept is required
because arbitrary time passes in between — the ticket may have been scanned or
the event may have started.

A ticket is transferable only when all hold:

1. The caller is the current **active assignee** of the ticket.
2. `entry_count == 0` — an already-scanned ticket is not transferable. On the
   `public.tickets` fallback path this is `checked_in_at IS NULL`, matching how
   `_lookup_ticket` already derives `entry_count`.
3. Ticket status is not `cancelled`, `refunded`, or `expired`. Read from
   `scanner.ticket_entitlements.status` when present, else `public.tickets.status`
   — the same precedence `_lookup_ticket` uses, so eligibility and scanning can
   never disagree.
4. The event has not started.
5. No `pending` transfer already exists for the ticket (also enforced by index).
6. Recipient is not the sender.
**Revised 2026-08-03 — the recipient no longer has to be registered.**

The original rule required the recipient email to already resolve to a row in
`scanner.users`, blocking transfer creation otherwise. That was reversed: a
transfer to an unknown email is now created with `to_user_id` NULL and held
against the address. `list` and `respond` match an unclaimed transfer on the
caller's verified email, so it appears in that person's panel the first time
they sign in, and `to_user_id` is filled in when they accept.

This is safe because Google has verified the address by the time anyone can
claim it — only the real owner of that inbox sees the transfer. The trade-off
is that, with email notifications out of scope, the sender must tell the
recipient out-of-band that a ticket is waiting.

## Accept transaction

Ownership movement happens in one transaction, with `SELECT … FOR UPDATE` on the
entitlement row:

1. Re-verify every eligibility rule.
2. `UPDATE scanner.ticket_assignments SET status='ended', ended_at=now()
   WHERE ticket_id = ? AND status = 'active'`
3. `INSERT INTO scanner.ticket_assignments (ticket_id, assigned_to_user_id,
   status='active', transfer_id = ?)`
4. `UPDATE public.tickets SET attendee_email/name/phone = recipient WHERE id = ?`
5. `UPDATE scanner.ticket_transfers SET status='accepted', accepted_at=now()`

Step 4 is required in addition to step 3 because `_lookup_ticket` tries the
`scanner.*` tables first and falls back to `public.tickets`; both paths must
agree, and the organizer console reads `public.tickets`.

Because of `ix_one_active_assignment_per_ticket`, step 3 fails outright if step 2
did not end the previous assignment. A concurrent double-accept is therefore
impossible at the database level, not merely unlikely.

## QR behaviour

**No QR credential is revoked or regenerated.**

Each user's permanent QR identifies that user. The scanner resolves the person,
then looks up their active assignments. After an accept:

- the recipient's QR resolves to the ticket → entry approved;
- the sender's QR no longer finds it → "No ticket for this event is assigned to
  this attendee".

This satisfies every stated security property — the sender can no longer use the
ticket, the ticket appears in the recipient's account, and no ticket is ever
usable by two people — **without** revoking the sender's campus pass and all
their unrelated tickets, which literal QR deactivation would do.

This is a deliberate, approved deviation from the original wording. If per-ticket
QR codes are ever genuinely required, that is a different and larger change to
both the QR model and the scanner, and warrants its own design.

## API

FastAPI, in a new `backend/transfer_routes.py`, mounted on the existing app.
Paths are flat to match the existing Vercel filesystem-entrypoint convention
(`api/scanner/assignments.py` → `/api/scanner/assignments`); Vercel Python
functions do not get dynamic path segments for free.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/tickets/mine` | Tickets where the caller is the current active assignee, for events that have not ended, excluding `cancelled`/`refunded`. Each row carries its pending outgoing transfer, if any. Backs the new My Tickets view. |
| `GET` | `/api/transfers/list` | `{ incoming: [...], outgoing: [...] }`, with expiry derived. |
| `POST` | `/api/transfers/create` | `{ ticket_id, to_email }` |
| `POST` | `/api/transfers/respond` | `{ transfer_id, action: accept \| decline \| cancel }` |

Entrypoints: `api/tickets/mine.py`, `api/transfers/list.py`,
`api/transfers/create.py`, `api/transfers/respond.py` — each a thin
`from backend.main import app`, matching `api/scanner/*.py`.

Error contract: `404` unregistered recipient or unknown ticket/transfer; `403`
caller is not the sender/recipient for the action; `409` ineligible ticket,
duplicate pending transfer, or action on a non-pending transfer.

`accept` is safe to retry: a second call finds the transfer already `accepted`
and returns `409` without moving anything.

## Frontend

The existing **Approvals & Invites** page is already the notification panel — it
has a tab switcher and a pending-count badge wired into the nav. It is extended
rather than duplicated.

- **New "My Tickets" tab** — lists `GET /api/tickets/mine`. Each ticket has a
  Transfer action (modal: recipient email → `POST /api/transfers/create`), shows
  its outgoing transfer status badge, and offers Cancel while pending.
- **Requests tab** additionally lists **incoming** transfers with Accept /
  Decline.
- **Nav badge** count includes pending incoming transfers.
- Every action raises a toast via the existing `addToast` passed down from
  `App.tsx`.

Notifications are **derived from the transfer rows**, not stored separately.
"Request sent", "accepted", "declined" are all reconstructible from a transfer's
`status` and timestamps, so no notifications table is introduced.

## Ownership sync change

`server/store.ts` `syncReportingTables()` replaces `TRUNCATE … CASCADE` +
`INSERT` with `INSERT … ON CONFLICT (id) DO UPDATE`, deleting nothing.

For `tickets`, the `DO UPDATE SET` clause deliberately **omits**
`attendee_email`, `attendee_name`, and `attendee_phone`. New rows still insert
with the client's attendee values — that is a genuine purchase. Existing rows
keep whatever the transfer engine set.

The column ownership split is:

| Writer | Owns |
| --- | --- |
| state-blob sync | ticket identity, category, price, status, timestamps |
| transfer engine | `attendee_email`, `attendee_name`, `attendee_phone` |

This change also fixes an existing, unrelated bug class: today one browser's
save deletes rows created by another user.

## Testing

Python (`tests/`, pytest — matches existing suite):

- each eligibility rejection: already scanned, refunded/cancelled, event started,
  self-transfer, unregistered recipient, duplicate pending transfer;
- accept moves the assignment — asserted through `_lookup_ticket`, so the sender
  loses the ticket and the recipient gains it;
- concurrent double-accept is rejected by the unique index;
- terminal transfers reject all further actions;
- a pending transfer past `expires_at` reports as expired and refuses accept.

Node (`server/app.test.ts`):

- **a `PUT /api/state` does not revert a transferred ticket's owner.** This is
  the regression test for finding #2 and is the single most important test in
  the feature.

## Out of scope

- **Transactional email.** All five notification emails are deferred; needs an
  email provider (account, cost, marketplace integration) and is its own phase.
  The in-app panel covers the notification requirement in the meantime.
- Held invites for unregistered recipients (see rule 7).
- Per-ticket QR credentials (see *QR behaviour*).
- Carving tickets/orders/events fully out of the shared state blob.
