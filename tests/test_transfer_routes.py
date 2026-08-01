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
