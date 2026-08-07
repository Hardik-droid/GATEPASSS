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
    Terminal states are returned untouched — an accepted transfer does not
    become "expired" a week later.
    """
    if status == TRANSFER_PENDING and expires_at <= now:
        return TRANSFER_EXPIRED
    return status


BLOCK_REASON_MESSAGES = {
    "TICKET_ALREADY_SCANNED": "Already scanned at the gate",
    "TICKET_NOT_ACTIVE": "This ticket is cancelled or refunded",
    "EVENT_ALREADY_STARTED": "This event has already started",
}


def block_reason_message(code: str) -> str:
    """Human-readable form of a ticket_block_reason code, for the UI."""
    return BLOCK_REASON_MESSAGES.get(code, "This ticket cannot be transferred")


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
