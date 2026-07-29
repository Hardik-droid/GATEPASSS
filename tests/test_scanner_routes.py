import importlib.util
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.scanner_routes import (
    ScannerAccessUpdate,
    _mobile_scanner_id,
    _scan_result,
    _ticket_ownership,
)

ROOT = Path(__file__).resolve().parents[1]


def _entrypoint(path: str) -> TestClient:
    file_path = ROOT / path
    spec = importlib.util.spec_from_file_location(file_path.stem, file_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app)


@pytest.mark.parametrize(
    ("entrypoint", "method", "route", "kwargs"),
    [
        ("api/scanner/assignments.py", "get", "/api/scanner/assignments", {}),
        (
            "api/scanner/access.py",
            "put",
            "/api/scanner/access",
            {
                "json": {
                    "email": "staff@example.com",
                    "event_id": "event-1",
                    "gate": "Main Gate",
                    "allowed": True,
                }
            },
        ),
        (
            "api/scanner/validate.py",
            "post",
            "/api/scanner/validate",
            {
                "json": {"event_id": "event-1", "payload": "gp:v1:fake.sig"},
                "headers": {"X-Idempotency-Key": "test-key-123"},
            },
        ),
    ],
)
def test_vercel_scanner_entrypoints_match_their_public_routes(
    entrypoint: str,
    method: str,
    route: str,
    kwargs: dict,
) -> None:
    response = getattr(_entrypoint(entrypoint), method)(route, **kwargs)
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/json")


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


def test_original_ticket_reports_exactly_one_owner() -> None:
    db = Mock()
    db.execute.return_value.scalar_one.return_value = 0

    ownership = _ticket_ownership(db, "ticket-1", None)

    assert ownership == {
        "owner_count": 1,
        "is_transferred": False,
        "transferred_from_name": None,
    }


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
