-- GatePass pgAdmin 4 query pack
-- Run after db/postgres18_schema.sql.

-- 1) Organizations
SELECT *
FROM organizations
ORDER BY created_at DESC;

-- 2) Users by role
SELECT id, name, email, phone, role, student_id, current_zone, clearance_level
FROM users
ORDER BY name;

-- 3) Events with ticket sales summary
SELECT *
FROM v_event_sales_summary
ORDER BY start_time DESC;

-- 4) Ticket categories for one event
SELECT
  e.title AS event_name,
  tc.name,
  tc.description,
  tc.price,
  tc.capacity,
  tc.sold_count,
  (tc.capacity - tc.sold_count) AS remaining
FROM ticket_categories tc
JOIN events e ON e.id = tc.event_id
ORDER BY e.start_time DESC, tc.name;

-- 5) Orders and revenue
SELECT
  o.created_at,
  e.title AS event_name,
  o.buyer_name,
  o.payment_status,
  o.payment_method,
  o.gross_amount,
  o.platform_fee,
  o.gateway_fee,
  o.net_amount
FROM orders o
JOIN events e ON e.id = o.event_id
ORDER BY o.created_at DESC;

-- 6) Tickets by status
SELECT
  t.status,
  COUNT(*) AS ticket_count,
  SUM(t.price) AS total_value
FROM tickets t
GROUP BY t.status
ORDER BY t.status;

-- 7) Pending access requests
SELECT *
FROM v_pending_access_requests;

-- 8) Active invite passes
SELECT *
FROM v_active_invite_passes;

-- 9) Recent scan logs
SELECT *
FROM v_recent_scan_activity;

-- 10) Settlement status
SELECT
  s.event_name,
  s.status,
  s.gross_sales,
  s.total_refunds,
  s.platform_fees,
  s.gateway_fees,
  s.manual_collections,
  s.net_settlement,
  s.settled_at
FROM settlements s
ORDER BY s.updated_at DESC, s.created_at DESC;

-- 11) Audit trail
SELECT *
FROM audit_logs
ORDER BY timestamp DESC;

-- 12) Useful dashboard rollup
SELECT
  COUNT(DISTINCT e.id) AS total_events,
  COUNT(DISTINCT o.id) AS total_orders,
  COUNT(DISTINCT t.id) AS total_tickets,
  COUNT(*) FILTER (WHERE t.status = 'checked_in') AS checked_in_tickets,
  COUNT(*) FILTER (WHERE t.status = 'issued') AS issued_tickets,
  COUNT(*) FILTER (WHERE t.status = 'refunded') AS refunded_tickets,
  COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.gross_amount ELSE 0 END), 0) AS gross_sales
FROM events e
LEFT JOIN orders o ON o.event_id = e.id
LEFT JOIN tickets t ON t.event_id = e.id;

-- 13) Latest app snapshot written by the backend
SELECT state_key, jsonb_pretty(payload) AS payload, updated_at
FROM v_latest_app_state;
