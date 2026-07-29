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


def _get_gp_user(db: Session, email: str):
    return (
        db.execute(
            text(
                """
                SELECT id, name, email, active
                FROM public.gp_users
                WHERE lower(email) = :email
                LIMIT 1
                """
            ),
            {"email": email.strip().lower()},
        )
        .mappings()
        .one_or_none()
    )


def _ensure_gp_user(
    db: Session,
    *,
    email: str,
    display_name: str,
):
    normalized_email = email.strip().lower()
    existing = _get_gp_user(db, normalized_email)
    if existing is not None:
        return existing

    user_id = str(uuid.uuid4())
    db.execute(
        text(
            """
            INSERT INTO public.gp_users (
                id, name, email, password_hash, role, active, created_at
            )
            VALUES (
                :id, :name, :email, '!oauth-only', 'user', true, now()
            )
            ON CONFLICT (email) DO NOTHING
            """
        ),
        {
            "id": user_id,
            "name": display_name.strip() or normalized_email.split("@", 1)[0],
            "email": normalized_email,
        },
    )
    created = _get_gp_user(db, normalized_email)
    if created is None:
        raise HTTPException(500, "Could not create scanner account")
    return created


def _operator_gp_user(db: Session, user: User):
    return _ensure_gp_user(
        db,
        email=user.email,
        display_name=user.display_name,
    )


def _event_assignments(db: Session, gp_user_id: str, owner: bool) -> list[dict]:
    if owner:
        rows = (
            db.execute(
                text(
                    """
                    SELECT
                        concat('owner:', e.id) AS id,
                        e.id AS event_id,
                        e.title AS event_name,
                        e.venue,
                        e.start_time,
                        e.end_time,
                        'Owner Gate'::text AS gate
                    FROM public.gp_events e
                    WHERE lower(e.status) IN ('approved', 'active', 'published')
                    ORDER BY e.start_time DESC, e.title
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
                        a.id,
                        e.id AS event_id,
                        e.title AS event_name,
                        e.venue,
                        e.start_time,
                        e.end_time,
                        a.gate
                    FROM public.gp_scanner_assignments a
                    JOIN public.gp_events e ON e.id = a.event_id
                    WHERE a.scanner_id = :scanner_id
                      AND lower(e.status) IN ('approved', 'active', 'published')
                    ORDER BY e.start_time DESC, e.title
                    """
                ),
                {"scanner_id": gp_user_id},
            )
            .mappings()
            .all()
        )
    return [dict(row) for row in rows]


def _owner_grants(db: Session) -> list[dict]:
    rows = (
        db.execute(
            text(
                """
                SELECT
                    a.id,
                    u.name,
                    u.email,
                    a.event_id,
                    e.title AS event_name,
                    a.gate
                FROM public.gp_scanner_assignments a
                JOIN public.gp_users u ON u.id = a.scanner_id
                JOIN public.gp_events e ON e.id = a.event_id
                ORDER BY lower(u.email), e.start_time DESC
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
    gp_user = _operator_gp_user(db, user)
    owner = _is_owner(user)
    assignments = _event_assignments(db, gp_user["id"], owner)
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

    owner = _operator_gp_user(db, user)
    event = (
        db.execute(
            text(
                """
                SELECT id, title
                FROM public.gp_events
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

    display_name = request.email.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
    operator = _ensure_gp_user(
        db,
        email=request.email,
        display_name=display_name,
    )

    if request.allowed:
        assignment_id = db.execute(
            text(
                """
                INSERT INTO public.gp_scanner_assignments (
                    id, scanner_id, event_id, gate
                )
                VALUES (:id, :scanner_id, :event_id, :gate)
                ON CONFLICT (scanner_id, event_id)
                DO UPDATE SET gate = EXCLUDED.gate
                RETURNING id
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "scanner_id": operator["id"],
                "event_id": request.event_id,
                "gate": request.gate,
            },
        ).scalar_one()
        action = "SCANNER_ACCESS_GRANTED"
    else:
        assignment_id = db.execute(
            text(
                """
                DELETE FROM public.gp_scanner_assignments
                WHERE scanner_id = :scanner_id AND event_id = :event_id
                RETURNING id
                """
            ),
            {
                "scanner_id": operator["id"],
                "event_id": request.event_id,
            },
        ).scalar_one_or_none()
        action = "SCANNER_ACCESS_REVOKED"

    db.execute(
        text(
            """
            INSERT INTO public.gp_audit_logs (
                id, actor_id, action, entity_type, entity_id, details, created_at
            )
            VALUES (
                :id, :actor_id, :action, 'scanner_assignment',
                :entity_id, :details, now()
            )
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "actor_id": owner["id"],
            "action": action,
            "entity_id": assignment_id or f"{operator['id']}:{request.event_id}",
            "details": (
                f"{request.email} · {event['title']} · {request.gate}"
            ),
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
    operator: dict,
    event_id: str,
    event_name: str,
) -> str:
    scanner_id = _mobile_scanner_id(operator["id"], event_id)
    api_key_hash = hashlib.sha256(
        f"{scanner_id}:{settings.qr_signing_key}".encode()
    ).hexdigest()
    db.execute(
        text(
            """
            INSERT INTO public.gp_scanners (
                id, name, organization_id, event_id, api_key_hash,
                allowed_purposes, status, created_at
            )
            VALUES (
                :id, :name, NULL, :event_id, :api_key_hash,
                CAST(:purposes AS json), 'ACTIVE', now()
            )
            ON CONFLICT (id)
            DO UPDATE SET
                name = EXCLUDED.name,
                event_id = EXCLUDED.event_id,
                status = 'ACTIVE'
            """
        ),
        {
            "id": scanner_id,
            "name": f"Mobile · {operator['name']} · {event_name}",
            "event_id": event_id,
            "api_key_hash": api_key_hash,
            "purposes": json.dumps(["TICKET_VALIDATION"]),
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
    gp_user_id: str | None = None,
    ticket_id: str | None = None,
) -> dict:
    db.execute(
        text(
            """
            INSERT INTO public.gp_universal_scan_logs (
                id, scanner_id, qr_credential_id, user_id, ticket_id,
                purpose, event_id, gate_id, resource_id, decision, reason,
                idempotency_key, response_payload, scanned_at
            )
            VALUES (
                :id, :scanner_id, NULL, :user_id, :ticket_id,
                'TICKET_VALIDATION', :event_id, :gate, NULL, :decision, :reason,
                :idempotency_key, CAST(:response_payload AS json), now()
            )
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "scanner_id": scanner_id,
            "user_id": gp_user_id,
            "ticket_id": ticket_id,
            "event_id": event_id,
            "gate": gate,
            "decision": result["decision"],
            "reason": result["reason"],
            "idempotency_key": idempotency_key,
            "response_payload": json.dumps(result),
        },
    )
    db.commit()
    return result


def _ticket_ownership(db: Session, ticket_id: str, transfer_id: str | None) -> dict:
    transfer_count = db.execute(
        text(
            """
            SELECT count(*)::int
            FROM public.gp_ticket_transfers
            WHERE ticket_id = :ticket_id AND upper(status) = 'ACCEPTED'
            """
        ),
        {"ticket_id": ticket_id},
    ).scalar_one()
    transferred_from_name = None
    if transfer_id:
        transferred_from_name = db.execute(
            text(
                """
                SELECT u.name
                FROM public.gp_ticket_transfers tr
                JOIN public.gp_users u ON u.id = tr.from_user_id
                WHERE tr.id = :transfer_id
                  AND upper(tr.status) = 'ACCEPTED'
                """
            ),
            {"transfer_id": transfer_id},
        ).scalar_one_or_none()
    return {
        "owner_count": transfer_count + 1,
        "is_transferred": transfer_count > 0,
        "transferred_from_name": transferred_from_name,
    }


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
    operator = _operator_gp_user(db, user)
    owner = _is_owner(user)

    event = (
        db.execute(
            text(
                """
                SELECT id, title, venue, start_time, end_time, status
                FROM public.gp_events
                WHERE id = :event_id
                """
            ),
            {"event_id": request.event_id},
        )
        .mappings()
        .one_or_none()
    )
    if event is None:
        raise HTTPException(404, "Event not found")

    if owner:
        gate = "Owner Gate"
    else:
        gate = db.execute(
            text(
                """
                SELECT gate
                FROM public.gp_scanner_assignments
                WHERE scanner_id = :scanner_id AND event_id = :event_id
                """
            ),
            {
                "scanner_id": operator["id"],
                "event_id": request.event_id,
            },
        ).scalar_one_or_none()
        if gate is None:
            raise HTTPException(403, "Scanner access is not granted for this event")

    scanner_id = _ensure_mobile_scanner(
        db,
        operator=operator,
        event_id=request.event_id,
        event_name=event["title"],
    )

    # Serializes repeated frames and concurrent retries for this scanner/key.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"{scanner_id}:{idempotency_key}"},
    )
    previous = db.execute(
        text(
            """
            SELECT response_payload
            FROM public.gp_universal_scan_logs
            WHERE scanner_id = :scanner_id
              AND idempotency_key = :idempotency_key
            ORDER BY scanned_at DESC
            LIMIT 1
            """
        ),
        {
            "scanner_id": scanner_id,
            "idempotency_key": idempotency_key,
        },
    ).scalar_one_or_none()
    if previous is not None:
        db.rollback()
        return previous

    now = datetime.now(timezone.utc)
    if (
        str(event["status"]).lower() not in {"approved", "active", "published"}
        or event["start_time"] > now
        or event["end_time"] < now
    ):
        result = _scan_result(
            decision="REJECTED",
            reason="EVENT_NOT_ACTIVE",
            message="This event is not accepting entry right now.",
        )
        return _save_scan(
            db,
            scanner_id=scanner_id,
            idempotency_key=idempotency_key,
            event_id=request.event_id,
            gate=gate,
            result=result,
        )

    parsed = parse_qr_payload(request.payload)
    if parsed is None or not verify_qr_signature(*parsed):
        result = _scan_result(
            decision="REJECTED",
            reason="INVALID_QR",
            message="This QR code is invalid or has been altered.",
        )
        return _save_scan(
            db,
            scanner_id=scanner_id,
            idempotency_key=idempotency_key,
            event_id=request.event_id,
            gate=gate,
            result=result,
        )

    credential = (
        db.query(QrCredential)
        .filter_by(public_id=parsed[0])
        .one_or_none()
    )
    if credential is None or credential.status != "active":
        result = _scan_result(
            decision="REJECTED",
            reason="QR_REVOKED",
            message="This QR pass is no longer active.",
        )
        return _save_scan(
            db,
            scanner_id=scanner_id,
            idempotency_key=idempotency_key,
            event_id=request.event_id,
            gate=gate,
            result=result,
        )

    scanned_user = db.get(User, credential.user_id)
    if scanned_user is None or scanned_user.status != "active":
        result = _scan_result(
            decision="REJECTED",
            reason="ACCOUNT_INACTIVE",
            message="The attendee account is inactive.",
        )
        return _save_scan(
            db,
            scanner_id=scanner_id,
            idempotency_key=idempotency_key,
            event_id=request.event_id,
            gate=gate,
            result=result,
        )

    holder = _ensure_gp_user(
        db,
        email=scanned_user.email,
        display_name=scanned_user.display_name,
    )
    entitlement = (
        db.execute(
            text(
                """
                SELECT
                    t.id,
                    t.ticket_type,
                    t.status,
                    t.valid_from,
                    t.valid_until,
                    t.entry_count,
                    t.max_entries,
                    a.transfer_id,
                    holder.name AS holder_name,
                    purchaser.name AS original_owner_name
                FROM public.gp_ticket_assignments a
                JOIN public.gp_ticket_entitlements t ON t.id = a.ticket_id
                JOIN public.gp_users holder ON holder.id = a.assigned_to_user_id
                JOIN public.gp_users purchaser ON purchaser.id = t.purchased_by_user_id
                WHERE a.assigned_to_user_id = :user_id
                  AND upper(a.status) = 'ACTIVE'
                  AND t.event_id = :event_id
                ORDER BY
                    CASE WHEN t.entry_count < t.max_entries THEN 0 ELSE 1 END,
                    t.created_at
                LIMIT 1
                FOR UPDATE OF t
                """
            ),
            {
                "user_id": holder["id"],
                "event_id": request.event_id,
            },
        )
        .mappings()
        .one_or_none()
    )
    if entitlement is None:
        result = _scan_result(
            decision="REJECTED",
            reason="NO_ACTIVE_TICKET",
            message="No ticket for this event is assigned to this attendee.",
            attendee_name=scanned_user.display_name,
        )
        return _save_scan(
            db,
            scanner_id=scanner_id,
            idempotency_key=idempotency_key,
            event_id=request.event_id,
            gate=gate,
            result=result,
            gp_user_id=holder["id"],
        )

    ownership = _ticket_ownership(
        db,
        entitlement["id"],
        entitlement["transfer_id"],
    )
    ticket = {
        "id": entitlement["id"],
        "event_id": request.event_id,
        "event_name": event["title"],
        "ticket_type": entitlement["ticket_type"],
        "entry_count": entitlement["entry_count"],
        "max_entries": entitlement["max_entries"],
        "original_owner_name": entitlement["original_owner_name"],
    }

    status = str(entitlement["status"]).upper()
    if status != "ACTIVE":
        result = _scan_result(
            decision="REJECTED",
            reason=f"TICKET_{status}",
            message=f"This ticket is {status.lower()}.",
            attendee_name=entitlement["holder_name"],
            ticket=ticket,
            ownership=ownership,
        )
    elif entitlement["valid_from"] and entitlement["valid_from"] > now:
        result = _scan_result(
            decision="REJECTED",
            reason="TICKET_NOT_STARTED",
            message="This ticket is not valid yet.",
            attendee_name=entitlement["holder_name"],
            ticket=ticket,
            ownership=ownership,
        )
    elif entitlement["valid_until"] and entitlement["valid_until"] < now:
        result = _scan_result(
            decision="REJECTED",
            reason="TICKET_EXPIRED",
            message="This ticket has expired.",
            attendee_name=entitlement["holder_name"],
            ticket=ticket,
            ownership=ownership,
        )
    elif entitlement["entry_count"] >= entitlement["max_entries"]:
        result = _scan_result(
            decision="REJECTED",
            reason="ALREADY_USED",
            message="This ticket has already been used.",
            attendee_name=entitlement["holder_name"],
            ticket=ticket,
            ownership=ownership,
        )
    else:
        updated_entry_count = db.execute(
            text(
                """
                UPDATE public.gp_ticket_entitlements
                SET entry_count = entry_count + 1, updated_at = now()
                WHERE id = :ticket_id AND entry_count < max_entries
                RETURNING entry_count
                """
            ),
            {"ticket_id": entitlement["id"]},
        ).scalar_one_or_none()
        if updated_entry_count is None:
            result = _scan_result(
                decision="REJECTED",
                reason="ALREADY_USED",
                message="This ticket was just used at another scanner.",
                attendee_name=entitlement["holder_name"],
                ticket=ticket,
                ownership=ownership,
            )
        else:
            ticket["entry_count"] = updated_entry_count
            result = _scan_result(
                decision="APPROVED",
                reason="VALID_TICKET",
                message="Entry approved.",
                attendee_name=entitlement["holder_name"],
                ticket=ticket,
                ownership=ownership,
            )

    return _save_scan(
        db,
        scanner_id=scanner_id,
        idempotency_key=idempotency_key,
        event_id=request.event_id,
        gate=gate,
        result=result,
        gp_user_id=holder["id"],
        ticket_id=entitlement["id"],
    )
