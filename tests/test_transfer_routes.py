"""Endpoint tests for the transfer API, with the DB session mocked.

Follows the pattern in tests/test_scanner_validate.py: dependency overrides
supply a fake user and a MagicMock session, so no database is required.
"""

import uuid
from datetime import datetime, timedelta, timezone
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


def test_create_rejects_malformed_recipient_email(client_and_db):
    client, _, _ = client_and_db

    response = client.post(
        "/api/transfers/create",
        json={"ticket_id": str(uuid.uuid4()), "to_email": "not-an-email"},
    )

    assert response.status_code == 422


def test_respond_rejects_unknown_action(client_and_db):
    client, _, _ = client_and_db

    response = client.post(
        "/api/transfers/respond",
        json={"transfer_id": str(uuid.uuid4()), "action": "steal"},
    )

    assert response.status_code == 422


def test_respond_404s_for_unknown_transfer(client_and_db):
    client, db, _ = client_and_db
    db.execute.return_value.mappings.return_value.one_or_none.return_value = None

    response = client.post(
        "/api/transfers/respond",
        json={"transfer_id": str(uuid.uuid4()), "action": "accept"},
    )

    assert response.status_code == 404


def test_endpoints_require_authentication():
    # No dependency overrides: the real get_current_user rejects a missing token.
    client = TestClient(app)
    assert client.get("/api/tickets/mine").status_code == 401
    assert client.get("/api/transfers/list").status_code == 401
    assert (
        client.post(
            "/api/transfers/create",
            json={"ticket_id": str(uuid.uuid4()), "to_email": "a@b.com"},
        ).status_code
        == 401
    )


def test_accept_is_rejected_when_the_sender_no_longer_holds_the_ticket(client_and_db):
    """A pending transfer must not be able to take a ticket from a third party.

    If ownership moved after the transfer was created, ending "whatever active
    assignment exists" would hand the current holder's ticket to the accepter.
    """
    client, db, caller = client_and_db
    now = datetime.now(timezone.utc)

    transfer_row = {
        "id": uuid.uuid4(),
        "ticket_id": uuid.uuid4(),
        "from_user_id": uuid.uuid4(),
        "to_user_id": caller.id,
        "to_email": caller.email,
        "status": "pending",
        "expires_at": now + timedelta(days=1),
        "ticket_status": "active",
        "entry_count": 0,
        "starts_at": now + timedelta(days=2),
    }
    lookup = MagicMock()
    lookup.mappings.return_value.one_or_none.return_value = transfer_row
    # The scoped UPDATE ... RETURNING id matches no row: the sender's active
    # assignment is gone, so scalar_one_or_none() yields None.
    ended_nothing = MagicMock()
    ended_nothing.scalar_one_or_none.return_value = None
    db.execute.side_effect = [lookup, ended_nothing]

    response = client.post(
        "/api/transfers/respond",
        json={"transfer_id": str(transfer_row["id"]), "action": "accept"},
    )

    assert response.status_code == 409
    assert "no longer holds" in response.json()["detail"].lower()
    db.commit.assert_not_called()
