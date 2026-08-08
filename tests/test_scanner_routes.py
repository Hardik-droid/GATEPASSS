from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from backend.scanner_routes import (
    ScannerAccessUpdate,
    _ensure_mobile_scanner,
    _increment_usage,
    _lookup_ticket,
    _mobile_scanner_id,
    _scan_result,
)


def test_scanner_grant_email_is_normalized() -> None:
    request = ScannerAccessUpdate(
        email="  Staff.Person@Example.COM ",
        event_id="event-1",
        gate="North Gate",
    )
    assert request.email == "staff.person@example.com"


def test_scanner_grant_rejects_invalid_email() -> None:
    with pytest.raises(ValidationError):
        ScannerAccessUpdate(
            email="not-an-email",
            event_id="event-1",
            gate="North Gate",
        )


def test_mobile_scanner_id_is_stable_per_operator_and_event() -> None:
    scanner_id = _mobile_scanner_id("operator-1", "event-1")
    assert scanner_id == _mobile_scanner_id("operator-1", "event-1")
    assert scanner_id != _mobile_scanner_id("operator-1", "event-2")


def test_mobile_scanner_registration_failure_is_not_swallowed() -> None:
    db = MagicMock()
    db.execute.side_effect = RuntimeError("scanner table unavailable")

    with pytest.raises(RuntimeError, match="scanner table unavailable"):
        _ensure_mobile_scanner(
            db,
            operator_id="operator-1",
            operator_name="Gate Staff",
            event_id="event-1",
            event_name="Launch Night",
        )


def test_ticket_lookup_failure_is_not_retried_in_an_aborted_transaction() -> None:
    db = MagicMock()
    db.execute.side_effect = RuntimeError("ticket query failed")

    with pytest.raises(RuntimeError, match="ticket query failed"):
        _lookup_ticket(db, "attendee@example.com", "event-1")
    db.execute.assert_called_once()


def test_ticket_lookup_prefers_a_valid_ticket_over_cancelled_history() -> None:
    db = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    _lookup_ticket(db, "attendee@example.com", "event-1")

    sql = str(db.execute.call_args_list[0].args[0])
    valid_priority = sql.index("upper(te.status) IN ('ACTIVE', 'ISSUED', 'PAID')")
    usage_priority = sql.index("te.entry_count < te.max_entries")
    assert valid_priority < usage_priority


def test_ticket_lookup_locks_public_before_scanner_entitlement() -> None:
    db = MagicMock()
    candidate = MagicMock()
    candidate.scalar_one_or_none.return_value = "ticket-1"
    public_lock = MagicMock()
    public_lock.scalar_one_or_none.return_value = "ticket-1"
    scanner_lock = MagicMock()
    scanner_lock.mappings.return_value.one_or_none.return_value = None
    db.execute.side_effect = [candidate, public_lock, scanner_lock]

    assert _lookup_ticket(db, "attendee@example.com", "event-1") is None

    statements = [str(call.args[0]) for call in db.execute.call_args_list]
    assert "FROM public.tickets" in statements[1]
    assert "FOR UPDATE" in statements[1]
    assert "FOR UPDATE OF te" in statements[2]


def test_usage_increment_mirrors_public_reporting_in_same_session() -> None:
    db = MagicMock()
    scanner_result = MagicMock()
    scanner_result.scalar_one_or_none.return_value = 1
    db.execute.side_effect = [scanner_result, MagicMock()]

    assert _increment_usage(db, {"id": "ticket-1"}) is True

    scanner_sql = str(db.execute.call_args_list[0].args[0])
    public_sql = str(db.execute.call_args_list[1].args[0])
    assert "UPDATE scanner.ticket_entitlements" in scanner_sql
    assert "UPDATE public.tickets" in public_sql
    assert "checked_in_at = COALESCE" in public_sql
    db.commit.assert_not_called()





def test_scan_result_never_exposes_the_raw_qr() -> None:
    result = _scan_result(
        decision="APPROVED",
        reason="VALID_TICKET",
        message="Entry approved.",
        attendee_name="Current Holder",
        ticket={"id": "ticket-1"},
        ownership={
            "owner_count": 2,
            "is_transferred": True,
            "transferred_from_name": "Previous Holder",
        },
    )
    assert result["attendee"] == {"name": "Current Holder"}
    assert result["ownership"]["transferred_from_name"] == "Previous Holder"
    assert "payload" not in result
    assert "email" not in result["attendee"]
