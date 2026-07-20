import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("google_issuer", "google_subject"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    google_issuer: Mapped[str]
    google_subject: Mapped[str]
    email: Mapped[str]
    display_name: Mapped[str]
    photo_url: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organization_name: Mapped[str]
    name: Mapped[str]
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    venue: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    legacy_event_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = _uuid_pk()
    organization_name: Mapped[str]
    name: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class TicketEntitlement(Base):
    __tablename__ = "ticket_entitlements"
    __table_args__ = (
        CheckConstraint("entry_count <= max_entries", name="ck_entry_within_max"),
        CheckConstraint(
            "(source_type = 'ADMIN_ISSUED' AND issued_by_admin_user_id IS NOT NULL "
            "AND purchased_by_user_id IS NULL) OR "
            "(source_type = 'LEGACY_IMPORT' AND purchased_by_user_id IS NOT NULL "
            "AND issued_by_admin_user_id IS NULL)",
            name="ck_ticket_source_provenance",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.events.id"))
    purchased_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.users.id")
    )
    issued_by_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.users.id")
    )
    source_type: Mapped[str]
    source_reference: Mapped[str | None]
    ticket_type: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")
    valid_from: Mapped[datetime | None]
    valid_until: Mapped[datetime | None]
    max_entries: Mapped[int] = mapped_column(server_default=text("1"))
    entry_count: Mapped[int] = mapped_column(server_default=text("0"))
    legacy_ticket_id: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class TicketAssignment(Base):
    __tablename__ = "ticket_assignments"
    __table_args__ = (
        Index(
            "ix_one_active_assignment_per_ticket",
            "ticket_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.ticket_entitlements.id"))
    assigned_to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    status: Mapped[str] = mapped_column(server_default="active")
    assigned_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    ended_at: Mapped[datetime | None]
    transfer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.ticket_transfers.id")
    )


class TicketTransfer(Base):
    __tablename__ = "ticket_transfers"
    __table_args__ = (
        Index(
            "ix_one_pending_transfer_per_ticket",
            "ticket_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.ticket_entitlements.id"))
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.users.id"))
    to_email: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="pending")
    expires_at: Mapped[datetime]
    accepted_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("user_id", "event_id"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.events.id"))
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    marked_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class AccessGrant(Base):
    __tablename__ = "access_grants"
    __table_args__ = (
        Index(
            "ix_one_active_grant_per_resource_user",
            "resource_id",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.resources.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    grant_type: Mapped[str]
    status: Mapped[str] = mapped_column(server_default="active")
    valid_from: Mapped[datetime | None]
    valid_until: Mapped[datetime | None]
    granted_by_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.users.id")
    )
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class QrCredential(Base):
    __tablename__ = "qr_credentials"
    __table_args__ = (
        Index(
            "ix_one_active_qr_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.users.id"))
    public_id: Mapped[str] = mapped_column(unique=True)
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    revoked_at: Mapped[datetime | None]


class Scanner(Base):
    __tablename__ = "scanners"
    __table_args__ = (
        CheckConstraint(
            "(purpose = 'TICKET_VALIDATION' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ATTENDANCE' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ACCESS_CONTROL' AND resource_id IS NOT NULL AND event_id IS NULL) OR "
            "(purpose = 'IDENTITY_VERIFICATION' AND event_id IS NULL AND resource_id IS NULL)",
            name="ck_scanner_purpose_locator",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str]
    organization_name: Mapped[str]
    purpose: Mapped[str]
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.events.id"))
    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.resources.id"))
    gate_id: Mapped[str | None]
    status: Mapped[str] = mapped_column(server_default="active")
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class ScannerPairingCode(Base):
    __tablename__ = "scanner_pairing_codes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    code_hash: Mapped[str]
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class ScannerSession(Base):
    __tablename__ = "scanner_sessions"

    id: Mapped[uuid.UUID] = _uuid_pk()
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    token_hash: Mapped[str]
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    last_seen_at: Mapped[datetime | None]
    device_name: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=text("now()"))


class ScanLog(Base):
    __tablename__ = "scan_logs"
    __table_args__ = (UniqueConstraint("scanner_id", "idempotency_key"),)

    id: Mapped[uuid.UUID] = _uuid_pk()
    scanner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scanner.scanners.id"))
    qr_credential_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.qr_credentials.id")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.users.id"))
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.ticket_entitlements.id")
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.resources.id"))
    access_grant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scanner.access_grants.id")
    )
    purpose: Mapped[str]
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scanner.events.id"))
    gate_id: Mapped[str | None]
    decision: Mapped[str]
    reason: Mapped[str]
    idempotency_key: Mapped[str]
    scanned_at: Mapped[datetime] = mapped_column(server_default=text("now()"))
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, server_default=text("'{}'"))