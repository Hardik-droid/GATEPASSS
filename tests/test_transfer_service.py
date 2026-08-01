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


def test_cancelled_ticket_is_not_transferable():
    reason = ticket_block_reason(
        entry_count=0, ticket_status="cancelled", event_starts_at=NOW + timedelta(days=1), now=NOW
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


def test_ticket_status_check_is_case_insensitive():
    assert ticket_block_reason(
        entry_count=0, ticket_status="ACTIVE", event_starts_at=NOW + timedelta(days=1), now=NOW
    ) is None
