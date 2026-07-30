"""Drop legacy public.gp_* tables; add sync triggers from public.{events,tickets} to scanner.{events,ticket_entitlements,ticket_assignments}.

The legacy gp_* tables were written by a long-gone Node.js server. All current
data lives in public.* tables (created by db/postgres18_schema.sql) and the
scanner.* schema (created by 0001_scanner_schema.py).  This migration:

  1. Drops every public.gp_* table (they are read-only orphans).
  2. Creates trigger functions on public.events and public.tickets that
     automatically INSERT / UPDATE the corresponding scanner.* rows.
  3. Backfills the scanner.* tables from any existing public.* data.

After this migration the scanner backend can rely entirely on the scanner.*
tables and the public.events / public.tickets tables, with no gp_* fallback
logic needed.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_cleanup_legacy_and_sync"
down_revision = "0001_scanner_schema"
branch_labels = None
depends_on = None


# ── Legacy gp_* tables to drop ──────────────────────────────────────────────
_LEGACY_TABLES = [
    "public.gp_ticket_transfers",
    "public.gp_ticket_assignments",
    "public.gp_ticket_entitlements",
    "public.gp_scanners",
    "public.gp_universal_scan_logs",
    "public.gp_scanner_assignments",
    "public.gp_audit_logs",
    "public.gp_events",
    "public.gp_users",
]


# ── Trigger: sync public.events → scanner.events ────────────────────────────

_SYNC_EVENT_FN = """
CREATE OR REPLACE FUNCTION public.sync_event_to_scanner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO scanner.events (id, organization_name, name, starts_at, ends_at, venue, status, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(
            (SELECT o.name FROM public.organizations o WHERE o.id = NEW.organization_id),
            'GatePass'
        ),
        NEW.title,
        NEW.start_time,
        NEW.end_time,
        NEW.venue,
        'active',
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        organization_name = EXCLUDED.organization_name,
        name = EXCLUDED.name,
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        venue = EXCLUDED.venue,
        updated_at = now();
    RETURN NEW;
END;
$$;
"""

_SYNC_EVENT_TRIGGER = """
DROP TRIGGER IF EXISTS trg_sync_event_to_scanner ON public.events;
CREATE TRIGGER trg_sync_event_to_scanner
    AFTER INSERT OR UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_event_to_scanner();
"""


# ── Trigger: sync public.tickets → scanner.(ticket_entitlements + ticket_assignments) ──

_SYNC_TICKET_FN = """
CREATE OR REPLACE FUNCTION public.sync_ticket_to_scanner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_scanner_event_id  uuid;
    v_purchaser_user_id uuid;
    v_assignee_user_id  uuid;
    v_entitlement_id    uuid;
    v_ticket_status     text;
BEGIN
    -- Resolve the event — only sync if it exists in scanner.events (already
    -- synced by the event trigger above, or created by the scanner app).
    SELECT id INTO v_scanner_event_id
    FROM scanner.events
    WHERE id = NEW.event_id;
    IF NOT FOUND THEN
        -- The event hasn't been synced yet — sync it now so the FK works.
        INSERT INTO scanner.events (id, organization_name, name, starts_at, ends_at, venue, status, created_at, updated_at)
        SELECT
            e.id,
            COALESCE((SELECT o.name FROM public.organizations o WHERE o.id = e.organization_id), 'GatePass'),
            e.title,
            e.start_time,
            e.end_time,
            e.venue,
            'active',
            now(),
            now()
        FROM public.events e
        WHERE e.id = NEW.event_id;
    END IF;

    -- Map ticket status
    v_ticket_status := CASE NEW.status
        WHEN 'issued'   THEN 'active'
        WHEN 'paid'     THEN 'active'
        WHEN 'checked_in' THEN 'active'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'refunded'  THEN 'refunded'
        WHEN 'expired'   THEN 'expired'
        ELSE 'active'
    END;

    -- Find or create the purchaser in scanner.users by email (from orders)
    SELECT u.id INTO v_purchaser_user_id
    FROM scanner.users u
    WHERE lower(u.email) = lower((SELECT o.buyer_email FROM public.orders o WHERE o.id = NEW.order_id))
    LIMIT 1;
    -- If the purchaser hasn't logged in via Neon Auth yet, there is no
    -- scanner.users row. That's OK — the field can be NULL.

    -- Find or create the assignee in scanner.users by attendee email
    SELECT u.id INTO v_assignee_user_id
    FROM scanner.users u
    WHERE lower(u.email) = lower(NEW.attendee_email)
    LIMIT 1;
    -- Same as purchaser — NULL is acceptable; the scanner will look up by email.

    -- UPSERT ticket_entitlements
    INSERT INTO scanner.ticket_entitlements (
        id, event_id, purchased_by_user_id, issued_by_admin_user_id,
        source_type, source_reference, ticket_type, status,
        max_entries, entry_count, legacy_ticket_id, created_at, updated_at
    ) VALUES (
        NEW.id, NEW.event_id, v_purchaser_user_id, NULL,
        'TICKET_SYNC', NEW.id::text, NEW.category_name, v_ticket_status,
        1,
        CASE WHEN NEW.checked_in_at IS NOT NULL THEN 1 ELSE 0 END,
        NEW.id::text, now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        entry_count = CASE WHEN NEW.checked_in_at IS NOT NULL AND scanner.ticket_entitlements.entry_count = 0
                          THEN 1 ELSE scanner.ticket_entitlements.entry_count END,
        updated_at = now()
    RETURNING id INTO v_entitlement_id;

    -- UPSERT ticket_assignment (one active assignment per ticket)
    IF v_assignee_user_id IS NOT NULL THEN
        INSERT INTO scanner.ticket_assignments (
            id, ticket_id, assigned_to_user_id, status, assigned_at
        ) VALUES (
            gen_random_uuid(), v_entitlement_id, v_assignee_user_id, 'active', now()
        )
        ON CONFLICT (ticket_id) WHERE status = 'active'
        DO UPDATE SET
            assigned_to_user_id = EXCLUDED.assigned_to_user_id,
            assigned_at = now();
    END IF;

    RETURN NEW;
END;
$$;
"""

_SYNC_TICKET_TRIGGER = """
DROP TRIGGER IF EXISTS trg_sync_ticket_to_scanner ON public.tickets;
CREATE TRIGGER trg_sync_ticket_to_scanner
    AFTER INSERT OR UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_ticket_to_scanner();
"""


# ── Backfill existing data ───────────────────────────────────────────────────

_BACKFILL_EVENTS = """
INSERT INTO scanner.events (id, organization_name, name, starts_at, ends_at, venue, status, created_at, updated_at)
SELECT
    e.id,
    COALESCE((SELECT o.name FROM public.organizations o WHERE o.id = e.organization_id), 'GatePass'),
    e.title,
    e.start_time,
    e.end_time,
    e.venue,
    'active',
    now(),
    now()
FROM public.events e
ON CONFLICT (id) DO NOTHING;
"""

_BACKFILL_TICKETS = """
DO $$
DECLARE
    t RECORD;
    v_purchaser_user_id uuid;
    v_assignee_user_id  uuid;
BEGIN
    FOR t IN SELECT * FROM public.tickets WHERE status NOT IN ('draft', 'available', 'reserved') LOOP
        -- Ensure the event exists in scanner.events
        INSERT INTO scanner.events (id, organization_name, name, starts_at, ends_at, venue, status, created_at, updated_at)
        SELECT
            e.id,
            COALESCE((SELECT o.name FROM public.organizations o WHERE o.id = e.organization_id), 'GatePass'),
            e.title,
            e.start_time,
            e.end_time,
            e.venue,
            'active',
            now(),
            now()
        FROM public.events e
        WHERE e.id = t.event_id
        ON CONFLICT (id) DO NOTHING;

        SELECT u.id INTO v_purchaser_user_id
        FROM scanner.users u
        WHERE lower(u.email) = lower((SELECT o.buyer_email FROM public.orders o WHERE o.id = t.order_id))
        LIMIT 1;

        SELECT u.id INTO v_assignee_user_id
        FROM scanner.users u
        WHERE lower(u.email) = lower(t.attendee_email)
        LIMIT 1;

        INSERT INTO scanner.ticket_entitlements (
            id, event_id, purchased_by_user_id, issued_by_admin_user_id,
            source_type, source_reference, ticket_type, status,
            max_entries, entry_count, legacy_ticket_id, created_at, updated_at
        ) VALUES (
            t.id, t.event_id, v_purchaser_user_id, NULL,
            'LEGACY_IMPORT', t.id::text, t.category_name,
            CASE t.status
                WHEN 'issued' THEN 'active'
                WHEN 'paid' THEN 'active'
                WHEN 'checked_in' THEN 'active'
                WHEN 'cancelled' THEN 'cancelled'
                WHEN 'refunded' THEN 'refunded'
                WHEN 'expired' THEN 'expired'
                ELSE 'active'
            END,
            1,
            CASE WHEN t.checked_in_at IS NOT NULL THEN 1 ELSE 0 END,
            t.id::text, now(), now()
        )
        ON CONFLICT (id) DO NOTHING;

        IF v_assignee_user_id IS NOT NULL THEN
            INSERT INTO scanner.ticket_assignments (id, ticket_id, assigned_to_user_id, status, assigned_at)
            VALUES (gen_random_uuid(), t.id, v_assignee_user_id, 'active', now())
            ON CONFLICT (ticket_id) WHERE status = 'active'
            DO NOTHING;
        END IF;
    END LOOP;
END $$;
"""


def upgrade() -> None:
    # ── 0. Create scanner.scanner_assignments (replaces public.gp_scanner_assignments) ─
    op.create_table(
        "scanner_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scanner_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.users.id"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scanner.events.id"), nullable=False),
        sa.Column("gate", sa.Text, nullable=False, server_default="Main Gate"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("scanner_user_id", "event_id", name="uq_scanner_assignment_per_event"),
        schema="scanner",
    )

    # ── 1. Drop all legacy public.gp_* tables ───────────────────────────────
    for table in _LEGACY_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    # ── 2. Drop the old strict provenance constraint and replace with a
    #       lenient one that allows LEGACY_IMPORT tickets whose purchaser
    #       has not yet logged into the scanner service. ─────────────────
    op.execute(
        "ALTER TABLE scanner.ticket_entitlements "
        "DROP CONSTRAINT IF EXISTS ck_ticket_source_provenance"
    )
    # The relaxed constraint: ADMIN_ISSUED must have an issuer;
    # LEGACY_IMPORT / USER_PURCHASED may have NULL references until
    # the user first authenticates via Neon Auth.
    op.execute(
        "ALTER TABLE scanner.ticket_entitlements "
        "ADD CONSTRAINT ck_ticket_source_provenance "
        "CHECK ("
        "  (source_type = 'ADMIN_ISSUED' AND issued_by_admin_user_id IS NOT NULL) OR "
        "  (source_type != 'ADMIN_ISSUED')"
        ")"
    )

    # ── 3. Create trigger functions and attach them ─────────────────────────
    op.execute(_SYNC_EVENT_FN)
    op.execute(_SYNC_EVENT_TRIGGER)

    op.execute(_SYNC_TICKET_FN)
    op.execute(_SYNC_TICKET_TRIGGER)

    # ── 4. Backfill any existing data into scanner.* ────────────────────────
    op.execute(_BACKFILL_EVENTS)
    op.execute(_BACKFILL_TICKETS)


def downgrade() -> None:
    op.drop_table("scanner_assignments", schema="scanner")
    # Remove triggers first
    op.execute("DROP TRIGGER IF EXISTS trg_sync_ticket_to_scanner ON public.tickets")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_event_to_scanner ON public.events")
    op.execute("DROP FUNCTION IF EXISTS public.sync_ticket_to_scanner()")
    op.execute("DROP FUNCTION IF EXISTS public.sync_event_to_scanner()")

    # Restore gp_* tables is impractical and intentionally not implemented.
    # Downgrading simply removes the sync machinery; the scanner.* tables
    # and public.* tables remain intact.
