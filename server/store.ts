import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { AppStateSnapshot } from "../src/appState.js";
import { config } from "./config.js";

export interface AppStateStore {
  ensureReady(): Promise<void>;
  health(): Promise<{ now: string }>;
  load(): Promise<AppStateSnapshot | null>;
  save(state: AppStateSnapshot): Promise<void>;
  saveEventImage(uploadedBy: string, contentType: string, data: Buffer): Promise<string>;
  loadEventImage(id: string): Promise<{ contentType: string; data: Buffer } | null>;
}

export class MemoryAppStateStore implements AppStateStore {
  private state: AppStateSnapshot | null = null;
  private readonly eventImages = new Map<string, { contentType: string; data: Buffer }>();

  async ensureReady(): Promise<void> {}

  async health(): Promise<{ now: string }> {
    return { now: new Date().toISOString() };
  }

  async load(): Promise<AppStateSnapshot | null> {
    return this.state;
  }

  async save(state: AppStateSnapshot): Promise<void> {
    this.state = state;
  }

  async saveEventImage(_uploadedBy: string, contentType: string, data: Buffer): Promise<string> {
    const id = randomUUID();
    this.eventImages.set(id, { contentType, data });
    return id;
  }

  async loadEventImage(id: string): Promise<{ contentType: string; data: Buffer } | null> {
    return this.eventImages.get(id) ?? null;
  }
}

const { Pool } = pg;
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(serverDir, "../db/postgres18_schema.sql");

function stableUuid(scope: string, value: string): string {
  const digest = createHash("sha1").update(`${scope}:${value}`).digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function toDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function toUserRole(value: string): string {
  return value.toLowerCase().replaceAll(" ", "_");
}

function toInviteCategory(value: string): string {
  return value.toLowerCase().replaceAll("-", "_");
}

function toLower(value: string): string {
  return value.toLowerCase();
}

// attendee_email / attendee_name / attendee_phone are deliberately absent from
// DO UPDATE: they are owned by the transfer engine (backend/transfer_routes.py).
// The client state blob may carry a stale owner and must never win — otherwise
// every accepted transfer reverts on the next browser autosave.
export const TICKET_UPSERT_SQL = `INSERT INTO tickets (
  id, event_id, order_id, category_id, category_name, price, attendee_name, attendee_phone, attendee_email,
  qr_token, status, issued_at, checked_in_at, gate_scanned, scanned_by
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::ticket_status, $12, $13, $14, $15)
ON CONFLICT (id) DO UPDATE SET
  event_id = EXCLUDED.event_id,
  order_id = EXCLUDED.order_id,
  category_id = EXCLUDED.category_id,
  category_name = EXCLUDED.category_name,
  price = EXCLUDED.price,
  qr_token = EXCLUDED.qr_token,
  status = EXCLUDED.status,
  issued_at = EXCLUDED.issued_at,
  checked_in_at = EXCLUDED.checked_in_at,
  gate_scanned = EXCLUDED.gate_scanned,
  scanned_by = EXCLUDED.scanned_by,
  updated_at = now()`;

export class PostgresAppStateStore implements AppStateStore {
  private readonly pool: pg.Pool;

  constructor() {
    if (!config.DATABASE_URL && config.PGPASSWORD.length === 0) {
      throw new Error("PostgreSQL password is required. Set PGPASSWORD in .env or provide DATABASE_URL.");
    }

    const ssl = config.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined;

    this.pool = config.DATABASE_URL
      ? new Pool({
          connectionString: config.DATABASE_URL,
          ssl,
        })
      : new Pool({
          host: config.PGHOST,
          port: config.PGPORT,
          database: config.PGDATABASE,
          user: config.PGUSER,
          password: String(config.PGPASSWORD),
          ssl,
        });
  }

  async ensureReady(): Promise<void> {
    const schema = await readFile(schemaPath, "utf8");
    await this.pool.query(schema);
  }

  async health(): Promise<{ now: string }> {
    const result = await this.pool.query<{ now: string }>("SELECT NOW()::text AS now");
    return { now: result.rows[0]?.now ?? new Date().toISOString() };
  }

  async load(): Promise<AppStateSnapshot | null> {
    const result = await this.pool.query<{ payload: AppStateSnapshot }>(
      "SELECT payload FROM app_state WHERE state_key = $1",
      ["default"],
    );
    return result.rows[0]?.payload ?? null;
  }

  async save(state: AppStateSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO app_state (state_key, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (state_key)
         DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        ["default", JSON.stringify(state)],
      );
      await this.syncReportingTables(client, state);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveEventImage(uploadedBy: string, contentType: string, data: Buffer): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO event_images (uploaded_by, content_type, image_data, byte_size)
       VALUES ($1, $2, $3, $4)
       RETURNING id::text`,
      [uploadedBy, contentType, data, data.length],
    );
    return result.rows[0].id;
  }

  async loadEventImage(id: string): Promise<{ contentType: string; data: Buffer } | null> {
    const result = await this.pool.query<{ content_type: string; image_data: Buffer }>(
      `SELECT content_type, image_data
       FROM event_images
       WHERE id = $1::uuid`,
      [id],
    );
    const image = result.rows[0];
    return image ? { contentType: image.content_type, data: image.image_data } : null;
  }

  private async syncReportingTables(client: pg.PoolClient, state: AppStateSnapshot): Promise<void> {
    const organizationId = stableUuid("organizations", "gatepass");
    const userId = stableUuid("users", state.user.id);
    const eventIds = new Map<string, string>();
    const categoryIds = new Map<string, string>();
    const orderIds = new Map<string, string>();
    const ticketIds = new Map<string, string>();

    // No bulk delete here, deliberately: this state blob is shared by every
    // signed-in user, so wiping rows destroys data created by other people.
    // Every statement below upserts, and nothing is ever removed.

    await client.query(
      `INSERT INTO organizations (id, name, org_type, contact_email, contact_phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         org_type = EXCLUDED.org_type,
         contact_email = EXCLUDED.contact_email,
         contact_phone = EXCLUDED.contact_phone,
         updated_at = now()`,
      [organizationId, "GatePass", "Event Operations", state.user.email, state.user.phone],
    );

    await client.query(
      `INSERT INTO users (
        id, organization_id, name, email, phone, role, avatar_url, student_id, current_zone, clearance_level
      ) VALUES ($1, $2, $3, $4, $5, $6::user_role, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        avatar_url = EXCLUDED.avatar_url,
        student_id = EXCLUDED.student_id,
        current_zone = EXCLUDED.current_zone,
        clearance_level = EXCLUDED.clearance_level,
        updated_at = now()`,
      [
        userId,
        organizationId,
        state.user.name,
        state.user.email,
        state.user.phone,
        toUserRole(state.user.role),
        state.user.avatarUrl,
        state.user.studentId ?? null,
        state.user.currentZone ?? null,
        state.user.clearanceLevel ?? null,
      ],
    );

    for (const request of state.requests) {
      await client.query(
        `INSERT INTO access_requests (
          id, requester_name, requester_avatar_url, zone_name, duration_hours, purpose, status, request_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::access_request_status, $8)
        ON CONFLICT (id) DO UPDATE SET
          requester_name = EXCLUDED.requester_name,
          requester_avatar_url = EXCLUDED.requester_avatar_url,
          zone_name = EXCLUDED.zone_name,
          duration_hours = EXCLUDED.duration_hours,
          purpose = EXCLUDED.purpose,
          status = EXCLUDED.status,
          request_time = EXCLUDED.request_time,
          updated_at = now()`,
        [
          stableUuid("access_requests", request.id),
          request.requesterName,
          request.requesterAvatarUrl ?? null,
          request.zoneName,
          request.durationHours,
          request.purpose,
          request.status,
          toDate(request.requestTime),
        ],
      );
    }

    for (const invite of state.invitePasses) {
      await client.query(
        `INSERT INTO invite_passes (
          id, organization_id, title, category, sub_category, pass_id_code, status, validity_text, usage_text,
          usage_type, entries_total, entries_used, qr_token
        ) VALUES ($1, $2, $3, $4::invite_category, $5, $6, $7::invite_status, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          sub_category = EXCLUDED.sub_category,
          pass_id_code = EXCLUDED.pass_id_code,
          status = EXCLUDED.status,
          validity_text = EXCLUDED.validity_text,
          usage_text = EXCLUDED.usage_text,
          usage_type = EXCLUDED.usage_type,
          entries_total = EXCLUDED.entries_total,
          entries_used = EXCLUDED.entries_used,
          qr_token = EXCLUDED.qr_token,
          updated_at = now()`,
        [
          stableUuid("invite_passes", invite.id),
          organizationId,
          invite.title,
          toInviteCategory(invite.category),
          invite.subCategory,
          invite.passIdCode,
          toLower(invite.status),
          invite.validityText,
          invite.usageText,
          invite.usageType,
          invite.entriesTotal ?? null,
          invite.entriesUsed ?? 0,
          invite.qrToken,
        ],
      );
    }

    for (const event of state.events) {
      const eventDbId = stableUuid("events", event.id);
      eventIds.set(event.id, eventDbId);
      await client.query(
        `INSERT INTO events (
          id, organization_id, title, description, event_type, venue, start_time, end_time, banner_url, capacity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          event_type = EXCLUDED.event_type,
          venue = EXCLUDED.venue,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          banner_url = EXCLUDED.banner_url,
          capacity = EXCLUDED.capacity,
          updated_at = now()`,
        [
          eventDbId,
          organizationId,
          event.title,
          event.description,
          event.eventType,
          event.venue,
          toDate(event.startTime),
          toDate(event.endTime),
          event.bannerUrl,
          event.capacity,
        ],
      );
      try {
        await client.query(
          `INSERT INTO scanner.events (
            id, organization_name, name, starts_at, ends_at, venue, status, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'active', now())
          ON CONFLICT (id) DO UPDATE SET
            organization_name = EXCLUDED.organization_name,
            name = EXCLUDED.name,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            venue = EXCLUDED.venue,
            status = EXCLUDED.status,
            updated_at = now()`,
          [
            eventDbId,
            "GatePass",
            event.title,
            toDate(event.startTime),
            toDate(event.endTime),
            event.venue,
          ],
        );
      } catch (scannerErr) {
        console.warn("Non-fatal: scanner.events table sync skipped:", scannerErr);
      }

      for (const category of event.ticketCategories) {
        const categoryDbId = stableUuid("ticket_categories", category.id);
        categoryIds.set(category.id, categoryDbId);
        await client.query(
          `INSERT INTO ticket_categories (
            id, event_id, name, description, price, capacity, sold_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            capacity = EXCLUDED.capacity,
            sold_count = EXCLUDED.sold_count,
            updated_at = now()`,
          [
            categoryDbId,
            eventDbId,
            category.name,
            category.description,
            category.price,
            category.capacity,
            category.soldCount,
          ],
        );
      }
    }

    for (const order of state.orders) {
      const orderDbId = stableUuid("orders", order.id);
      orderIds.set(order.id, orderDbId);
      await client.query(
        `INSERT INTO orders (
          id, event_id, buyer_name, buyer_email, buyer_phone, payment_status, gross_amount, platform_fee,
          gateway_fee, net_amount, payment_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::payment_status, $7, $8, $9, $10, $11::payment_method, $12)
        ON CONFLICT (id) DO UPDATE SET
          event_id = EXCLUDED.event_id,
          buyer_name = EXCLUDED.buyer_name,
          buyer_email = EXCLUDED.buyer_email,
          buyer_phone = EXCLUDED.buyer_phone,
          payment_status = EXCLUDED.payment_status,
          gross_amount = EXCLUDED.gross_amount,
          platform_fee = EXCLUDED.platform_fee,
          gateway_fee = EXCLUDED.gateway_fee,
          net_amount = EXCLUDED.net_amount,
          payment_method = EXCLUDED.payment_method,
          updated_at = now()`,
        [
          orderDbId,
          eventIds.get(order.eventId),
          order.buyerName,
          order.buyerEmail,
          order.buyerPhone,
          order.paymentStatus,
          order.grossAmount,
          order.platformFee,
          order.gatewayFee,
          order.netAmount,
          order.paymentMethod,
          toDate(order.created_at),
        ],
      );
    }

    for (const ticket of state.tickets) {
      const ticketDbId = stableUuid("tickets", ticket.id);
      ticketIds.set(ticket.id, ticketDbId);
      const event = state.events.find((item) => item.id === ticket.eventId);
      const category = event?.ticketCategories.find((item) => item.name === ticket.categoryName);
      await client.query(
        TICKET_UPSERT_SQL,
        [
          ticketDbId,
          eventIds.get(ticket.eventId),
          orderIds.get(ticket.orderId),
          category ? categoryIds.get(category.id) ?? null : null,
          ticket.categoryName,
          ticket.price,
          ticket.attendeeName,
          ticket.attendeePhone,
          ticket.attendeeEmail,
          ticket.qrToken,
          ticket.status,
          toDate(ticket.issuedAt),
          ticket.checkedInAt ? toDate(ticket.checkedInAt) : null,
          ticket.gateScanned ?? null,
          ticket.scannedBy ?? null,
        ],
      );
    }

    for (const log of state.scanLogs) {
      await client.query(
        `INSERT INTO scan_logs (
          id, ticket_id, event_id, event_name, attendee_name, category_name, scan_result, scan_time, gate_name, scanned_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::scan_result, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          ticket_id = EXCLUDED.ticket_id,
          event_id = EXCLUDED.event_id,
          event_name = EXCLUDED.event_name,
          attendee_name = EXCLUDED.attendee_name,
          category_name = EXCLUDED.category_name,
          scan_result = EXCLUDED.scan_result,
          scan_time = EXCLUDED.scan_time,
          gate_name = EXCLUDED.gate_name,
          scanned_by = EXCLUDED.scanned_by`,
        [
          stableUuid("scan_logs", log.id),
          ticketIds.get(log.ticketId),
          eventIds.get(log.eventId),
          log.eventName,
          log.attendeeName,
          log.categoryName,
          toLower(log.scanResult),
          toDate(log.scanTime),
          log.gateName,
          log.scannedBy,
        ],
      );
    }

    for (const settlement of state.settlements) {
      await client.query(
        `INSERT INTO settlements (
          id, event_id, event_name, gross_sales, total_refunds, platform_fees, gateway_fees, manual_collections,
          net_settlement, status, settled_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::settlement_status, $11)
        ON CONFLICT (id) DO UPDATE SET
          event_id = EXCLUDED.event_id,
          event_name = EXCLUDED.event_name,
          gross_sales = EXCLUDED.gross_sales,
          total_refunds = EXCLUDED.total_refunds,
          platform_fees = EXCLUDED.platform_fees,
          gateway_fees = EXCLUDED.gateway_fees,
          manual_collections = EXCLUDED.manual_collections,
          net_settlement = EXCLUDED.net_settlement,
          status = EXCLUDED.status,
          settled_at = EXCLUDED.settled_at,
          updated_at = now()`,
        [
          stableUuid("settlements", settlement.id),
          eventIds.get(settlement.eventId),
          settlement.eventName,
          settlement.grossSales,
          settlement.totalRefunds,
          settlement.platformFees,
          settlement.gatewayFees,
          settlement.manualCollections,
          settlement.netSettlement,
          settlement.status,
          settlement.settledAt ? toDate(settlement.settledAt) : null,
        ],
      );
    }

    for (const audit of state.auditLogs) {
      await client.query(
        `INSERT INTO audit_logs (id, timestamp, actor, action, details)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           timestamp = EXCLUDED.timestamp,
           actor = EXCLUDED.actor,
           action = EXCLUDED.action,
           details = EXCLUDED.details`,
        [stableUuid("audit_logs", audit.id), toDate(audit.timestamp), audit.actor, audit.action, audit.details],
      );
    }
  }
}
