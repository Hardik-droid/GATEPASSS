"""Add durable, idempotent ticket checkout operations and reservations."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_ticket_checkout"
down_revision = "0003_public_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "checkout_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_subject", sa.Text, nullable=False),
        sa.Column("actor_email", sa.Text, nullable=False),
        sa.Column("operation_kind", sa.Text, nullable=False),
        sa.Column("idempotency_key", sa.Text, nullable=False),
        sa.Column("request_hash", sa.Text, nullable=False),
        sa.Column("app_event_id", sa.Text, nullable=False),
        sa.Column("app_category_id", sa.Text, nullable=False),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ticket_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attendee_email", sa.Text, nullable=False),
        sa.Column("attendee_name", sa.Text, nullable=False),
        sa.Column("attendee_phone", sa.Text, nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("gross_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("platform_fee", sa.Numeric(12, 2), nullable=False),
        sa.Column("gateway_fee", sa.Numeric(12, 2), nullable=False),
        sa.Column("net_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("razorpay_order_id", sa.Text, unique=True),
        sa.Column("razorpay_payment_id", sa.Text, unique=True),
        sa.Column("razorpay_amount", sa.Integer),
        sa.Column("result_payload", postgresql.JSONB),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("operation_kind IN ('checkout', 'manual')"),
        sa.CheckConstraint("quantity > 0 AND quantity <= 20"),
        sa.CheckConstraint("unit_price >= 0 AND gross_amount >= 0"),
        sa.CheckConstraint("platform_fee >= 0 AND gateway_fee >= 0"),
        sa.CheckConstraint("net_amount >= 0"),
        sa.CheckConstraint("payment_method IN ('online', 'cash', 'free')"),
        sa.CheckConstraint("status IN ('prepared', 'issued', 'expired')"),
        sa.UniqueConstraint(
            "actor_subject",
            "operation_kind",
            "idempotency_key",
            name="uq_checkout_operation_idempotency",
        ),
    )
    op.create_index(
        "ix_checkout_operations_actor",
        "checkout_operations",
        ["actor_subject", "created_at"],
    )

    op.create_table(
        "checkout_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "operation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("checkout_operations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ticket_categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("quantity > 0 AND quantity <= 20"),
        sa.CheckConstraint("status IN ('active', 'consumed', 'expired')"),
    )
    op.create_index(
        "ix_checkout_reservations_capacity",
        "checkout_reservations",
        ["category_id", "status", "expires_at"],
    )

    op.execute(
        """
        CREATE TRIGGER trg_checkout_operations_updated_at
        BEFORE UPDATE ON checkout_operations
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at()
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_checkout_operations_updated_at "
        "ON checkout_operations"
    )
    op.drop_table("checkout_reservations")
    op.drop_table("checkout_operations")
