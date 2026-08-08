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
    """Look up a user in scanner.users by email."""
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
            {"email": email.strip().lower()},
        )
        .mappings()
        .one_or_none()
    )
    return dict(row) if row else None


def _event_assignments(db: Session, scanner_user_id: str, owner: bool) -> list[dict]:
    """Return the events the scanner user can scan."""
    if owner:
        rows = (
            db.execute(
                text(
                    """
                    SELECT
                        concat('owner:', e.id) AS id,
                        e.id AS event_id,
                        e.name AS event_name,
                        e.venue,
                        e.starts_at AS start_time,
                        e.ends_at AS end_time,
                        COALESCE(now() BETWEEN e.starts_at AND e.ends_at, false) AS accepting_entries,
                        'Owner Gate'::text AS gate
                    FROM scanner.events e
                    WHERE lower(e.status) IN ('approved', 'active', 'published')
                    ORDER BY
                        CASE
                            WHEN now() BETWEEN e.starts_at AND e.ends_at THEN 0
                            WHEN e.starts_at > now() THEN 1
                            ELSE 2
                        END,
                        CASE WHEN e.starts_at > now() THEN e.starts_at END,
                        e.ends_at DESC,
                        e.name
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
                        COALESCE(now() BETWEEN e.starts_at AND e.ends_at, false) AS accepting_entries,
                        sa.gate
                    FROM scanner.scanner_assignments sa
                    JOIN scanner.events e ON e.id = sa.event_id
                    WHERE sa.scanner_user_id = :scanner_user_id
                      AND lower(e.status) IN ('approved', 'active', 'published')
                    ORDER BY
                        CASE
                            WHEN now() BETWEEN e.starts_at AND e.ends_at THEN 0
                            WHEN e.starts_at > now() THEN 1
                            ELSE 2
                        END,
                        CASE WHEN e.starts_at > now() THEN e.starts_at END,
                        e.ends_at DESC,
                        e.name
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

    # Find the event in scanner.events
    event = (
        db.execute(
            text(
                """
                SELECT id, name
                FROM scanner.events
                WHERE id = :event_id
                  AND lower(status) IN ('approved', 'active', 'published')
                """
            ),
            {"event_id": request.event_id},
        )
        .mappings()
        .one_or_none()
    )
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
    """Upsert the durable scanner row used by scan_logs."""
    scanner_id = _mobile_scanner_id(operator_id, event_id)
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
    """Persist the scan result and commit the scan transaction atomically."""
    scan_id = str(uuid.uuid4())
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
            "id": scan_id,
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
    if ticket_id is not None:
        db.execute(
            text(
                """
                INSERT INTO public.scan_logs (
                    id, ticket_id, event_id, event_name, attendee_name,
                    category_name, scan_result, scan_time, gate_name, scanned_by
                )
                SELECT
                    :id, t.id, t.event_id, e.title, t.attendee_name,
                    t.category_name,
                    (CASE
                        WHEN :decision = 'APPROVED' THEN 'valid'
                        WHEN :reason = 'ALREADY_USED' THEN 'already_used'
                        WHEN :reason = 'EVENT_MISMATCH' THEN 'wrong_event'
                        WHEN :reason = 'TICKET_CANCELLED' THEN 'cancelled'
                        WHEN :reason = 'TICKET_REFUNDED' THEN 'refunded'
                        ELSE 'invalid'
                    END)::public.scan_result,
                    now(), :gate, s.name
                FROM public.tickets t
                JOIN public.events e ON e.id = t.event_id
                JOIN scanner.scanners s ON s.id = :scanner_id
                WHERE t.id = :ticket_id
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "id": scan_id,
                "ticket_id": ticket_id,
                "scanner_id": scanner_id,
                "decision": result["decision"],
                "reason": result["reason"],
                "gate": gate,
            },
        )
    db.commit()
    return result


def _lookup_scanner_event(db: Session, event_id: str) -> dict | None:
    """Look up the scanner-authoritative event."""
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
    return dict(row) if row else None


def _lookup_ticket(db: Session, email: str, event_id: str) -> dict | None:
    """Lock public then scanner rows and return the best current assignment."""
    normalized_email = email.strip().lower()
    ticket_id = (
        db.execute(
            text(
                """
                SELECT te.id
                FROM scanner.ticket_assignments ta
                JOIN scanner.ticket_entitlements te ON te.id = ta.ticket_id
                JOIN scanner.users u ON u.id = ta.assigned_to_user_id
                WHERE lower(u.email) = :email
                  AND upper(ta.status) = 'ACTIVE'
                  AND te.event_id = :event_id
                ORDER BY
                    CASE WHEN upper(te.status) IN ('ACTIVE', 'ISSUED', 'PAID') THEN 0 ELSE 1 END,
                    CASE WHEN te.entry_count < te.max_entries THEN 0 ELSE 1 END,
                    te.created_at
                LIMIT 1
                """
            ),
            {"email": normalized_email, "event_id": event_id},
        )
        .scalar_one_or_none()
    )
    if ticket_id is None:
        return None

    # The public-to-scanner trigger always locks public.tickets before the
    # entitlement. Take the same order here to avoid scan/refund deadlocks.
    db.execute(
        text("SELECT id FROM public.tickets WHERE id = :ticket_id FOR UPDATE"),
        {"ticket_id": ticket_id},
    ).scalar_one_or_none()

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
                WHERE te.id = :ticket_id
                  AND lower(u.email) = :email
                  AND upper(ta.status) = 'ACTIVE'
                  AND te.event_id = :event_id
                FOR UPDATE OF te
                """
            ),
            {"ticket_id": ticket_id, "email": normalized_email, "event_id": event_id},
        )
        .mappings()
        .one_or_none()
    )
    return dict(row) if row else None


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

    attendee_user_id = str(scanned_user.id)

    # ── 7. Look up the attendee's ticket  ─────────────────────────────────
    entitlement = _lookup_ticket(db, scanned_user.email, request.event_id)
    if entitlement is None:
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate, user_id=attendee_user_id,
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
                          user_id=attendee_user_id, ticket_id=entitlement["id"])

    if entitlement.get("valid_from") and entitlement["valid_from"] > now:
        result = _scan_result(decision="REJECTED", reason="TICKET_NOT_STARTED",
                              message="This ticket is not valid yet.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=attendee_user_id, ticket_id=entitlement["id"], result=result)

    if entitlement.get("valid_until") and entitlement["valid_until"] < now:
        result = _scan_result(decision="REJECTED", reason="TICKET_EXPIRED",
                              message="This ticket has expired.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=attendee_user_id, ticket_id=entitlement["id"], result=result)

    if entitlement["entry_count"] >= entitlement["max_entries"]:
        result = _scan_result(decision="REJECTED", reason="ALREADY_USED",
                              message="This ticket has already been used.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=attendee_user_id, ticket_id=entitlement["id"], result=result)

    # ── 10. Increment usage  ──────────────────────────────────────────────
    if not _increment_usage(db, entitlement):
        result = _scan_result(decision="REJECTED", reason="ALREADY_USED",
                              message="This ticket was just used at another scanner.",
                              attendee_name=entitlement["holder_name"],
                              ticket=ticket, ownership=ownership)
        return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                          event_id=request.event_id, gate=gate,
                          user_id=attendee_user_id, ticket_id=entitlement["id"], result=result)

    ticket["entry_count"] = entitlement["entry_count"] + 1
    result = _scan_result(decision="APPROVED", reason="VALID_TICKET", message="Entry approved.",
                          attendee_name=entitlement["holder_name"],
                          ticket=ticket, ownership=ownership)
    return _save_scan(db, scanner_id=scanner_id, idempotency_key=idempotency_key,
                      event_id=request.event_id, gate=gate,
                      result=result, user_id=attendee_user_id, ticket_id=entitlement["id"])


def _increment_usage(db: Session, entitlement: dict) -> bool:
    """Increment scanner usage and mirror public reporting in one transaction."""
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
    if updated is None:
        return False

    # Synchronized public tickets use the same UUID as their entitlement. A
    # scanner-native entitlement simply updates zero rows here. Any database
    # failure still aborts the transaction, so an approval cannot be returned
    # without its durable usage/reporting writes.
    db.execute(
        text(
            """
            UPDATE public.tickets
            SET status = CASE
                    WHEN status IN ('cancelled', 'refunded', 'expired') THEN status
                    ELSE 'checked_in'
                END,
                checked_in_at = COALESCE(checked_in_at, now()),
                updated_at = now()
            WHERE id = :ticket_id
            """
        ),
        {"ticket_id": entitlement["id"]},
    )
    return True
