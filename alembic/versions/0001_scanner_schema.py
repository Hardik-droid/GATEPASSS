import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_scanner_schema"
down_revision = None
branch_labels = None
depends_on = None

_now = sa.text("now()")


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS scanner")

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("google_issuer", sa.Text, nullable=False),
        sa.Column("google_subject", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("photo_url", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.UniqueConstraint("google_issuer", "google_subject"),
        schema="scanner",
    )

    op.create_table(
        "events",
        _uuid_pk(),
        sa.Column("organization_name", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("venue", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("legacy_event_id", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "resources",
        _uuid_pk(),
        sa.Column("organization_name", sa.Text, nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "ticket_entitlements",
        _uuid_pk(),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id"), nullable=False),
        sa.Column("purchased_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("issued_by_admin_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("source_type", sa.Text, nullable=False),
        sa.Column("source_reference", sa.Text),
        sa.Column("ticket_type", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("valid_from", sa.DateTime(timezone=True)),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("max_entries", sa.Integer, nullable=False, server_default="1"),
        sa.Column("entry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("legacy_ticket_id", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.CheckConstraint("max_entries >= 1", name="ck_max_entries_positive"),
        sa.CheckConstraint("entry_count >= 0", name="ck_entry_count_nonneg"),
        sa.CheckConstraint("entry_count <= max_entries", name="ck_entry_within_max"),
        sa.CheckConstraint(
            "(source_type = 'ADMIN_ISSUED' AND issued_by_admin_user_id IS NOT NULL "
            "AND purchased_by_user_id IS NULL) OR "
            "(source_type = 'LEGACY_IMPORT' AND purchased_by_user_id IS NOT NULL "
            "AND issued_by_admin_user_id IS NULL)",
            name="ck_ticket_source_provenance",
        ),
        schema="scanner",
    )

    op.create_table(
        "ticket_transfers",
        _uuid_pk(),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_entitlements.id"), nullable=False),
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("to_email", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )
    op.create_index(
        "ix_one_pending_transfer_per_ticket",
        "ticket_transfers",
        ["ticket_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        schema="scanner",
    )

    op.create_table(
        "ticket_assignments",
        _uuid_pk(),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_entitlements.id"), nullable=False),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("transfer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_transfers.id")),
        schema="scanner",
    )
    op.create_index(
        "ix_one_active_assignment_per_ticket",
        "ticket_assignments",
        ["ticket_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        schema="scanner",
    )

    op.create_table(
        "qr_credentials",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("public_id", sa.Text, nullable=False, unique=True),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        schema="scanner",
    )
    op.create_index(
        "ix_one_active_qr_per_user",
        "qr_credentials",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        schema="scanner",
    )

    op.create_table(
        "scanners",
        _uuid_pk(),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("organization_name", sa.Text, nullable=False),
        sa.Column("purpose", sa.Text, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id")),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.resources.id")),
        sa.Column("gate_id", sa.Text),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.CheckConstraint(
            "(purpose = 'TICKET_VALIDATION' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ATTENDANCE' AND event_id IS NOT NULL AND resource_id IS NULL) OR "
            "(purpose = 'ACCESS_CONTROL' AND resource_id IS NOT NULL AND event_id IS NULL) OR "
            "(purpose = 'IDENTITY_VERIFICATION' AND event_id IS NULL AND resource_id IS NULL)",
            name="ck_scanner_purpose_locator",
        ),
        schema="scanner",
    )

    op.create_table(
        "scanner_pairing_codes",
        _uuid_pk(),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("code_hash", sa.Text, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "scanner_sessions",
        _uuid_pk(),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("token_hash", sa.Text, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("device_name", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )

    op.create_table(
        "attendance_records",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id"), nullable=False),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("marked_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.UniqueConstraint("user_id", "event_id"),
        schema="scanner",
    )

    op.create_table(
        "access_grants",
        _uuid_pk(),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.resources.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("grant_type", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("valid_from", sa.DateTime(timezone=True)),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("granted_by_admin_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        schema="scanner",
    )
    op.create_index(
        "ix_one_active_grant_per_resource_user",
        "access_grants",
        ["resource_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        schema="scanner",
    )

    op.create_table(
        "scan_logs",
        _uuid_pk(),
        sa.Column("scanner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.scanners.id"), nullable=False),
        sa.Column("qr_credential_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.qr_credentials.id")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id")),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.ticket_entitlements.id")),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.resources.id")),
        sa.Column("access_grant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.access_grants.id")),
        sa.Column("purpose", sa.Text, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id")),
        sa.Column("gate_id", sa.Text),
        sa.Column("decision", sa.Text, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("idempotency_key", sa.Text, nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False, server_default=_now),
        sa.Column("metadata", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'")),
        sa.UniqueConstraint("scanner_id", "idempotency_key"),
        schema="scanner",
    )


def downgrade() -> None:
    for table in (
        "scan_logs",
        "access_grants",
        "attendance_records",
        "scanner_sessions",
        "scanner_pairing_codes",
        "scanners",
        "qr_credentials",
        "ticket_assignments",
        "ticket_transfers",
        "ticket_entitlements",
        "resources",
        "events",
        "users",
    ):
        op.drop_table(table, schema="scanner")
    op.execute("DROP SCHEMA IF EXISTS scanner CASCADE")
