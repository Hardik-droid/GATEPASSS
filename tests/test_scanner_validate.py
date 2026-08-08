"""Integration tests for POST /api/scanner/validate.

Tests each decision path in the validate_ticket endpoint by injecting
mocked database sessions and patching helper functions.  No real database
connection is needed — every DB call returns a controlled mock value.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, PropertyMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.models import User, QrCredential
from backend.db import get_db
from backend.security import get_current_user
from backend.config import settings


# ── Helpers ──────────────────────────────────────────────────────────────────

_OWNER_EMAIL = settings.owner_email
_ANOTHER_EMAIL = "staff@example.com"


def _make_mock_user(email: str = _OWNER_EMAIL, display_name: str = "Test User", status: str = "active"):
    """Build a MagicMock that looks like a SQLAlchemy User row."""
    user_id = uuid.uuid4()
    user = MagicMock(spec=User)
    user.id = user_id
    user.email = email
    user.display_name = display_name
    user.status = status
    # Ensure str(user.id) returns the UUID string
    type(user).id = PropertyMock(return_value=user_id)
    return user


def _mock_credential(cred_id: uuid.UUID | None = None, status: str = "active",
                     public_id: str = "test-public-id") -> MagicMock:
    cred = MagicMock(spec=QrCredential)
    cred.id = cred_id or uuid.uuid4()
    cred.public_id = public_id
    cred.status = status
    cred.user_id = uuid.uuid4()
    return cred


def _entitlement_dict(
    *,
    status: str = "active",
    entry_count: int = 0,
    max_entries: int = 1,
    holder_name: str = "Attendee",
    original_owner_name: str = "Original Owner",
    valid_from: datetime | None = None,
    valid_until: datetime | None = None,
    transfer_id: str | None = None,
    ticket_type: str = "General Pass",
) -> dict:
    d: dict = {
        "id": str(uuid.uuid4()),
        "ticket_type": ticket_type,
        "status": status,
        "valid_from": valid_from,
        "valid_until": valid_until,
        "entry_count": entry_count,
        "max_entries": max_entries,
        "transfer_id": transfer_id,
        "holder_name": holder_name,
        "original_owner_name": original_owner_name,
    }
    return d


def _event_dict(
    *,
    status: str = "active",
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    title: str = "Test Event",
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "venue": "Test Venue",
        "start_time": start_time or (now - timedelta(hours=1)),
        "end_time": end_time or (now + timedelta(hours=3)),
        "status": status,
    }


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_db():
    """Creates a pre-configured mock DB session.

    Each test can further configure the mock via ``mock_db.`` assertions.
    """
    db = MagicMock()
    # Advisory lock: just succeed
    db.execute.return_value = MagicMock()
    # Default: no previous scan log (idempotency returns None)
    db.execute.return_value.scalar_one_or_none.return_value = None
    return db


@pytest.fixture
def owner_user():
    return _make_mock_user(_OWNER_EMAIL, "Hardik Owner")


@pytest.fixture
def scanner_user():
    return _make_mock_user(_ANOTHER_EMAIL, "Staff Scanner")


@pytest.fixture
def attendee_user():
    return _make_mock_user("attendee@example.com", "Attendee")


# ── TestClient fixture per scenario ─────────────────────────────────────────


@pytest.fixture
def auth_client(owner_user, mock_db):
    """TestClient with a mocked owner user and a clean mock DB."""
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: owner_user
    app.dependency_overrides[get_db] = lambda: mock_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _post(client: TestClient, event_id: str = "event-1", payload: str = "gp:v1:test.test") -> tuple[dict, int]:
    """POST /api/scanner/validate and return (json, status_code)."""
    resp = client.post(
        "/api/scanner/validate",
        json={"event_id": event_id, "payload": payload},
        headers={"X-Idempotency-Key": "test-key-12345678"},
    )
    return resp.json(), resp.status_code


# ── Tests ────────────────────────────────────────────────────────────────────


class TestValidateAuth:
    """Tests that require no special mocking (auth layer only)."""

    def test_missing_token_returns_401(self):
        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.post(
            "/api/scanner/validate",
            json={"event_id": "e1", "payload": "gp:v1:x.y"},
            headers={"X-Idempotency-Key": "test-key-12345678"},
        )
        assert resp.status_code == 401
        assert "Missing bearer token" in resp.text


class TestValidateEventLookup:
    """Event lookup and gate determination."""

    @patch("backend.scanner_routes._lookup_scanner_event", return_value=None)
    def test_event_not_found_returns_404(self, mock_lookup, auth_client):
        json, status = _post(auth_client)
        assert status == 404
        assert "Event not found" in json["detail"]

    @patch("backend.scanner_routes._lookup_scanner_event")
    def test_non_owner_without_gate_returns_403(self, mock_lookup, scanner_user, mock_db):
        """Non-owner scanner with no scanner_assignments row should get 403."""
        mock_lookup.return_value = _event_dict()

        app.dependency_overrides.clear()
        app.dependency_overrides[get_current_user] = lambda: scanner_user
        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            client = TestClient(app)
            json, status = _post(client)
            assert status == 403
            assert "Scanner access is not granted" in json["detail"]
        finally:
            app.dependency_overrides.clear()


class TestValidateQrAndCredential:
    """QR parsing, signature, credential, and user lookups."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=None)
    def test_invalid_qr_format_rejected(self, mock_parse, mock_event,
                                        mock_db, owner_user, auth_client):
        mock_event.return_value = _event_dict()
        json, status = _post(auth_client)
        assert status == 200
        assert json["decision"] == "REJECTED"
        assert json["reason"] == "INVALID_QR"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=False)
    def test_tampered_qr_rejected(self, mock_verify, mock_parse, mock_event,
                                  mock_db, owner_user, auth_client):
        mock_event.return_value = _event_dict()
        json, status = _post(auth_client)
        assert status == 200
        assert json["decision"] == "REJECTED"
        assert json["reason"] == "INVALID_QR"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_qr_credential_not_found_rejected(self, mock_verify, mock_parse, mock_event,
                                              mock_db, owner_user, auth_client):
        mock_event.return_value = _event_dict()
        # Credential query returns None
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = None
        json, status = _post(auth_client)
        assert status == 200
        assert json["reason"] == "QR_REVOKED"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_revoked_qr_rejected(self, mock_verify, mock_parse, mock_event,
                                 mock_db, owner_user, auth_client):
        mock_event.return_value = _event_dict()
        revoked_cred = _mock_credential(status="revoked")
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = revoked_cred
        json, status = _post(auth_client)
        assert status == 200
        assert json["reason"] == "QR_REVOKED"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_inactive_user_rejected(self, mock_verify, mock_parse, mock_event,
                                    mock_db, owner_user, auth_client):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        # User lookup returns inactive user
        inactive_user = _make_mock_user(status="disabled")
        mock_db.get.return_value = inactive_user
        json, status = _post(auth_client)
        assert status == 200
        assert json["reason"] == "ACCOUNT_INACTIVE"


class TestValidateTicketLookup:
    """Ticket lookup and status checks."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_no_ticket_rejected(self, mock_verify, mock_parse, mock_event,
                                 mock_db, owner_user, auth_client, attendee_user):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        # Ticket lookup returns None
        with patch("backend.scanner_routes._lookup_ticket", return_value=None) as mock_ticket:
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == "NO_ACTIVE_TICKET"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    @pytest.mark.parametrize("ticket_status,expected_reason", [
        ("cancelled", "TICKET_CANCELLED"),
        ("refunded", "TICKET_REFUNDED"),
        ("expired", "TICKET_EXPIRED"),
    ])
    def test_non_active_ticket_status_rejected(self, mock_verify, mock_parse, mock_event,
                                                mock_db, owner_user, auth_client,
                                                attendee_user, ticket_status, expected_reason):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict(status=ticket_status)
        with patch("backend.scanner_routes._lookup_ticket", return_value=entitlement):
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == expected_reason

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_ticket_not_started_yet_rejected(self, mock_verify, mock_parse, mock_event,
                                              mock_db, owner_user, auth_client, attendee_user):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        far_future = datetime.now(timezone.utc) + timedelta(days=30)
        entitlement = _entitlement_dict(valid_from=far_future)
        with patch("backend.scanner_routes._lookup_ticket", return_value=entitlement):
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == "TICKET_NOT_STARTED"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_ticket_expired_rejected(self, mock_verify, mock_parse, mock_event,
                                      mock_db, owner_user, auth_client, attendee_user):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        far_past = datetime.now(timezone.utc) - timedelta(days=30)
        entitlement = _entitlement_dict(valid_until=far_past)
        with patch("backend.scanner_routes._lookup_ticket", return_value=entitlement):
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == "TICKET_EXPIRED"


class TestValidateUsage:
    """Entry-count checks and increment logic."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_already_used_rejected_before_increment(self, mock_verify, mock_parse, mock_event,
                                                     mock_db, owner_user, auth_client, attendee_user):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        # entry_count == max_entries → already used
        entitlement = _entitlement_dict(entry_count=1, max_entries=1)
        with patch("backend.scanner_routes._lookup_ticket", return_value=entitlement):
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == "ALREADY_USED"
            assert "already been used" in json["message"]

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_concurrent_use_rejected(self, mock_verify, mock_parse, mock_event,
                                      mock_db, owner_user, auth_client, attendee_user):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict(entry_count=0, max_entries=1)
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=False),
        ):
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == "ALREADY_USED"
            assert "just used at another scanner" in json["message"]


class TestValidateHappyPath:
    """Successful validation flow."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_approves_valid_ticket(self, mock_verify, mock_parse, mock_event,
                                    mock_db, owner_user, auth_client, attendee_user):
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict(
            entry_count=0, max_entries=1,
            holder_name="Attendee", original_owner_name="Original Owner",
        )
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=True),
        ):
            json, status = _post(auth_client)
            assert status == 200
            assert json["decision"] == "APPROVED"
            assert json["reason"] == "VALID_TICKET"
            assert json["message"] == "Entry approved."
            assert json["attendee"] == {"name": "Attendee"}
            assert json["ticket"] is not None
            assert json["ticket"]["entry_count"] == 1  # incremented from 0
            assert json["ticket"]["original_owner_name"] == "Original Owner"
            assert json["ownership"] == {
                "owner_count": 1,
                "is_transferred": False,
                "transferred_from_name": None,
            }

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_responds_with_attendee_name(self, mock_verify, mock_parse, mock_event,
                                          mock_db, owner_user, auth_client, attendee_user):
        """Approved response includes the attendee's display name."""
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict(holder_name="Jane Doe")
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=True),
        ):
            json, status = _post(auth_client)
            assert json["attendee"] == {"name": "Jane Doe"}

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_audit_log_records_scanned_attendee_not_operator(
        self, mock_verify, mock_parse, mock_event,
        mock_db, owner_user, auth_client, attendee_user,
    ):
        mock_event.return_value = _event_dict()
        credential = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = credential
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict()
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=True),
            patch("backend.scanner_routes._save_scan", side_effect=lambda _db, **kw: kw["result"]) as save,
        ):
            json, status = _post(auth_client)

        assert status == 200
        assert json["decision"] == "APPROVED"
        assert save.call_args.kwargs["user_id"] == str(attendee_user.id)
        assert save.call_args.kwargs["user_id"] != str(owner_user.id)


class TestValidateCanonicalTickets:
    """Canonical scanner entitlements enforce the single-entry contract."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_already_checked_in_rejected(self, mock_verify, mock_parse, mock_event,
                                          mock_db, owner_user, auth_client, attendee_user):
        """An entitlement at its entry limit is already used."""
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict(
            entry_count=1, max_entries=1,
        )
        with patch("backend.scanner_routes._lookup_ticket", return_value=entitlement):
            json, status = _post(auth_client)
            assert status == 200
            assert json["reason"] == "ALREADY_USED"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_canonical_ticket_happy_path(self, mock_verify, mock_parse, mock_event,
                                         mock_db, owner_user, auth_client, attendee_user):
        """An unused canonical entitlement is approved."""
        mock_event.return_value = _event_dict()
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict(
            entry_count=0, max_entries=1,
        )
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=True),
        ):
            json, status = _post(auth_client)
            assert status == 200
            assert json["decision"] == "APPROVED"


class TestValidateDurability:
    """Approval is returned only after its durable scan log commits."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes._ensure_mobile_scanner", return_value="scanner-id")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    @patch("backend.scanner_routes._lookup_ticket", return_value=_entitlement_dict())
    @patch("backend.scanner_routes._increment_usage", return_value=True)
    def test_log_write_failure_never_returns_approved(
        self,
        mock_increment,
        mock_ticket,
        mock_verify,
        mock_parse,
        mock_scanner,
        mock_event,
        mock_db,
        owner_user,
        auth_client,
        attendee_user,
    ):
        mock_event.return_value = _event_dict()
        credential = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = credential
        mock_db.get.return_value = attendee_user

        def execute(statement, *_args, **_kwargs):
            if "INSERT INTO scanner.scan_logs" in str(statement):
                raise RuntimeError("scan log unavailable")
            result = MagicMock()
            result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute.side_effect = execute

        with pytest.raises(RuntimeError, match="scan log unavailable"):
            _post(auth_client)
        mock_increment.assert_called_once()
        mock_db.commit.assert_not_called()


class TestValidateIdempotency:
    """Idempotency key returns cached result on replayed requests."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_idempotent_scan_returns_cached_result(
        self, mock_verify, mock_parse, mock_event,
        mock_db, owner_user, auth_client, attendee_user,
    ):
        """When a previous scan_logs entry exists, return its metadata directly."""
        mock_event.return_value = _event_dict()

        # Simulate a previous APPROVED scan result in scan_logs
        cached = {
            "decision": "APPROVED",
            "reason": "VALID_TICKET",
            "message": "Entry approved.",
            "attendee": {"name": "Cached Attendee"},
            "ticket": {"id": "cached-ticket"},
            "ownership": {"owner_count": 1, "is_transferred": False, "transferred_from_name": None},
        }
        mock_db.execute.return_value.scalar_one_or_none.return_value = cached

        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict()
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=True),
        ):
            json, status = _post(auth_client)
            assert status == 200
            # Should return the cached result, not re-process
            assert json == cached

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_idempotent_rejection_returns_no_ticket(
        self, mock_verify, mock_parse, mock_event,
        mock_db, owner_user, auth_client, attendee_user,
    ):
        """Cache hit for a rejection also returns the original metadata."""
        cached = {
            "decision": "REJECTED",
            "reason": "NO_ACTIVE_TICKET",
            "message": "No ticket for this event is assigned to this attendee.",
            "attendee": None,
            "ticket": None,
            "ownership": None,
        }
        mock_db.execute.return_value.scalar_one_or_none.return_value = cached

        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        mock_db.get.return_value = attendee_user
        entitlement = _entitlement_dict()
        with (
            patch("backend.scanner_routes._lookup_ticket", return_value=entitlement),
            patch("backend.scanner_routes._increment_usage", return_value=True),
        ):
            json, status = _post(auth_client)
            assert json == cached


class TestValidateEventSchedule:
    """Event time-window checks."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_event_has_not_started_yet(self, mock_verify, mock_parse, mock_event,
                                        mock_db, owner_user, auth_client):
        """Event start_time is in the future → REJECTED."""
        future = datetime.now(timezone.utc) + timedelta(days=7)
        mock_event.return_value = _event_dict(start_time=future)
        json, status = _post(auth_client)
        assert status == 200
        assert json["reason"] == "EVENT_NOT_ACTIVE"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_event_already_ended(self, mock_verify, mock_parse, mock_event,
                                  mock_db, owner_user, auth_client):
        """Event end_time is in the past → REJECTED."""
        past = datetime.now(timezone.utc) - timedelta(days=7)
        mock_event.return_value = _event_dict(end_time=past)
        json, status = _post(auth_client)
        assert status == 200
        assert json["reason"] == "EVENT_NOT_ACTIVE"

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    def test_event_with_disabled_status_rejected(self, mock_verify, mock_parse, mock_event,
                                                  mock_db, owner_user, auth_client):
        """Event status not in (approved, active, published) → REJECTED."""
        mock_event.return_value = _event_dict(status="cancelled")
        json, status = _post(auth_client)
        assert status == 200
        assert json["reason"] == "EVENT_NOT_ACTIVE"


class TestValidateNonOwnerFlow:
    """Scanner-access-granted path for non-owner operators."""

    @patch("backend.scanner_routes._lookup_scanner_event")
    @patch("backend.scanner_routes._ensure_mobile_scanner", return_value="scanner-id")
    @patch("backend.scanner_routes._save_scan", side_effect=lambda db, **kw: kw["result"])
    @patch("backend.scanner_routes.parse_qr_payload", return_value=("pid", "sig"))
    @patch("backend.scanner_routes.verify_qr_signature", return_value=True)
    @patch("backend.scanner_routes._lookup_ticket",
           return_value=_entitlement_dict(entry_count=0, max_entries=1))
    @patch("backend.scanner_routes._increment_usage", return_value=True)
    def test_non_owner_with_gate_can_scan(
        self, mock_incr, mock_ticket, mock_verify, mock_parse,
        mock_save, mock_scanner, mock_event,
        scanner_user, mock_db,
    ):
        """Non-owner with a scanner_assignments row should be able to scan."""
        mock_event.return_value = _event_dict()

        # Configure the mock DB so the gate lookup returns "VIP Gate"
        # while the idempotency check still returns None (no cached result).
        def _execute_side_effect(*args, **_kwargs):
            mock_result = MagicMock()
            sql = str(args[0]) if args else ""
            if "scanner_assignments" in sql and "scanner_user_id" in sql:
                mock_result.scalar_one_or_none.return_value = "VIP Gate"
            else:
                mock_result.scalar_one_or_none.return_value = None
            return mock_result

        mock_db.execute.side_effect = _execute_side_effect

        # Mock credential and user lookups (same pattern as other tests)
        cred = _mock_credential()
        mock_db.query.return_value.filter_by.return_value.one_or_none.return_value = cred
        attendee = _make_mock_user("attendee@example.com", "Jane Attending")
        mock_db.get.return_value = attendee

        app.dependency_overrides.clear()
        app.dependency_overrides[get_current_user] = lambda: scanner_user
        app.dependency_overrides[get_db] = lambda: mock_db
        try:
            client = TestClient(app)
            json, status = _post(client)
            assert status == 200
            assert json["decision"] == "APPROVED"
        finally:
            app.dependency_overrides.clear()
