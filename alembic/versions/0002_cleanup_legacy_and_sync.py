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

_PUBLIC_SCHEMA_DDL = r"""
-- GatePass public schema DDL, executed only by Alembic migrations.
-- Do not run this manually or from application startup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM (
    'owner',
    'event_manager',
    'finance_manager',
    'gate_staff',
    'scanner_staff',
    'attendee'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE ticket_status AS ENUM (
    'draft',
    'available',
    'reserved',
    'paid',
    'issued',
    'checked_in',
    'cancelled',
    'refunded',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE payment_method AS ENUM ('online', 'cash', 'free');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE access_request_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE invite_category AS ENUM ('invite', 'pre_approved', 'contractor', 'delivery', 'event');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE invite_status AS ENUM ('approved', 'pending', 'expired', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE settlement_status AS ENUM ('pending', 'processing', 'settled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE scan_result AS ENUM ('valid', 'already_used', 'invalid', 'wrong_event', 'cancelled', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_type text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  role user_role NOT NULL DEFAULT 'attendee',
  avatar_url text NOT NULL,
  student_id text UNIQUE,
  current_zone text,
  clearance_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'attendee';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS student_id text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS current_zone text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS clearance_level text;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE users
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'full_name'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE users SET name = COALESCE(name, full_name) WHERE name IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'studentid'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'student_id'
  ) THEN
    EXECUTE 'UPDATE users SET student_id = COALESCE(student_id, studentid) WHERE student_id IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'avatarurl'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'avatar_url'
  ) THEN
    EXECUTE 'UPDATE users SET avatar_url = COALESCE(avatar_url, avatarurl) WHERE avatar_url IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'name'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE name IS NULL OR btrim(name) = ''
  ) THEN
    ALTER TABLE users
    ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  event_type text NOT NULL,
  venue text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  banner_url text NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  capacity integer NOT NULL CHECK (capacity >= 0),
  sold_count integer NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, name)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  buyer_phone text NOT NULL,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  gateway_fee numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'online',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  category_id uuid REFERENCES ticket_categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  attendee_name text NOT NULL,
  attendee_phone text NOT NULL,
  attendee_email text NOT NULL,
  qr_token text NOT NULL UNIQUE,
  status ticket_status NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  gate_scanned text,
  scanned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_name text NOT NULL,
  requester_avatar_url text,
  zone_name text NOT NULL,
  duration_hours text NOT NULL,
  purpose text NOT NULL,
  status access_request_status NOT NULL DEFAULT 'pending',
  request_time timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invite_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  category invite_category NOT NULL,
  sub_category text NOT NULL,
  pass_id_code text NOT NULL UNIQUE,
  status invite_status NOT NULL DEFAULT 'pending',
  validity_text text NOT NULL,
  usage_text text NOT NULL,
  usage_type text NOT NULL CHECK (usage_type IN ('limited', 'unlimited')),
  entries_total integer CHECK (entries_total IS NULL OR entries_total >= 0),
  entries_used integer NOT NULL DEFAULT 0 CHECK (entries_used >= 0),
  qr_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  attendee_name text NOT NULL,
  category_name text NOT NULL,
  scan_result scan_result NOT NULL,
  scan_time timestamptz NOT NULL DEFAULT now(),
  gate_name text NOT NULL,
  scanned_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  gross_sales numeric(12,2) NOT NULL DEFAULT 0,
  total_refunds numeric(12,2) NOT NULL DEFAULT 0,
  platform_fees numeric(12,2) NOT NULL DEFAULT 0,
  gateway_fees numeric(12,2) NOT NULL DEFAULT 0,
  manual_collections numeric(12,2) NOT NULL DEFAULT 0,
  net_settlement numeric(12,2) NOT NULL DEFAULT 0,
  status settlement_status NOT NULL DEFAULT 'pending',
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  details text NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  state_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_data bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_event_id ON ticket_categories(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_invite_passes_status ON invite_passes(status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_event_id ON scan_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_ticket_id ON scan_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_state_updated_at ON app_state(updated_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_organizations_updated_at'
  ) THEN
    CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at'
  ) THEN
    CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_events_updated_at'
  ) THEN
    CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ticket_categories_updated_at'
  ) THEN
    CREATE TRIGGER trg_ticket_categories_updated_at
    BEFORE UPDATE ON ticket_categories
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_updated_at'
  ) THEN
    CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tickets_updated_at'
  ) THEN
    CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_access_requests_updated_at'
  ) THEN
    CREATE TRIGGER trg_access_requests_updated_at
    BEFORE UPDATE ON access_requests
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invite_passes_updated_at'
  ) THEN
    CREATE TRIGGER trg_invite_passes_updated_at
    BEFORE UPDATE ON invite_passes
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settlements_updated_at'
  ) THEN
    CREATE TRIGGER trg_settlements_updated_at
    BEFORE UPDATE ON settlements
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_app_state_updated_at'
  ) THEN
    CREATE TRIGGER trg_app_state_updated_at
    BEFORE UPDATE ON app_state
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

CREATE OR REPLACE VIEW v_event_sales_summary AS
SELECT
  e.id AS event_id,
  e.title AS event_name,
  e.event_type,
  e.venue,
  e.start_time,
  e.capacity,
  COALESCE(SUM(tc.sold_count), 0) AS tickets_sold,
  GREATEST(e.capacity - COALESCE(SUM(tc.sold_count), 0), 0) AS seats_remaining,
  ROUND(
    CASE
      WHEN e.capacity = 0 THEN 0
      ELSE (COALESCE(SUM(tc.sold_count), 0)::numeric / e.capacity::numeric) * 100
    END,
    2
  ) AS occupancy_percent
FROM events e
LEFT JOIN ticket_categories tc ON tc.event_id = e.id
GROUP BY e.id;

CREATE OR REPLACE VIEW v_pending_access_requests AS
SELECT *
FROM access_requests
WHERE status = 'pending'
ORDER BY request_time DESC;

CREATE OR REPLACE VIEW v_active_invite_passes AS
SELECT *
FROM invite_passes
WHERE status = 'approved'
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW v_recent_scan_activity AS
SELECT *
FROM scan_logs
ORDER BY scan_time DESC, created_at DESC
LIMIT 100;

CREATE OR REPLACE VIEW v_latest_app_state AS
SELECT state_key, payload, created_at, updated_at
FROM app_state;

"""


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
    # A new database reaches this revision before 0003_public_schema. Keep this
    # immutable DDL snapshot in the revision so changing db/postgres18_schema.sql
    # cannot silently change the meaning of an already-deployed migration.
    op.execute(_PUBLIC_SCHEMA_DDL)

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
