-- GatePass PostgreSQL 18 schema
-- Run this first in pgAdmin 4.

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
