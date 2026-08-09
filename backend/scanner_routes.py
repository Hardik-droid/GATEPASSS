import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.models import QrCredential, User
from backend.security import (
    get_current_user,
    parse_qr_payload,
    verify_qr_signature,
)

router = APIRouter(prefix="/api/scanner", tags=["scanner"])


class ScannerAccessUpdate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    event_id: str = Field(min_length=1, max_length=160)
    gate: str = Field(default="Main Gate", min_length=1, max_length=160)
    allowed: bool = True

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        local, separator, domain = email.partition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("Enter a valid email address")
        return email

    @field_validator("event_id", "gate")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be empty")
        return value


class ScanRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=160)
    payload: str = Field(min_length=8, max_length=1000)


def _is_owner(user: User) -> bool:
    return user.email.strip().lower() == settings.owner_email


def _scanner_user(db: Session, email: str) -> dict | None:
    """Look up a user in scanner.users by email with fallback to public.users."""
    clean_email = email.strip().lower()
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT id, email, display_name AS name
                    FROM scanner.users
                    WHERE lower(email) = :email
                    LIMIT 1
                    """
                ),
                {"email": clean_email},
            )
            .mappings()
            .one_or_none()
        )
        if row:
            return dict(row)
    except Exception:
        pass

    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT id, email, name
                    FROM public.users
                    WHERE lower(email) = :email
                    LIMIT 1
                    """
                ),
                {"email": clean_email},
            )
            .mappings()
            .one_or_none()
        )
        if row:
            return dict(row)
    except Exception:
        pass

    return None


def _event_assignments(db: Session, scanner_user_id: str, owner: bool) -> list[dict]:
    """Return the events the scanner user can scan."""
    try:
        db.execute(
            text(
                """
                CREATE SCHEMA IF NOT EXISTS scanner;
                CREATE TABLE IF NOT EXISTS scanner.events (
                    id UUID PRIMARY KEY,
                    organization_name TEXT NOT NULL DEFAULT 'GatePass',
                    name TEXT NOT NULL,
                    starts_at TIMESTAMPTZ,
                    ends_at TIMESTAMPTZ,
                    venue TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                """
            )
        )
        db.commit()
    except Exception:
        db.rollback()

    if owner:
        rows = (
            db.execute(
                text(
                    """
                    SELECT
                        concat('owner:', pe.id) AS id,
                        pe.id AS event_id,
                        pe.title AS event_name,
                        pe.venue,
                        pe.start_time AS start_time,
                        pe.end_time AS end_time,
                        true AS accepting_entries,
                        'Owner Gate'::text AS gate
                    FROM public.events pe
                    WHERE pe.end_time IS NULL OR now() <= pe.end_time
                    ORDER BY start_time DESC, event_name ASC
                    """
                )
            )
            .mappings()
            .all()
        )
    else:
        rows = (
            db.execute(
                text(
                    """
                    SELECT
                        sa.id,
                        e.id AS event_id,
                        e.name AS event_name,
                        e.venue,
                        e.starts_at AS start_time,
                        e.ends_at AS end_time,
                        true AS accepting_entries,
                        sa.gate
                    FROM scanner.scanner_assignments sa
                    JOIN scanner.events e ON e.id = sa.event_id
                    WHERE sa.scanner_user_id = :scanner_user_id
                      AND lower(e.status) IN ('approved', 'active', 'published')
                      AND (e.ends_at IS NULL OR now() <= e.ends_at)
                    ORDER BY e.starts_at DESC, e.name
                    """
                ),
                {"scanner_user_id": scanner_user_id},
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows]


def _owner_grants(db: Session) -> list[dict]:
    """List all delegated scanner assignments (owner only)."""
    try:
        rows = (
            db.execute(
                text(
                    """
                    SELECT
                        sa.id,
                        u.display_name AS name,
                        u.email,
                        sa.event_id,
                        e.name AS event_name,
                        sa.gate
                    FROM scanner.scanner_assignments sa
                    JOIN scanner.users u ON u.id = sa.scanner_user_id
                    JOIN scanner.events e ON e.id = sa.event_id
                    ORDER BY lower(u.email), e.starts_at DESC
                    """
                )
            )
            .mappings()
            .all()
        )
        return [dict(row) for row in rows]
    except Exception:
        return []


@router.get("/assignments")
def scanner_assignments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    scanner_user_id = str(user.id)
    owner = _is_owner(user)
    assignments = _event_assignments(db, scanner_user_id, owner)
    grants = _owner_grants(db) if owner else []
    db.commit()
    return {
        "is_owner": owner,
        "can_scan": owner or bool(assignments),
        "assignments": assignments,
        "grants": grants,
    }


@router.put("/access")
def update_scanner_access(
    request: ScannerAccessUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not _is_owner(user):
        raise HTTPException(403, "Only the Owner can manage scanner access")

    # Find the event in scanner.events or public.events
    event = _lookup_scanner_event(db, request.event_id)
    if event is None:
        raise HTTPException(404, "Event not found or not approved")

    # Find the target user in scanner.users by email
    target = _scanner_user(db, request.email)
    if target is None:
        raise HTTPException(404, "No scanner user found with that email. The user must sign in first.")

    if request.allowed:
        db.execute(
            text(
                """
                INSERT INTO scanner.scanner_assignments (id, scanner_user_id, event_id, gate)
                VALUES (:id, :scanner_user_id, :event_id, :gate)
                ON CONFLICT (scanner_user_id, event_id)
                DO UPDATE SET gate = EXCLUDED.gate
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "scanner_user_id": target["id"],
                "event_id": request.event_id,
                "gate": request.gate,
            },
        )
    else:
        db.execute(
            text(
                """
                DELETE FROM scanner.scanner_assignments
                WHERE scanner_user_id = :scanner_user_id AND event_id = :event_id
                """
            ),
            {
                "scanner_user_id": target["id"],
                "event_id": request.event_id,
            },
        )

    db.commit()
    return {
        "allowed": request.allowed,
        "email": request.email,
        "event_id": request.event_id,
        "gate": request.gate,
    }


def _mobile_scanner_id(operator_id: str, event_id: str) -> str:
    return str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"https://gatepass.app/mobile-scanner/{operator_id}/{event_id}",
        )
    )


def _ensure_mobile_scanner(
    db: Session,
    *,
    operator_id: str,
    operator_name: str,
    event_id: str,
    event_name: str,
) -> str:
    """Upsert a virtual mobile scanner entry. Falls back to the deterministic id if the table is unavailable."""
    scanner_id = _mobile_scanner_id(operator_id, event_id)
    try:
        db.execute(
            text(
                """
                INSERT INTO scanner.scanners (
                    id, name, organization_name, purpose, event_id, gate_id, status, created_at, updated_at
                )
                VALUES (
                    :id, :name, 'GatePass', 'TICKET_VALIDATION', :event_id, NULL, 'ACTIVE', now(), now()
                )
                ON CONFLICT (id)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    status = 'ACTIVE',
                    updated_at = now()
                """
            ),
            {
                "id": scanner_id,
                "name": f"Mobile · {operator_name} · {event_name}",
                "event_id": event_id,
            },
        )
    except Exception:
        pass  # Scanner registration is best-effort
    return scanner_id


def _scan_result(
    *,
    decision: str,
    reason: str,
    message: str,
    attendee_name: str | None = None,
    ticket: dict | None = None,
    ownership: dict | None = None,
) -> dict:
    return {
        "decision": decision,
        "reason": reason,
        "message": message,
        "attendee": {"name": attendee_name} if attendee_name else None,
        "ticket": ticket,
        "ownership": ownership,
    }


def _save_scan(
    db: Session,
    *,
    scanner_id: str,
    idempotency_key: str,
    event_id: str,
    gate: str,
    result: dict,
    user_id: str | None = None,
    ticket_id: str | None = None,
) -> dict:
    """Persist the scan result to scanner.scan_logs. Best-effort on failure."""
    try:
        db.execute(
            text(
                """
                INSERT INTO scanner.scan_logs (
                    id, scanner_id, qr_credential_id, user_id, ticket_id,
                    purpose, event_id, gate_id, decision, reason,
                    idempotency_key, scanned_at, metadata
                )
                VALUES (
                    :id, :scanner_id, NULL, :user_id, :ticket_id,
                    'TICKET_VALIDATION', :event_id, :gate, :decision, :reason,
                    :idempotency_key, now(), CAST(:metadata AS jsonb)
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "scanner_id": scanner_id,
                "user_id": user_id,
                "ticket_id": ticket_id,
                "event_id": event_id,
                "gate": gate,
                "decision": result["decision"],
                "reason": result["reason"],
                "idempotency_key": idempotency_key,
                "metadata": json.dumps(result),
            },
        )
    except Exception:
        pass
    db.commit()
    return result


def _lookup_scanner_event(db: Session, event_id: str) -> dict | None:
    """Look up an event, preferring scanner.events, falling back to public.events."""
    row = (
        db.execute(
            text(
                """
                SELECT id, name AS title, venue, starts_at AS start_time, ends_at AS end_time, status
                FROM scanner.events
                WHERE id = :event_id
                """
            ),
            {"event_id": event_id},
        )
        .mappings()
        .one_or_none()
    )
    if row:
        return dict(row)

    # Fallback: public.events (may not yet be synced by trigger)
    row = (
        db.execute(
            text(
                """
                SELECT id, title, venue, start_time, end_time, 'active'::text AS status
                FROM public.events
                WHERE id = :event_id
                """
            ),
            {"event_id": event_id},
        )
        .mappings()
        .one_or_none()
    )
    return dict(row) if row else None


def _lookup_ticket(db: Session, email: str, event_id: str) -> dict | None:
    """Find an active ticket for this attendee and event.

    Prefers the scanner.* tables (populated by sync triggers from public.tickets);
    falls back to public.tickets directly.
    """
    # 1. Try scanner.ticket_entitlements + scanner.ticket_assignments
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT
                        te.id,
                        te.ticket_type,
                        te.status,
                        te.valid_from,
                        te.valid_until,
                        te.entry_count,
                        te.max_entries,
                        ta.transfer_id,
                        u.display_name AS holder_name,
                        purchaser.display_name AS original_owner_name
                    FROM scanner.ticket_assignments ta
                    JOIN scanner.ticket_entitlements te ON te.id = ta.ticket_id
                    JOIN scanner.users u ON u.id = ta.assigned_to_user_id
                    LEFT JOIN scanner.users purchaser ON purchaser.id = te.purchased_by_user_id
                    WHERE lower(u.email) = :email
                      AND upper(ta.status) = 'ACTIVE'
                      AND te.event_id = :event_id
                    ORDER BY
                        CASE WHEN te.entry_count < te.max_entries THEN 0 ELSE 1 END,
                        te.created_at
                    LIMIT 1
                    FOR UPDATE OF te
                    """
                ),
                {"email": email.strip().lower(), "event_id": event_id},
            )
            .mappings()
            .one_or_none()
        )
        if row:
            return dict(row)
    except Exception:
        pass  # Fall through to public.tickets

    # 2. Fallback: public.tickets directly (uses checked_in_at as usage gate)
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT
                        t.id,
                        t.category_name AS ticket_type,
                        CASE
                            WHEN t.status IN ('issued', 'paid') THEN 'active'
                            ELSE t.status
                        END AS status,
                        t.attendee_name AS holder_name,
                        t.checked_in_at,
                        COALESCE(o.buyer_name, t.attendee_name) AS original_owner_name,
                        e.end_time AS valid_until
                    FROM public.tickets t
                    LEFT JOIN public.orders o ON o.id = t.order_id
                    LEFT JOIN public.events e ON e.id = t.event_id
                    WHERE lower(t.attendee_email) = :email
                      AND t.event_id = :event_id
                      AND t.status NOT IN ('cancelled', 'refunded', 'expired')
                    ORDER BY t.issued_at
                    LIMIT 1
                    FOR UPDATE OF t
                    """
                ),
                {"email": email.strip().lower(), "event_id": event_id},
            )
            .mappings()
            .one_or_none()
        )
        if row:
            checked_in = row["checked_in_at"] is not None
            return {
                "id": row["id"],
                "ticket_type": row["ticket_type"],
                "status": str(row["status"]).upper(),
                "valid_from": None,
                "valid_until": row.get("valid_until"),
                "entry_count": 1 if checked_in else 0,
                "max_entries": 1,
                "transfer_id": None,
                "holder_name": row["holder_name"],
                "original_owner_name": row["original_owner_name"],
                "_source": "public.tickets",
                "_checked_in_at": row["checked_in_at"],
            }
    except Exception:
        pass

    return None


@router.post("/validate")
def validate_ticket(
    request: ScanRequest,
    idempotency_key: str = Header(
        min_length=8,
        max_length=160,
        alias="X-Idempotency-Key",
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    operator_id = str(user.id)
    owner = _is_owner(user)

    # ── 1. Look up the event ──────────────────────────────────────────────
    event = _lookup_scanner_event(db, request.event_id)
    if event is None:
        raise HTTPException(404, "Event not found")

    # ── 2. Determine gate ─────────────────────────────────────────────────
    if owner:
        gate = "Owner Gate"
    else:
        gate = (
            db.execute(
                text(
                    """
                    SELECT gate
                    FROM scanner.scanner_assignments
                    WHERE scanner_user_id = :scanner_user_id AND event_id = :event_id
                    """
                ),
                {"scanner_user_id": operator_id, "event_id": request.event_id},
            ).scalar_one_or_none()
        )
        if gate is None:
            raise HTTPException(403, "Scanner access is not granted for this event")

    # ── 3. Register/ensure the mobile scanner  ─────────────────────────────
    scanner_id = _ensure_mobile_scanner(
        db,
        operator_id=operator_id,
        operator_name=user.display_name,
        event_id=request.event_id,
        event_name=event["title"],
    )

    # ── 4. Advisory lock + idempotency  ────────────────────────────────────
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"{scanner_id}:{idempotency_key}"},
    )
    try:
        previous = (
            db.execute(
                text(
                    """
                    SELECT metadata
                    FROM scanner.scan_logs
                    WHERE scanner_id = :scanner_id
                      AND idempotency_key = :idempotency_key
                    ORDER BY scanned_at DESC
                    LIMIT 1
                    """
                ),
                {"scanner_id": scanner_id, "idempotency_key": idempotency_key},
            ).scalar_one_or_none()
        )
        if previous is not None:
            db.rollback()
            return previous
    except Exception:
        pass  # scan_logs table may not exist yet

    now = datetime.now(timezone.utc)
    event_status = str(event.get("status", "active")).lower()
    if event_status not in {"approved", "active", "published"} or (
        event.get("start_time") and event["start_time"] > now
    ) or (event.get("end_time") and event["end_time"] < now):
        result = _scan_result(
            decision="REJECTED",
            reason="EVENT_NOT_ACTIVE",
            message="This event is not accepting entry right now.",
        )
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate, result=result)

    # ── 5. Verify QR payload  ──────────────────────────────────────────────
    parsed = parse_qr_payload(request.payload)
    if parsed is None or not verify_qr_signature(*parsed):
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          result=_scan_result(decision="REJECTED", reason="INVALID_QR",
                                              message="This QR code is invalid or has been altered."))

    # ── 6. Resolve credential + user  ─────────────────────────────────────
    credential = (
        db.query(QrCredential).filter_by(public_id=parsed[0]).one_or_none()
    )
    if credential is None or credential.status != "active":
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          result=_scan_result(decision="REJECTED", reason="QR_REVOKED",
                                              message="This QR pass is no longer active."))

    scanned_user = db.get(User, credential.user_id)
    if scanned_user is None or scanned_user.status != "active":
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          result=_scan_result(decision="REJECTED", reason="ACCOUNT_INACTIVE",
                                              message="The attendee account is inactive."))

    # ── 7. Look up the attendee's ticket  ─────────────────────────────────
    entitlement = _lookup_ticket(db, scanned_user.email, request.event_id)
    if entitlement is None:
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate, user_id=operator_id,
                          result=_scan_result(decision="REJECTED", reason="NO_ACTIVE_TICKET",
                                              message="No ticket for this event is assigned to this attendee.",
                                              attendee_name=scanned_user.display_name))

    # ── 8. Build ownership & ticket response ──────────────────────────────
    ticket = {
        "id": entitlement["id"],
        "event_id": request.event_id,
        "event_name": event["title"],
        "ticket_type": entitlement["ticket_type"],
        "entry_count": entitlement["entry_count"],
        "max_entries": entitlement["max_entries"],
        "original_owner_name": entitlement.get("original_owner_name") or scanned_user.display_name,
    }
    ownership = {
        "owner_count": 1,
        "is_transferred": False,
        "transferred_from_name": None,
    }

    # ── 9. Validate ticket status / usage  ────────────────────────────────
    ticket_status = str(entitlement["status"]).upper()
    if ticket_status not in {"ACTIVE", "ISSUED", "PAID"}:
        result = _scan_result(decision="REJECTED", reason=f"TICKET_{ticket_status}",
                              message=f"This ticket is {ticket_status.lower().replace('_', ' ')}.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate, result=result,
                          user_id=operator_id, ticket_id=entitlement["id"])

    if entitlement.get("valid_from") and entitlement["valid_from"] > now:
        result = _scan_result(decision="REJECTED", reason="TICKET_NOT_STARTED",
                              message="This ticket is not valid yet.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=operator_id, ticket_id=entitlement["id"], result=result)

    if entitlement.get("valid_until") and entitlement["valid_until"] < now:
        result = _scan_result(decision="REJECTED", reason="TICKET_EXPIRED",
                              message="This ticket has expired.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=operator_id, ticket_id=entitlement["id"], result=result)

    if entitlement["entry_count"] >= entitlement["max_entries"]:
        result = _scan_result(decision="REJECTED", reason="ALREADY_USED",
                              message="This ticket has already been used.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=operator_id, ticket_id=entitlement["id"], result=result)

    # ── 10. Increment usage  ──────────────────────────────────────────────
    if not _increment_usage(db, entitlement):
        result = _scan_result(decision="REJECTED", reason="ALREADY_USED",
                              message="This ticket was just used at another scanner.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=operator_id, ticket_id=entitlement["id"], result=result)

    ticket["entry_count"] = entitlement["entry_count"] + 1
    result = _scan_result(decision="APPROVED", reason="VALID_TICKET", message="Entry approved.",
                          attendee_name=entitlement["holder_name"],
                          ticket=ticket, ownership=ownership)
    return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                      event_id=request.event_id, gate=gate,
                      result=result, user_id=operator_id, ticket_id=entitlement["id"])


def _increment_usage(db: Session, entitlement: dict) -> bool:
    """Increment a ticket's usage counter.

    Scanner schema: UPDATE scanner.ticket_entitlements SET entry_count += 1
    Public fallback: UPDATE public.tickets SET checked_in_at = now()
    """
    source = entitlement.get("_source")
    if source == "public.tickets":
        if entitlement["_checked_in_at"] is not None:
            return False
        db.execute(
            text(
                """
                UPDATE public.tickets
                SET checked_in_at = now(), updated_at = now()
                WHERE id = :ticket_id AND checked_in_at IS NULL
                """
            ),
            {"ticket_id": entitlement["id"]},
        )
        return True

    updated = db.execute(
        text(
            """
            UPDATE scanner.ticket_entitlements
            SET entry_count = entry_count + 1, updated_at = now()
            WHERE id = :ticket_id AND entry_count < max_entries
            RETURNING entry_count
            """
        ),
        {"ticket_id": entitlement["id"]},
    ).scalar_one_or_none()
    return updated is not None
