"""Ticket transfer endpoints.

Ownership moves by ending one scanner.ticket_assignments row and inserting
another inside a single transaction. The partial unique index
ix_one_active_assignment_per_ticket makes a concurrent double-accept fail at
the database level rather than relying on application checks.

No QR credential is touched: a user's QR identifies the person, and the
scanner resolves person -> active assignments. Moving the assignment is what
makes the ticket work for the recipient and stop working for the sender.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User
from backend.security import get_current_user
from backend.transfer_service import (
    TRANSFER_ACCEPTED,
    TRANSFER_CANCELLED,
    TRANSFER_DECLINED,
    TRANSFER_PENDING,
    effective_status,
    ticket_block_reason,
    transfer_expiry,
)

router = APIRouter(tags=["transfers"])


class CreateTransferRequest(BaseModel):
    ticket_id: str = Field(min_length=1, max_length=64)
    to_email: str = Field(min_length=3, max_length=320)

    @field_validator("to_email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        local, separator, domain = email.partition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("Enter a valid email address")
        return email


class RespondTransferRequest(BaseModel):
    transfer_id: str = Field(min_length=1, max_length=64)
    action: str

    @field_validator("action")
    @classmethod
    def known_action(cls, value: str) -> str:
        if value not in {"accept", "decline", "cancel"}:
            raise ValueError("action must be accept, decline or cancel")
        return value


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/api/tickets/mine")
def my_tickets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Tickets the caller currently holds, with any pending outgoing transfer."""
    rows = (
        db.execute(
            text(
                """
                SELECT
                    te.id, te.ticket_type, te.entry_count,
                    e.id AS event_id, e.name AS event_name, e.venue, e.starts_at,
                    tr.id AS transfer_id, tr.to_email, tr.expires_at
                FROM scanner.ticket_assignments ta
                JOIN scanner.ticket_entitlements te ON te.id = ta.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                LEFT JOIN scanner.ticket_transfers tr
                       ON tr.ticket_id = te.id AND tr.status = 'pending'
                WHERE ta.assigned_to_user_id = :uid
                  AND ta.status = 'active'
                  AND e.ends_at > now()
                  AND lower(te.status) NOT IN ('cancelled', 'refunded', 'expired')
                ORDER BY e.starts_at
                """
            ),
            {"uid": str(user.id)},
        )
        .mappings()
        .all()
    )
    return {
        "tickets": [
            {
                "id": str(row["id"]),
                "ticket_type": row["ticket_type"],
                "event_id": str(row["event_id"]),
                "event_name": row["event_name"],
                "venue": row["venue"],
                "starts_at": row["starts_at"].isoformat(),
                "entry_count": row["entry_count"],
                "pending_transfer": (
                    {
                        "id": str(row["transfer_id"]),
                        "to_email": row["to_email"],
                        "expires_at": row["expires_at"].isoformat(),
                    }
                    if row["transfer_id"]
                    else None
                ),
            }
            for row in rows
        ]
    }


@router.get("/api/transfers/list")
def list_transfers(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Transfers the caller is party to, split into incoming and outgoing."""
    rows = (
        db.execute(
            text(
                """
                SELECT
                    tr.id, tr.ticket_id, tr.from_user_id, tr.to_user_id,
                    tr.to_email, tr.status, tr.created_at, tr.expires_at,
                    te.ticket_type, e.name AS event_name, e.starts_at,
                    sender.display_name AS from_name, sender.email AS from_email
                FROM scanner.ticket_transfers tr
                JOIN scanner.ticket_entitlements te ON te.id = tr.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                JOIN scanner.users sender ON sender.id = tr.from_user_id
                WHERE tr.from_user_id = :uid
                   OR tr.to_user_id = :uid
                   OR (tr.to_user_id IS NULL AND lower(tr.to_email) = :email)
                ORDER BY tr.created_at DESC
                """
            ),
            {"uid": str(user.id), "email": user.email.strip().lower()},
        )
        .mappings()
        .all()
    )
    now = _now()
    email = user.email.strip().lower()
    incoming: list[dict] = []
    outgoing: list[dict] = []
    for row in rows:
        item = {
            "id": str(row["id"]),
            "ticket_id": str(row["ticket_id"]),
            "ticket_type": row["ticket_type"],
            "event_name": row["event_name"],
            "starts_at": row["starts_at"].isoformat(),
            "from_name": row["from_name"],
            "from_email": row["from_email"],
            "to_email": row["to_email"],
            "status": effective_status(row["status"], row["expires_at"], now),
            "created_at": row["created_at"].isoformat(),
            "expires_at": row["expires_at"].isoformat(),
        }
        addressed_to_me = str(row["to_user_id"]) == str(user.id) or (
            row["to_user_id"] is None and str(row["to_email"]).lower() == email
        )
        if addressed_to_me:
            incoming.append(item)
        else:
            outgoing.append(item)
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/api/transfers/create")
def create_transfer(
    request: CreateTransferRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if request.to_email == user.email.strip().lower():
        raise HTTPException(409, "You cannot transfer a ticket to yourself")

    # The recipient does not have to exist yet. If they have never signed in,
    # to_user_id stays NULL and the transfer is held against the email address;
    # list/respond match an unclaimed transfer by email, so it appears in their
    # panel the first time they sign in. Google has verified the address by
    # then, so only the real owner of that inbox can claim it.
    recipient = (
        db.execute(
            text("SELECT id FROM scanner.users WHERE lower(email) = :email LIMIT 1"),
            {"email": request.to_email},
        )
        .mappings()
        .one_or_none()
    )
    recipient_id = str(recipient["id"]) if recipient is not None else None

    ticket = (
        db.execute(
            text(
                """
                SELECT te.id, te.status, te.entry_count, e.starts_at
                FROM scanner.ticket_assignments ta
                JOIN scanner.ticket_entitlements te ON te.id = ta.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                WHERE ta.ticket_id = :ticket_id
                  AND ta.assigned_to_user_id = :uid
                  AND ta.status = 'active'
                """
            ),
            {"ticket_id": request.ticket_id, "uid": str(user.id)},
        )
        .mappings()
        .one_or_none()
    )
    if ticket is None:
        raise HTTPException(404, "That ticket is not assigned to you")

    now = _now()
    reason = ticket_block_reason(
        entry_count=ticket["entry_count"],
        ticket_status=ticket["status"],
        event_starts_at=ticket["starts_at"],
        now=now,
    )
    if reason is not None:
        raise HTTPException(409, reason)

    transfer_id = str(uuid.uuid4())
    expires_at = transfer_expiry(now, ticket["starts_at"])
    try:
        db.execute(
            text(
                """
                INSERT INTO scanner.ticket_transfers (
                    id, ticket_id, from_user_id, to_user_id, to_email, status, expires_at
                ) VALUES (
                    :id, :ticket_id, :from_id, :to_id, :to_email, 'pending', :expires_at
                )
                """
            ),
            {
                "id": transfer_id,
                "ticket_id": request.ticket_id,
                "from_id": str(user.id),
                "to_id": recipient_id,
                "to_email": request.to_email,
                "expires_at": expires_at,
            },
        )
        db.commit()
    except IntegrityError:
        # ix_one_pending_transfer_per_ticket
        db.rollback()
        raise HTTPException(409, "This ticket already has a pending transfer")

    return {"id": transfer_id, "status": TRANSFER_PENDING, "expires_at": expires_at.isoformat()}


@router.post("/api/transfers/respond")
def respond_to_transfer(
    request: RespondTransferRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    transfer = (
        db.execute(
            text(
                """
                SELECT tr.id, tr.ticket_id, tr.from_user_id, tr.to_user_id,
                       tr.to_email, tr.status, tr.expires_at, te.status AS ticket_status,
                       te.entry_count, e.starts_at
                FROM scanner.ticket_transfers tr
                JOIN scanner.ticket_entitlements te ON te.id = tr.ticket_id
                JOIN scanner.events e ON e.id = te.event_id
                WHERE tr.id = :id
                FOR UPDATE OF tr
                """
            ),
            {"id": request.transfer_id},
        )
        .mappings()
        .one_or_none()
    )
    if transfer is None:
        raise HTTPException(404, "Transfer not found")

    now = _now()
    status = effective_status(transfer["status"], transfer["expires_at"], now)
    if status != TRANSFER_PENDING:
        db.rollback()
        raise HTTPException(409, f"This transfer is already {status}")

    # An unclaimed transfer (sent before the recipient had an account) is
    # matched on the verified email instead of a user id.
    is_recipient = str(transfer["to_user_id"]) == str(user.id) or (
        transfer["to_user_id"] is None
        and str(transfer["to_email"]).lower() == user.email.strip().lower()
    )
    is_sender = str(transfer["from_user_id"]) == str(user.id)

    if request.action == "cancel":
        if not is_sender:
            raise HTTPException(403, "Only the sender can cancel a transfer")
        new_status = TRANSFER_CANCELLED
    elif request.action == "decline":
        if not is_recipient:
            raise HTTPException(403, "Only the recipient can decline a transfer")
        new_status = TRANSFER_DECLINED
    else:
        if not is_recipient:
            raise HTTPException(403, "Only the recipient can accept a transfer")
        new_status = TRANSFER_ACCEPTED

    if new_status != TRANSFER_ACCEPTED:
        db.execute(
            text("UPDATE scanner.ticket_transfers SET status = :s WHERE id = :id"),
            {"s": new_status, "id": request.transfer_id},
        )
        db.commit()
        return {"status": new_status}

    # Accept: re-check eligibility, then move ownership atomically.
    reason = ticket_block_reason(
        entry_count=transfer["entry_count"],
        ticket_status=transfer["ticket_status"],
        event_starts_at=transfer["starts_at"],
        now=now,
    )
    if reason is not None:
        db.rollback()
        raise HTTPException(409, reason)

    db.execute(
        text(
            """
            UPDATE scanner.ticket_assignments
            SET status = 'ended', ended_at = now()
            WHERE ticket_id = :ticket_id AND status = 'active'
            """
        ),
        {"ticket_id": str(transfer["ticket_id"])},
    )
    db.execute(
        text(
            """
            INSERT INTO scanner.ticket_assignments (
                id, ticket_id, assigned_to_user_id, status, transfer_id
            ) VALUES (:id, :ticket_id, :uid, 'active', :transfer_id)
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "ticket_id": str(transfer["ticket_id"]),
            "uid": str(user.id),
            "transfer_id": request.transfer_id,
        },
    )
    # public.tickets is the fallback the scanner reads when the scanner.* rows
    # are missing, and the organizer console reads it directly, so both must
    # agree. attendee_phone is cleared rather than carried over: scanner.users
    # holds no phone number and keeping the sender's would leak it.
    db.execute(
        text(
            """
            UPDATE public.tickets
            SET attendee_email = :email, attendee_name = :name, attendee_phone = '',
                updated_at = now()
            WHERE id = :ticket_id
            """
        ),
        {
            "email": user.email.strip().lower(),
            "name": user.display_name,
            "ticket_id": str(transfer["ticket_id"]),
        },
    )
    # to_user_id is set here as well as status: a transfer created before the
    # recipient had an account carries NULL until they claim it.
    db.execute(
        text(
            """
            UPDATE scanner.ticket_transfers
            SET status = 'accepted', accepted_at = now(), to_user_id = :uid
            WHERE id = :id
            """
        ),
        {"id": request.transfer_id, "uid": str(user.id)},
    )
    db.commit()
    return {"status": TRANSFER_ACCEPTED}
