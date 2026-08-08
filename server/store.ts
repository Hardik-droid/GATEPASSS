import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState.js";
import {
  TicketStatus,
  UserRole,
  type AccessRequest,
  type AuditLog,
  type Order,
  type ScanLog,
  type Settlement,
  type Ticket,
  type UserProfile,
} from "../src/types.js";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import type { RazorpayGateway } from "./razorpay.js";
import type { CheckoutInput, ManualTicketInput } from "./validation.js";

export type PrepareCheckoutInput = Extract<CheckoutInput, { action: "prepare" }>;
export type ConfirmCheckoutInput = Extract<CheckoutInput, { action: "confirm" }>;

export interface TicketIdentity {
  subject: string;
  issuer: string;
  email: string;
  name?: string;
}

export interface StateIdentity extends TicketIdentity {
  canManageState: boolean;
}

export interface IssuedTicketsResult {
  status: "issued";
  order: Order;
  tickets: Ticket[];
}

export interface PaymentRequiredResult {
  status: "payment_required";
  operationId: string;
  checkout: {
    key: string;
    orderId: string;
    amount: number;
    currency: "INR";
    name: string;
    description: string;
  };
}

export type CheckoutResult = IssuedTicketsResult | PaymentRequiredResult;

export interface AppStateStore {
  ensureReady(): Promise<void>;
  health(): Promise<{ now: string }>;
  load(): Promise<AppStateSnapshot | null>;
  save(state: AppStateSnapshot): Promise<void>;
  loadState(identity: StateIdentity): Promise<AppStateSnapshot>;
  mergeState(identity: StateIdentity, state: AppStateSnapshot): Promise<void>;
  prepareCheckout(
    identity: TicketIdentity,
    input: PrepareCheckoutInput,
    gateway: RazorpayGateway,
  ): Promise<CheckoutResult>;
  confirmCheckout(
    identity: TicketIdentity,
    input: ConfirmCheckoutInput,
    gateway: RazorpayGateway,
  ): Promise<IssuedTicketsResult>;
  issueManualTickets(
    identity: TicketIdentity,
    input: ManualTicketInput,
  ): Promise<IssuedTicketsResult>;
  saveEventImage(uploadedBy: string, contentType: string, data: Buffer): Promise<string>;
  loadEventImage(id: string): Promise<{ contentType: string; data: Buffer } | null>;
}

const PROFILE_KEY_PREFIX = "profile:";
const RESERVATION_MINUTES = 15;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function profileKey(subject: string): string {
  return `${PROFILE_KEY_PREFIX}${hash(subject)}`;
}

function requestPrefix(subject: string): string {
  return `req_${hash(subject).slice(0, 20)}_`;
}

function safeRequestId(subject: string, clientId: string): string {
  return `${requestPrefix(subject)}${hash(clientId).slice(0, 20)}`;
}

function stateProfile(identity: StateIdentity, stored?: UserProfile): UserProfile {
  const profile = stored ?? createInitialAppState().user;
  return {
    ...profile,
    id: identity.subject,
    name: identity.name?.trim() || profile.name,
    email: identity.email,
    role: identity.canManageState ? UserRole.OWNER : UserRole.ATTENDEE,
  };
}

function attendeeState(
  state: AppStateSnapshot,
  identity: StateIdentity,
  storedProfile?: UserProfile,
): AppStateSnapshot {
  const email = identity.email.toLowerCase();
  return {
    ...structuredClone(state),
    user: stateProfile(identity, storedProfile),
    requests: state.requests.filter(({ id }) => id.startsWith(requestPrefix(identity.subject))),
    invitePasses: [],
    orders: state.orders.filter((order) => order.buyerEmail.toLowerCase() === email),
    tickets: state.tickets.filter((ticket) => ticket.attendeeEmail.toLowerCase() === email),
    scanLogs: [],
    settlements: [],
    auditLogs: [],
  };
}

function mergeAttendeeState(
  current: AppStateSnapshot,
  incoming: AppStateSnapshot,
  identity: StateIdentity,
): { state: AppStateSnapshot; profile: UserProfile } {
  const profile = stateProfile(identity, incoming.user);
  const known = new Set(current.requests.map(({ id }) => id));
  const newRequests: AccessRequest[] = [];
  for (const request of incoming.requests) {
    if (request.status !== "pending") continue;
    const id = safeRequestId(identity.subject, request.id);
    if (known.has(id)) continue;
    known.add(id);
    newRequests.push({
      ...request,
      id,
      requesterName: profile.name,
      requesterAvatarUrl: profile.avatarUrl,
      status: "pending",
    });
  }
  return {
    state: {
      ...current,
      requests: [...newRequests, ...current.requests].slice(0, 1000),
    },
    profile,
  };
}

function mergeOrganizerState(
  current: AppStateSnapshot,
  incoming: AppStateSnapshot,
  identity: StateIdentity,
): AppStateSnapshot {
  const currentEvents = new Map(current.events.map((event) => [event.id, event]));
  const events = incoming.events.map((event) => {
    const saved = currentEvents.get(event.id);
    if (!saved) return event;
    const savedCategories = new Map(saved.ticketCategories.map((category) => [category.id, category]));
    return {
      ...event,
      ticketCategories: [
        ...event.ticketCategories.map((category) => ({
          ...category,
          soldCount: Math.max(category.soldCount, savedCategories.get(category.id)?.soldCount ?? 0),
        })),
        ...saved.ticketCategories.filter((category) => !event.ticketCategories.some(({ id }) => id === category.id)),
      ],
    };
  });
  events.push(...current.events.filter((event) => !currentEvents.has(event.id) || !events.some(({ id }) => id === event.id)));

  const incomingTickets = new Map(incoming.tickets.map((ticket) => [ticket.id, ticket]));
  const tickets = current.tickets.map((ticket) => {
    const candidate = incomingTickets.get(ticket.id);
    return candidate && [TicketStatus.CANCELLED, TicketStatus.REFUNDED].includes(candidate.status)
      ? { ...ticket, status: candidate.status }
      : ticket;
  });
  const currentSettlements = new Map(current.settlements.map((settlement) => [settlement.eventId, settlement]));
  const settlements = incoming.settlements.map((settlement) => {
    const saved = currentSettlements.get(settlement.eventId);
    return saved ? {
      ...settlement,
      grossSales: Math.max(settlement.grossSales, saved.grossSales),
      totalRefunds: Math.max(settlement.totalRefunds, saved.totalRefunds),
      platformFees: Math.max(settlement.platformFees, saved.platformFees),
      gatewayFees: Math.max(settlement.gatewayFees, saved.gatewayFees),
      manualCollections: Math.max(settlement.manualCollections, saved.manualCollections),
      netSettlement: Math.max(settlement.netSettlement, saved.netSettlement),
    } : settlement;
  });
  settlements.push(...current.settlements.filter((saved) => !settlements.some(({ eventId }) => eventId === saved.eventId)));
  const auditLogs = [
    ...incoming.auditLogs,
    ...current.auditLogs.filter((saved) => !incoming.auditLogs.some(({ id }) => id === saved.id)),
  ].slice(0, 50_000);
  return {
    ...structuredClone(incoming),
    user: stateProfile(identity, incoming.user),
    events,
    orders: structuredClone(current.orders),
    tickets,
    scanLogs: structuredClone(current.scanLogs),
    settlements,
    auditLogs,
  };
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Product {
  appEventId: string;
  appCategoryId: string;
  eventDbId?: string;
  categoryDbId?: string;
  eventName: string;
  categoryName: string;
  unitPrice: number;
  categoryCapacity: number;
  categorySold: number;
  eventCapacity: number;
  eventSold: number;
}

interface PriceBreakdown {
  grossAmount: number;
  platformFee: number;
  gatewayFee: number;
  netAmount: number;
  razorpayAmount: number;
}

function priceBreakdown(unitPrice: number, quantity: number, method: "online" | "cash" | "free"): PriceBreakdown {
  const grossAmount = money(unitPrice * quantity);
  if (grossAmount === 0) {
    return { grossAmount: 0, platformFee: 0, gatewayFee: 0, netAmount: 0, razorpayAmount: 0 };
  }
  const gatewayFee = method === "online" ? money(grossAmount * 0.02) : 0;
  const platformFee = money(Math.min(5 * quantity, Math.max(0, grossAmount - gatewayFee)));
  return {
    grossAmount,
    platformFee,
    gatewayFee,
    netAmount: money(Math.max(0, grossAmount - platformFee - gatewayFee)),
    razorpayAmount: Math.round((grossAmount + platformFee) * 100),
  };
}

function requestHash(input: unknown): string {
  return hash(JSON.stringify(input));
}

function assertCapacity(product: Product, quantity: number, reservedCategory = 0, reservedEvent = 0): void {
  if (product.categorySold + reservedCategory + quantity > product.categoryCapacity) {
    throw new HttpError(409, "This ticket category does not have enough remaining capacity.");
  }
  if (product.eventSold + reservedEvent + quantity > product.eventCapacity) {
    throw new HttpError(409, "This event does not have enough remaining capacity.");
  }
}

interface IssueSpec {
  product: Product;
  quantity: number;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone: string;
  actor: string;
  paymentMethod: "online" | "cash" | "free";
  amounts: PriceBreakdown;
}

function issueIntoState(state: AppStateSnapshot, spec: IssueSpec): {
  state: AppStateSnapshot;
  result: IssuedTicketsResult;
  settlement: Settlement;
  audit: AuditLog;
} {
  const now = new Date().toISOString();
  const order: Order = {
    id: randomUUID(),
    eventId: spec.product.appEventId,
    buyerName: spec.attendeeName,
    buyerEmail: spec.attendeeEmail,
    buyerPhone: spec.attendeePhone,
    paymentStatus: "paid",
    grossAmount: spec.amounts.grossAmount,
    platformFee: spec.amounts.platformFee,
    gatewayFee: spec.amounts.gatewayFee,
    netAmount: spec.amounts.netAmount,
    paymentMethod: spec.paymentMethod,
    created_at: now,
  };
  const tickets: Ticket[] = Array.from({ length: spec.quantity }, () => ({
    id: randomUUID(),
    eventId: spec.product.appEventId,
    orderId: order.id,
    categoryName: spec.product.categoryName,
    price: spec.product.unitPrice,
    attendeeName: spec.attendeeName,
    attendeePhone: spec.attendeePhone,
    attendeeEmail: spec.attendeeEmail,
    qrToken: `gptok_${randomBytes(32).toString("base64url")}`,
    status: TicketStatus.ISSUED,
    issuedAt: now,
  }));
  const priorSettlement = state.settlements.find(({ eventId }) => eventId === spec.product.appEventId);
  const settlement: Settlement = {
    id: priorSettlement?.id ?? `set_${spec.product.appEventId}`,
    eventId: spec.product.appEventId,
    eventName: spec.product.eventName,
    grossSales: money((priorSettlement?.grossSales ?? 0) + spec.amounts.grossAmount),
    totalRefunds: priorSettlement?.totalRefunds ?? 0,
    platformFees: money((priorSettlement?.platformFees ?? 0) + spec.amounts.platformFee),
    gatewayFees: money((priorSettlement?.gatewayFees ?? 0) + spec.amounts.gatewayFee),
    manualCollections: money(
      (priorSettlement?.manualCollections ?? 0)
      + (spec.paymentMethod === "cash" ? spec.amounts.grossAmount : 0),
    ),
    netSettlement: money((priorSettlement?.netSettlement ?? 0) + spec.amounts.netAmount),
    status: priorSettlement?.status ?? "pending",
    ...(priorSettlement?.settledAt ? { settledAt: priorSettlement.settledAt } : {}),
  };
  const audit: AuditLog = {
    id: randomUUID(),
    timestamp: now,
    actor: spec.actor,
    action: spec.paymentMethod === "cash" ? "Manual Pass Issued" : "Ticket Purchased",
    details: `${spec.quantity} [${spec.product.categoryName}] ticket${spec.quantity === 1 ? "" : "s"} issued for '${spec.product.eventName}'. Order ID: ${order.id}.`,
  };
  const nextState = structuredClone(state);
  nextState.orders = [order, ...nextState.orders];
  nextState.tickets = [...tickets, ...nextState.tickets];
  nextState.events = nextState.events.map((event) => event.id === spec.product.appEventId
    ? {
        ...event,
        ticketCategories: event.ticketCategories.map((category) => category.id === spec.product.appCategoryId
          ? { ...category, soldCount: spec.product.categorySold + spec.quantity }
          : category),
      }
    : event);
  nextState.settlements = [settlement, ...nextState.settlements.filter(({ eventId }) => eventId !== settlement.eventId)];
  nextState.auditLogs = [audit, ...nextState.auditLogs];
  return { state: nextState, result: { status: "issued", order, tickets }, settlement, audit };
}

function productFromState(state: AppStateSnapshot, eventId: string, categoryId: string): Product {
  const event = state.events.find(({ id }) => id === eventId);
  const category = event?.ticketCategories.find(({ id }) => id === categoryId);
  if (!event || !category) throw new HttpError(404, "Event or ticket category not found.");
  return {
    appEventId: event.id,
    appCategoryId: category.id,
    eventName: event.title,
    categoryName: category.name,
    unitPrice: category.price,
    categoryCapacity: category.capacity,
    categorySold: category.soldCount,
    eventCapacity: event.capacity,
    eventSold: event.ticketCategories.reduce((sum, item) => sum + item.soldCount, 0),
  };
}

interface MemoryOperation {
  id: string;
  actorSubject: string;
  kind: "checkout" | "manual";
  idempotencyKey: string;
  requestHash: string;
  product: Product;
  quantity: number;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone: string;
  amounts: PriceBreakdown;
  razorpayOrderId?: string;
  expiresAt?: number;
  result?: IssuedTicketsResult;
}

export class MemoryAppStateStore implements AppStateStore {
  private state: AppStateSnapshot | null = null;
  private readonly eventImages = new Map<string, { contentType: string; data: Buffer }>();
  private readonly profiles = new Map<string, UserProfile>();
  private readonly scannerUsers = new Map<string, string>();
  private readonly operations = new Map<string, MemoryOperation>();
  private readonly operationsById = new Map<string, MemoryOperation>();

  async ensureReady(): Promise<void> { }

  async health(): Promise<{ now: string }> {
    return { now: new Date().toISOString() };
  }

  async load(): Promise<AppStateSnapshot | null> {
    return this.state ? structuredClone(this.state) : null;
  }

  async save(state: AppStateSnapshot): Promise<void> {
    this.state = structuredClone(state);
  }

  async loadState(identity: StateIdentity): Promise<AppStateSnapshot> {
    const current = this.state ?? createInitialAppState();
    if (identity.canManageState) {
      return { ...structuredClone(current), user: stateProfile(identity, this.profiles.get(identity.subject)) };
    }
    return attendeeState(current, identity, this.profiles.get(identity.subject));
  }

  async mergeState(identity: StateIdentity, state: AppStateSnapshot): Promise<void> {
    if (identity.canManageState) {
      const profile = stateProfile(identity, state.user);
      this.profiles.set(identity.subject, profile);
      this.state = mergeOrganizerState(this.state ?? createInitialAppState(), state, identity);
      return;
    }
    const merged = mergeAttendeeState(this.state ?? createInitialAppState(), state, identity);
    this.profiles.set(identity.subject, merged.profile);
    this.state = merged.state;
  }

  addScannerUser(email: string, name = "GatePass Member"): void {
    this.scannerUsers.set(email.trim().toLowerCase(), name);
  }

  async prepareCheckout(
    identity: TicketIdentity,
    input: PrepareCheckoutInput,
    gateway: RazorpayGateway,
  ): Promise<CheckoutResult> {
    this.addScannerUser(identity.email, identity.name);
    const key = `${identity.subject}:checkout:${input.idempotencyKey}`;
    const digest = requestHash(input);
    const prior = this.operations.get(key);
    if (prior) {
      if (prior.requestHash !== digest) throw new HttpError(409, "Idempotency key was already used for another checkout.");
      if (prior.result) return structuredClone(prior.result);
      if (!prior.razorpayOrderId) {
        const order = await gateway.createOrder({
          amount: prior.amounts.razorpayAmount,
          receipt: `gp_${prior.id.replaceAll("-", "")}`,
          notes: { event_id: prior.product.appEventId, category_id: prior.product.appCategoryId },
        });
        prior.razorpayOrderId = order.id;
      }
      return this.paymentResponse(prior, gateway.keyId);
    }
    const current = this.state ?? createInitialAppState();
    const product = productFromState(current, input.eventId, input.categoryId);
    const active = [...this.operations.values()].filter((operation) =>
      !operation.result
      && (operation.expiresAt ?? 0) > Date.now());
    const reservedCategory = active
      .filter((operation) => operation.product.appCategoryId === product.appCategoryId)
      .reduce((sum, operation) => sum + operation.quantity, 0);
    const reservedEvent = active
      .filter((operation) => operation.product.appEventId === product.appEventId)
      .reduce((sum, operation) => sum + operation.quantity, 0);
    assertCapacity(product, input.quantity, reservedCategory, reservedEvent);
    const paymentMethod = product.unitPrice === 0 ? "free" : "online";
    const operation: MemoryOperation = {
      id: randomUUID(),
      actorSubject: identity.subject,
      kind: "checkout",
      idempotencyKey: input.idempotencyKey,
      requestHash: digest,
      product,
      quantity: input.quantity,
      attendeeEmail: identity.email,
      attendeeName: identity.name?.trim() || this.scannerUsers.get(identity.email) || identity.email,
      attendeePhone: input.phone,
      amounts: priceBreakdown(product.unitPrice, input.quantity, paymentMethod),
    };
    if (paymentMethod === "online") {
      operation.expiresAt = Date.now() + RESERVATION_MINUTES * 60_000;
    }
    this.operations.set(key, operation);
    this.operationsById.set(operation.id, operation);
    if (paymentMethod === "free") {
      const issued = issueIntoState(current, {
        product,
        quantity: input.quantity,
        attendeeEmail: operation.attendeeEmail,
        attendeeName: operation.attendeeName,
        attendeePhone: operation.attendeePhone,
        actor: operation.attendeeName,
        paymentMethod,
        amounts: operation.amounts,
      });
      this.state = issued.state;
      operation.result = issued.result;
    } else {
      const order = await gateway.createOrder({
        amount: operation.amounts.razorpayAmount,
        receipt: `gp_${operation.id.replaceAll("-", "")}`,
        notes: { event_id: product.appEventId, category_id: product.appCategoryId },
      });
      operation.razorpayOrderId = order.id;
    }
    return operation.result ?? this.paymentResponse(operation, gateway.keyId);
  }

  async confirmCheckout(
    identity: TicketIdentity,
    input: ConfirmCheckoutInput,
    gateway: RazorpayGateway,
  ): Promise<IssuedTicketsResult> {
    const operation = this.operationsById.get(input.operationId);
    if (!operation || operation.actorSubject !== identity.subject || operation.kind !== "checkout") {
      throw new HttpError(404, "Checkout operation not found.");
    }
    if (operation.razorpayOrderId !== input.razorpayOrderId) {
      throw new HttpError(400, "Payment order does not match this checkout.");
    }
    if (!gateway.verifySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
      throw new HttpError(401, "Payment signature verification failed.");
    }
    if (operation.result) return structuredClone(operation.result);
    const issued = issueIntoState(this.state ?? createInitialAppState(), {
      product: operation.product,
      quantity: operation.quantity,
      attendeeEmail: operation.attendeeEmail,
      attendeeName: operation.attendeeName,
      attendeePhone: operation.attendeePhone,
      actor: operation.attendeeName,
      paymentMethod: "online",
      amounts: operation.amounts,
    });
    this.state = issued.state;
    operation.result = issued.result;
    return structuredClone(issued.result);
  }

  async issueManualTickets(identity: TicketIdentity, input: ManualTicketInput): Promise<IssuedTicketsResult> {
    const key = `${identity.subject}:manual:${input.idempotencyKey}`;
    const digest = requestHash(input);
    const prior = this.operations.get(key);
    if (prior) {
      if (prior.requestHash !== digest) throw new HttpError(409, "Idempotency key was already used for another issuance.");
      if (!prior.result) throw new HttpError(409, "Manual issuance is still pending.");
      return structuredClone(prior.result);
    }
    const attendeeName = this.scannerUsers.get(input.attendeeEmail);
    if (!attendeeName) throw new HttpError(404, "The attendee must sign in to GatePass before a manual ticket can be issued.");
    const current = this.state ?? createInitialAppState();
    const product = productFromState(current, input.eventId, input.categoryId);
    assertCapacity(product, input.quantity);
    const amounts = priceBreakdown(product.unitPrice, input.quantity, product.unitPrice === 0 ? "free" : "cash");
    const issued = issueIntoState(current, {
      product,
      quantity: input.quantity,
      attendeeEmail: input.attendeeEmail,
      attendeeName,
      attendeePhone: input.attendeePhone,
      actor: identity.name || identity.email,
      paymentMethod: product.unitPrice === 0 ? "free" : "cash",
      amounts,
    });
    this.state = issued.state;
    const operation: MemoryOperation = {
      id: randomUUID(),
      actorSubject: identity.subject,
      kind: "manual",
      idempotencyKey: input.idempotencyKey,
      requestHash: digest,
      product,
      quantity: input.quantity,
      attendeeEmail: input.attendeeEmail,
      attendeeName,
      attendeePhone: input.attendeePhone,
      amounts,
      result: issued.result,
    };
    this.operations.set(key, operation);
    this.operationsById.set(operation.id, operation);
    return structuredClone(issued.result);
  }

  private paymentResponse(operation: MemoryOperation, keyId: string): PaymentRequiredResult {
    if (!operation.razorpayOrderId) throw new HttpError(409, "Payment order is not ready.");
    return {
      status: "payment_required",
      operationId: operation.id,
      checkout: {
        key: keyId,
        orderId: operation.razorpayOrderId,
        amount: operation.amounts.razorpayAmount,
        currency: "INR",
        name: "GatePass",
        description: `${operation.product.categoryName} — ${operation.product.eventName}`,
      },
    };
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
export const EXPECTED_ALEMBIC_HEAD = "0004_ticket_checkout";

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

function databaseId(scope: string, value: string): string {
  return UUID_PATTERN.test(value) ? value : stableUuid(scope, value);
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

export async function runTransaction<T>(
  pool: Pick<pg.Pool, "connect">,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

interface CheckoutOperationRow {
  id: string;
  actor_subject: string;
  request_hash: string;
  app_event_id: string;
  app_category_id: string;
  event_id: string;
  category_id: string;
  attendee_email: string;
  attendee_name: string;
  attendee_phone: string;
  quantity: number;
  unit_price: string;
  gross_amount: string;
  platform_fee: string;
  gateway_fee: string;
  net_amount: string;
  payment_method: "online" | "cash" | "free";
  status: "prepared" | "issued" | "expired";
  razorpay_order_id: string | null;
  razorpay_amount: number | null;
  result_payload: IssuedTicketsResult | null;
  expires_at: Date | null;
}

interface DbProductRow {
  event_id: string;
  event_name: string;
  event_capacity: number;
  category_id: string;
  category_name: string;
  unit_price: string;
  category_capacity: number;
  category_sold: number;
  event_sold: number;
}

interface NewOperation {
  id: string;
  actorSubject: string;
  actorEmail: string;
  kind: "checkout" | "manual";
  idempotencyKey: string;
  requestHash: string;
  product: Product;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone: string;
  quantity: number;
  amounts: PriceBreakdown;
  paymentMethod: "online" | "cash" | "free";
  razorpayOrderId?: string;
  razorpayAmount?: number;
  expiresAt?: Date;
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
  status = CASE
    WHEN EXCLUDED.status IN ('cancelled', 'refunded') THEN EXCLUDED.status
    WHEN tickets.status IN ('checked_in', 'cancelled', 'refunded', 'expired') THEN tickets.status
    ELSE EXCLUDED.status
  END,
  issued_at = EXCLUDED.issued_at,
  checked_in_at = COALESCE(tickets.checked_in_at, EXCLUDED.checked_in_at),
  gate_scanned = COALESCE(tickets.gate_scanned, EXCLUDED.gate_scanned),
  scanned_by = COALESCE(tickets.scanned_by, EXCLUDED.scanned_by),
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

    // Neon's pooler resets idle connections; without this listener that
    // error is unhandled and crashes the process (node-postgres gotcha).
    this.pool.on("error", (err) => {
      console.error("Unexpected pg pool error on idle client:", err);
    });
  }

  async ensureReady(): Promise<void> {
    await this.pool.query("SELECT 1");
    const result = await this.pool.query<{ version_num: string }>(
      "SELECT version_num FROM scanner.alembic_version",
    );
    const versions = result.rows.map(({ version_num }) => version_num);
    if (versions.length !== 1 || versions[0] !== EXPECTED_ALEMBIC_HEAD) {
      throw new Error(
        `Database migration mismatch: expected ${EXPECTED_ALEMBIC_HEAD}, found ${versions.join(", ") || "none"}. Run alembic upgrade head.`,
      );
    }
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
    await runTransaction(this.pool, async (client) => {
      await this.writeState(client, state);
      await this.syncReportingTables(client, state);
    });
  }

  async loadState(identity: StateIdentity): Promise<AppStateSnapshot> {
    const [state, profileResult] = await Promise.all([
      this.load(),
      this.pool.query<{ payload: { user?: UserProfile } }>(
        "SELECT payload FROM app_state WHERE state_key = $1",
        [profileKey(identity.subject)],
      ),
    ]);
    const current = await this.overlayAuthoritativeState(
      state ?? createInitialAppState(),
      identity.canManageState,
      this.pool,
    );
    const profile = profileResult.rows[0]?.payload?.user;
    if (identity.canManageState) {
      return { ...structuredClone(current), user: stateProfile(identity, profile) };
    }
    return attendeeState(current, identity, profile);
  }

  async mergeState(identity: StateIdentity, incoming: AppStateSnapshot): Promise<void> {
    await runTransaction(this.pool, async (client) => {
      const current = await this.overlayAuthoritativeState(
        await this.lockState(client),
        identity.canManageState,
        client,
      );
      if (identity.canManageState) {
        const next = mergeOrganizerState(current, incoming, identity);
        const profile = next.user;
        await this.writeState(client, next);
        await this.writeProfile(client, identity.subject, profile);
        await this.syncReportingTables(client, next);
        return;
      }
      const merged = mergeAttendeeState(current, incoming, identity);
      await this.writeState(client, merged.state);
      await this.writeProfile(client, identity.subject, merged.profile);
    });
  }

  async prepareCheckout(
    identity: TicketIdentity,
    input: PrepareCheckoutInput,
    gateway: RazorpayGateway,
  ): Promise<CheckoutResult> {
    const prepared = await runTransaction<CheckoutResult | {
      pending: true;
      operationId: string;
      amount: number;
      eventId: string;
      categoryId: string;
    }>(this.pool, async (client) => {
      const state = await this.lockState(client);
      await this.expireReservations(client);
      const digest = requestHash(input);
      const prior = await this.operationByIdempotency(
        client,
        identity.subject,
        "checkout",
        input.idempotencyKey,
      );
      if (prior) {
        if (prior.request_hash !== digest) {
          throw new HttpError(409, "Idempotency key was already used for another checkout.");
        }
        if (prior.result_payload) return prior.result_payload;
        if (prior.razorpay_order_id) return this.paymentResponse(prior, gateway.keyId);
        if (prior.status !== "prepared" || !prior.razorpay_amount) {
          throw new HttpError(409, "Checkout reservation expired.");
        }
        return {
          pending: true,
          operationId: prior.id,
          amount: prior.razorpay_amount,
          eventId: prior.app_event_id,
          categoryId: prior.app_category_id,
        };
      }

      const attendeeName = await this.ensureScannerUser(client, identity);
      const product = await this.lockProduct(client, state, input.eventId, input.categoryId);
      const reserved = await this.reservedCapacity(client, product);
      assertCapacity(product, input.quantity, reserved.category, reserved.event);
      const paymentMethod = product.unitPrice === 0 ? "free" : "online";
      const amounts = priceBreakdown(product.unitPrice, input.quantity, paymentMethod);
      const operation: NewOperation = {
        id: randomUUID(),
        actorSubject: identity.subject,
        actorEmail: identity.email,
        kind: "checkout",
        idempotencyKey: input.idempotencyKey,
        requestHash: digest,
        product,
        attendeeEmail: identity.email,
        attendeeName,
        attendeePhone: input.phone,
        quantity: input.quantity,
        amounts,
        paymentMethod,
      };

      if (paymentMethod === "online") {
        if (!gateway.keyId) throw new HttpError(503, "Online payments are not configured.");
        operation.razorpayAmount = amounts.razorpayAmount;
        operation.expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);
        await this.insertOperation(client, operation, "prepared");
        await this.insertReservation(client, operation, "active");
        return {
          pending: true,
          operationId: operation.id,
          amount: amounts.razorpayAmount,
          eventId: input.eventId,
          categoryId: input.categoryId,
        };
      }

      await this.insertOperation(client, operation, "prepared");
      await this.insertReservation(client, operation, "consumed");
      return this.persistIssuance(client, state, operation);
    });
    if (!("pending" in prepared)) return prepared;

    // The provider call is deliberately outside every database transaction.
    // Razorpay treats the receipt as an idempotency key; the gateway recovers
    // the existing order by receipt after a network timeout.
    const order = await gateway.createOrder({
      amount: prepared.amount,
      receipt: `gp_${prepared.operationId.replaceAll("-", "")}`,
      notes: { event_id: prepared.eventId, category_id: prepared.categoryId },
    });
    return runTransaction(this.pool, async (client) => {
      const result = await client.query<CheckoutOperationRow>(
        `SELECT * FROM checkout_operations
         WHERE id = $1::uuid AND actor_subject = $2
         FOR UPDATE`,
        [prepared.operationId, identity.subject],
      );
      const operation = result.rows[0];
      if (!operation) throw new HttpError(404, "Checkout operation not found.");
      if (operation.result_payload) return operation.result_payload;
      if (operation.razorpay_order_id) return this.paymentResponse(operation, gateway.keyId);
      if (order.amount !== operation.razorpay_amount) {
        throw new HttpError(502, "The payment provider returned the wrong order amount.");
      }
      await client.query(
        `UPDATE checkout_operations
         SET razorpay_order_id = $2, updated_at = now()
         WHERE id = $1::uuid`,
        [operation.id, order.id],
      );
      return this.paymentResponse(
        { ...operation, razorpay_order_id: order.id },
        gateway.keyId,
      );
    });
  }

  async confirmCheckout(
    identity: TicketIdentity,
    input: ConfirmCheckoutInput,
    gateway: RazorpayGateway,
  ): Promise<IssuedTicketsResult> {
    return runTransaction(this.pool, async (client) => {
      const state = await this.lockState(client);
      const result = await client.query<CheckoutOperationRow>(
        `SELECT * FROM checkout_operations
         WHERE id = $1::uuid
         FOR UPDATE`,
        [input.operationId],
      );
      const operation = result.rows[0];
      if (!operation || operation.actor_subject !== identity.subject) {
        throw new HttpError(404, "Checkout operation not found.");
      }
      if (operation.razorpay_order_id !== input.razorpayOrderId) {
        throw new HttpError(400, "Payment order does not match this checkout.");
      }
      if (!gateway.verifySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
        throw new HttpError(401, "Payment signature verification failed.");
      }
      if (operation.result_payload) return operation.result_payload;
      const product = await this.lockProduct(
        client,
        state,
        operation.app_event_id,
        operation.app_category_id,
      );
      // A valid payment is fulfilled even if its browser callback arrived
      // after reservation expiry; retries must never strand a paid attendee.
      return this.persistIssuance(
        client,
        state,
        this.newOperationFromRow(operation, product),
        input.razorpayPaymentId,
      );
    });
  }

  async issueManualTickets(identity: TicketIdentity, input: ManualTicketInput): Promise<IssuedTicketsResult> {
    return runTransaction(this.pool, async (client) => {
      const state = await this.lockState(client);
      await this.expireReservations(client);
      const digest = requestHash(input);
      const prior = await this.operationByIdempotency(
        client,
        identity.subject,
        "manual",
        input.idempotencyKey,
      );
      if (prior) {
        if (prior.request_hash !== digest) {
          throw new HttpError(409, "Idempotency key was already used for another issuance.");
        }
        if (!prior.result_payload) throw new HttpError(409, "Manual issuance is still pending.");
        return prior.result_payload;
      }
      const attendee = await client.query<{ email: string; display_name: string; status: string }>(
        `SELECT email, display_name, status
         FROM scanner.users
         WHERE lower(email) = $1
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE`,
        [input.attendeeEmail],
      );
      const scannerUser = attendee.rows[0];
      if (!scannerUser) {
        throw new HttpError(404, "The attendee must sign in to GatePass before a manual ticket can be issued.");
      }
      if (scannerUser.status.toLowerCase() !== "active") {
        throw new HttpError(403, "The attendee account is disabled.");
      }
      const product = await this.lockProduct(client, state, input.eventId, input.categoryId);
      const reserved = await this.reservedCapacity(client, product);
      assertCapacity(product, input.quantity, reserved.category, reserved.event);
      const paymentMethod = product.unitPrice === 0 ? "free" : "cash";
      const operation: NewOperation = {
        id: randomUUID(),
        actorSubject: identity.subject,
        actorEmail: identity.email,
        kind: "manual",
        idempotencyKey: input.idempotencyKey,
        requestHash: digest,
        product,
        attendeeEmail: scannerUser.email.toLowerCase(),
        attendeeName: scannerUser.display_name,
        attendeePhone: input.attendeePhone,
        quantity: input.quantity,
        amounts: priceBreakdown(product.unitPrice, input.quantity, paymentMethod),
        paymentMethod,
      };
      await this.insertOperation(client, operation, "prepared");
      await this.insertReservation(client, operation, "consumed");
      return this.persistIssuance(client, state, operation);
    });
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

  // The FastAPI scanner service (backend/scanner_routes.py) checks tickets
  // in by writing straight to public.tickets, bypassing this store's JSON
  // snapshot entirely. Overlay the authoritative SQL columns before any
  // read or merge so a stale cached snapshot can't resurrect or overwrite
  // a ticket that scanning already checked in, cancelled, or refunded.
  private async overlayAuthoritativeState(
    state: AppStateSnapshot,
    _canManageState: boolean,
    queryable: pg.Pool | pg.PoolClient,
  ): Promise<AppStateSnapshot> {
    if (state.tickets.length === 0) return state;
    const dbIdToAppId = new Map(state.tickets.map((ticket) => [databaseId("tickets", ticket.id), ticket.id]));
    const result = await queryable.query<{
      id: string;
      status: TicketStatus;
      checked_in_at: Date | null;
      gate_scanned: string | null;
      scanned_by: string | null;
    }>(
      `SELECT id, status, checked_in_at, gate_scanned, scanned_by FROM tickets WHERE id = ANY($1::uuid[])`,
      [[...dbIdToAppId.keys()]],
    );
    if (result.rows.length === 0) return state;
    const rowByAppId = new Map(result.rows.map((row) => [dbIdToAppId.get(row.id)!, row]));
    return {
      ...state,
      tickets: state.tickets.map((ticket) => {
        const row = rowByAppId.get(ticket.id);
        if (!row) return ticket;
        return {
          ...ticket,
          status: row.status,
          checkedInAt: row.checked_in_at?.toISOString(),
          gateScanned: row.gate_scanned ?? undefined,
          scannedBy: row.scanned_by ?? undefined,
        };
      }),
    };
  }

  private async lockState(client: pg.PoolClient): Promise<AppStateSnapshot> {
    await client.query(
      `INSERT INTO app_state (state_key, payload)
       VALUES ('default', $1::jsonb)
       ON CONFLICT (state_key) DO NOTHING`,
      [JSON.stringify(createInitialAppState())],
    );
    const result = await client.query<{ payload: AppStateSnapshot }>(
      `SELECT payload FROM app_state
       WHERE state_key = 'default'
       FOR UPDATE`,
    );
    return result.rows[0].payload;
  }

  private async writeState(client: pg.PoolClient, state: AppStateSnapshot): Promise<void> {
    await client.query(
      `INSERT INTO app_state (state_key, payload)
       VALUES ('default', $1::jsonb)
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [JSON.stringify(state)],
    );
  }

  private async writeProfile(client: pg.PoolClient, subject: string, profile: UserProfile): Promise<void> {
    await client.query(
      `INSERT INTO app_state (state_key, payload)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (state_key)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [profileKey(subject), JSON.stringify({ user: profile })],
    );
  }

  private async operationByIdempotency(
    client: pg.PoolClient,
    subject: string,
    kind: "checkout" | "manual",
    idempotencyKey: string,
  ): Promise<CheckoutOperationRow | undefined> {
    const result = await client.query<CheckoutOperationRow>(
      `SELECT * FROM checkout_operations
       WHERE actor_subject = $1
         AND operation_kind = $2
         AND idempotency_key = $3
       FOR UPDATE`,
      [subject, kind, idempotencyKey],
    );
    return result.rows[0];
  }

  private paymentResponse(operation: CheckoutOperationRow, keyId: string): PaymentRequiredResult {
    if (
      operation.status !== "prepared"
      || !operation.razorpay_order_id
      || !operation.razorpay_amount
      || !operation.expires_at
      || operation.expires_at.getTime() <= Date.now()
    ) {
      throw new HttpError(409, "Checkout reservation expired.");
    }
    return {
      status: "payment_required",
      operationId: operation.id,
      checkout: {
        key: keyId,
        orderId: operation.razorpay_order_id,
        amount: operation.razorpay_amount,
        currency: "INR",
        name: "GatePass",
        description: `${operation.app_category_id} ticket`,
      },
    };
  }

  private async ensureScannerUser(client: pg.PoolClient, identity: TicketIdentity): Promise<string> {
    const email = identity.email.toLowerCase();
    const name = identity.name?.trim() || email.split("@", 1)[0] || "GatePass Member";
    const existing = await client.query<{ id: string; display_name: string; status: string }>(
      `SELECT id::text, display_name, status
       FROM scanner.users
       WHERE (google_issuer = $1 AND google_subject = $2)
          OR lower(email) = $3
       ORDER BY CASE WHEN google_issuer = $1 AND google_subject = $2 THEN 0 ELSE 1 END, created_at
       LIMIT 1
       FOR UPDATE`,
      [identity.issuer, identity.subject, email],
    );
    const user = existing.rows[0];
    if (user) {
      if (user.status.toLowerCase() !== "active") throw new HttpError(403, "Account disabled.");
      await client.query(
        `UPDATE scanner.users
         SET email = $1, display_name = $2, updated_at = now()
         WHERE id = $3::uuid`,
        [email, name, user.id],
      );
      return name;
    }
    const inserted = await client.query<{ display_name: string }>(
      `INSERT INTO scanner.users (
         id, google_issuer, google_subject, email, display_name, status
       ) VALUES ($1::uuid, $2, $3, $4, $5, 'active')
       ON CONFLICT (google_issuer, google_subject)
       DO UPDATE SET email = EXCLUDED.email,
                     display_name = EXCLUDED.display_name,
                     updated_at = now()
       RETURNING display_name`,
      [randomUUID(), identity.issuer, identity.subject, email, name],
    );
    return inserted.rows[0].display_name;
  }

  private async lockProduct(
    client: pg.PoolClient,
    state: AppStateSnapshot,
    appEventId: string,
    appCategoryId: string,
  ): Promise<Product> {
    const event = state.events.find(({ id }) => id === appEventId);
    const category = event?.ticketCategories.find(({ id }) => id === appCategoryId);
    if (!event || !category) throw new HttpError(404, "Event or ticket category not found.");
    const eventId = databaseId("events", appEventId);
    const categoryId = databaseId("ticket_categories", appCategoryId);
    const organizationId = databaseId("organizations", "gatepass");
    await client.query(
      `INSERT INTO organizations (id, name, org_type, contact_email, contact_phone)
       VALUES ($1::uuid, 'GatePass', 'Event Operations', 'support@gatepass.app', 'N/A')
       ON CONFLICT (id) DO NOTHING`,
      [organizationId],
    );
    await client.query(
      `INSERT INTO events (
         id, organization_id, title, description, event_type, venue,
         start_time, end_time, banner_url, capacity
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        eventId,
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
    await client.query(
      `INSERT INTO ticket_categories (
         id, event_id, name, description, price, capacity, sold_count
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        categoryId,
        eventId,
        category.name,
        category.description,
        category.price,
        category.capacity,
        category.soldCount,
      ],
    );
    const result = await client.query<DbProductRow>(
      `SELECT
         e.id::text AS event_id,
         e.title AS event_name,
         e.capacity AS event_capacity,
         tc.id::text AS category_id,
         tc.name AS category_name,
         tc.price::text AS unit_price,
         tc.capacity AS category_capacity,
         tc.sold_count AS category_sold,
         (SELECT COALESCE(sum(all_categories.sold_count), 0)::integer
          FROM ticket_categories all_categories
          WHERE all_categories.event_id = e.id) AS event_sold
       FROM events e
       JOIN ticket_categories tc ON tc.event_id = e.id
       WHERE e.id = $1::uuid AND tc.id = $2::uuid
       FOR UPDATE OF e, tc`,
      [eventId, categoryId],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "Event or ticket category not found.");
    return {
      appEventId,
      appCategoryId,
      eventDbId: row.event_id,
      categoryDbId: row.category_id,
      eventName: row.event_name,
      categoryName: row.category_name,
      unitPrice: Number(row.unit_price),
      categoryCapacity: row.category_capacity,
      categorySold: row.category_sold,
      eventCapacity: row.event_capacity,
      eventSold: row.event_sold,
    };
  }

  private async expireReservations(client: pg.PoolClient): Promise<void> {
    await client.query(
      `UPDATE checkout_reservations
       SET status = 'expired'
       WHERE status = 'active' AND expires_at <= now()`,
    );
    await client.query(
      `UPDATE checkout_operations operations
       SET status = 'expired'
       WHERE status = 'prepared'
         AND expires_at <= now()
         AND EXISTS (
           SELECT 1 FROM checkout_reservations reservations
           WHERE reservations.operation_id = operations.id
             AND reservations.status = 'expired'
         )`,
    );
  }

  private async reservedCapacity(
    client: pg.PoolClient,
    product: Product,
  ): Promise<{ category: number; event: number }> {
    const result = await client.query<{ category_reserved: number; event_reserved: number }>(
      `SELECT
         COALESCE(sum(CASE WHEN reservations.category_id = $1::uuid THEN reservations.quantity ELSE 0 END), 0)::integer
           AS category_reserved,
         COALESCE(sum(reservations.quantity), 0)::integer AS event_reserved
       FROM checkout_reservations reservations
       JOIN ticket_categories categories ON categories.id = reservations.category_id
       WHERE categories.event_id = $2::uuid
         AND reservations.status = 'active'
         AND reservations.expires_at > now()`,
      [product.categoryDbId, product.eventDbId],
    );
    return {
      category: result.rows[0]?.category_reserved ?? 0,
      event: result.rows[0]?.event_reserved ?? 0,
    };
  }

  private async insertOperation(
    client: pg.PoolClient,
    operation: NewOperation,
    status: "prepared" | "issued",
  ): Promise<void> {
    await client.query(
      `INSERT INTO checkout_operations (
         id, actor_subject, actor_email, operation_kind, idempotency_key,
         request_hash, app_event_id, app_category_id, event_id, category_id,
         attendee_email, attendee_name, attendee_phone, quantity, unit_price,
         gross_amount, platform_fee, gateway_fee, net_amount, payment_method,
         status, razorpay_order_id, razorpay_amount, expires_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6, $7, $8, $9::uuid, $10::uuid,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20,
         $21, $22, $23, $24
       )`,
      [
        operation.id,
        operation.actorSubject,
        operation.actorEmail,
        operation.kind,
        operation.idempotencyKey,
        operation.requestHash,
        operation.product.appEventId,
        operation.product.appCategoryId,
        operation.product.eventDbId,
        operation.product.categoryDbId,
        operation.attendeeEmail,
        operation.attendeeName,
        operation.attendeePhone,
        operation.quantity,
        operation.product.unitPrice,
        operation.amounts.grossAmount,
        operation.amounts.platformFee,
        operation.amounts.gatewayFee,
        operation.amounts.netAmount,
        operation.paymentMethod,
        status,
        operation.razorpayOrderId ?? null,
        operation.razorpayAmount ?? null,
        operation.expiresAt ?? null,
      ],
    );
  }

  private async insertReservation(
    client: pg.PoolClient,
    operation: NewOperation,
    status: "active" | "consumed",
  ): Promise<void> {
    await client.query(
      `INSERT INTO checkout_reservations (
         id, operation_id, event_id, category_id, quantity, status, expires_at, consumed_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8)`,
      [
        randomUUID(),
        operation.id,
        operation.product.eventDbId,
        operation.product.categoryDbId,
        operation.quantity,
        status,
        operation.expiresAt ?? new Date(),
        status === "consumed" ? new Date() : null,
      ],
    );
  }

  private newOperationFromRow(operation: CheckoutOperationRow, product: Product): NewOperation {
    return {
      id: operation.id,
      actorSubject: operation.actor_subject,
      actorEmail: operation.attendee_email,
      kind: "checkout",
      idempotencyKey: "",
      requestHash: operation.request_hash,
      product,
      attendeeEmail: operation.attendee_email,
      attendeeName: operation.attendee_name,
      attendeePhone: operation.attendee_phone,
      quantity: operation.quantity,
      amounts: {
        grossAmount: Number(operation.gross_amount),
        platformFee: Number(operation.platform_fee),
        gatewayFee: Number(operation.gateway_fee),
        netAmount: Number(operation.net_amount),
        razorpayAmount: operation.razorpay_amount ?? 0,
      },
      paymentMethod: operation.payment_method,
      razorpayOrderId: operation.razorpay_order_id ?? undefined,
      razorpayAmount: operation.razorpay_amount ?? undefined,
      expiresAt: operation.expires_at ?? undefined,
    };
  }

  private async persistIssuance(
    client: pg.PoolClient,
    state: AppStateSnapshot,
    operation: NewOperation,
    razorpayPaymentId?: string,
  ): Promise<IssuedTicketsResult> {
    const issued = issueIntoState(state, {
      product: operation.product,
      quantity: operation.quantity,
      attendeeEmail: operation.attendeeEmail,
      attendeeName: operation.attendeeName,
      attendeePhone: operation.attendeePhone,
      actor: operation.actorEmail,
      paymentMethod: operation.paymentMethod,
      amounts: operation.amounts,
    });
    await client.query(
      `UPDATE ticket_categories
       SET sold_count = sold_count + $1, updated_at = now()
       WHERE id = $2::uuid`,
      [operation.quantity, operation.product.categoryDbId],
    );
    await client.query(
      `INSERT INTO orders (
         id, event_id, buyer_name, buyer_email, buyer_phone, payment_status,
         gross_amount, platform_fee, gateway_fee, net_amount, payment_method, created_at
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'paid', $6, $7, $8, $9, $10::payment_method, $11)`,
      [
        issued.result.order.id,
        operation.product.eventDbId,
        issued.result.order.buyerName,
        issued.result.order.buyerEmail,
        issued.result.order.buyerPhone,
        issued.result.order.grossAmount,
        issued.result.order.platformFee,
        issued.result.order.gatewayFee,
        issued.result.order.netAmount,
        issued.result.order.paymentMethod,
        issued.result.order.created_at,
      ],
    );
    for (const ticket of issued.result.tickets) {
      await client.query(
        `INSERT INTO tickets (
           id, event_id, order_id, category_id, category_name, price,
           attendee_name, attendee_phone, attendee_email, qr_token, status, issued_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
           $7, $8, $9, $10, 'issued', $11
         )`,
        [
          ticket.id,
          operation.product.eventDbId,
          ticket.orderId,
          operation.product.categoryDbId,
          ticket.categoryName,
          ticket.price,
          ticket.attendeeName,
          ticket.attendeePhone,
          ticket.attendeeEmail,
          ticket.qrToken,
          ticket.issuedAt,
        ],
      );
    }
    await client.query(
      `INSERT INTO settlements (
         id, event_id, event_name, gross_sales, total_refunds, platform_fees,
         gateway_fees, manual_collections, net_settlement, status
       ) VALUES ($1::uuid, $2::uuid, $3, $4, 0, $5, $6, $7, $8, 'pending')
       ON CONFLICT (event_id) DO UPDATE SET
         event_name = EXCLUDED.event_name,
         gross_sales = settlements.gross_sales + EXCLUDED.gross_sales,
         platform_fees = settlements.platform_fees + EXCLUDED.platform_fees,
         gateway_fees = settlements.gateway_fees + EXCLUDED.gateway_fees,
         manual_collections = settlements.manual_collections + EXCLUDED.manual_collections,
         net_settlement = settlements.net_settlement + EXCLUDED.net_settlement,
         updated_at = now()`,
      [
        databaseId("settlements", issued.settlement.id),
        operation.product.eventDbId,
        operation.product.eventName,
        operation.amounts.grossAmount,
        operation.amounts.platformFee,
        operation.amounts.gatewayFee,
        operation.paymentMethod === "cash" ? operation.amounts.grossAmount : 0,
        operation.amounts.netAmount,
      ],
    );
    await client.query(
      `INSERT INTO audit_logs (id, timestamp, actor, action, details)
       VALUES ($1::uuid, $2, $3, $4, $5)`,
      [issued.audit.id, issued.audit.timestamp, issued.audit.actor, issued.audit.action, issued.audit.details],
    );
    await this.writeState(client, issued.state);
    await client.query(
      `UPDATE checkout_operations
       SET status = 'issued',
           razorpay_payment_id = $2,
           result_payload = $3::jsonb,
           confirmed_at = now(),
           updated_at = now()
       WHERE id = $1::uuid`,
      [operation.id, razorpayPaymentId ?? null, JSON.stringify(issued.result)],
    );
    await client.query(
      `UPDATE checkout_reservations
       SET status = 'consumed', consumed_at = COALESCE(consumed_at, now())
       WHERE operation_id = $1::uuid`,
      [operation.id],
    );
    return issued.result;
  }

  private async syncReportingTables(client: pg.PoolClient, state: AppStateSnapshot): Promise<void> {
    const organizationId = databaseId("organizations", "gatepass");
    const userId = databaseId("users", state.user.id);
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
          databaseId("access_requests", request.id),
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
          databaseId("invite_passes", invite.id),
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
      const eventDbId = databaseId("events", event.id);
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

      for (const category of event.ticketCategories) {
        const categoryDbId = databaseId("ticket_categories", category.id);
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
            sold_count = GREATEST(ticket_categories.sold_count, EXCLUDED.sold_count),
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
      const orderDbId = databaseId("orders", order.id);
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
          payment_status = CASE
            WHEN orders.payment_status = 'paid' THEN orders.payment_status
            ELSE EXCLUDED.payment_status
          END,
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
      const ticketDbId = databaseId("tickets", ticket.id);
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
          databaseId("scan_logs", log.id),
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
          gross_sales = GREATEST(settlements.gross_sales, EXCLUDED.gross_sales),
          total_refunds = GREATEST(settlements.total_refunds, EXCLUDED.total_refunds),
          platform_fees = GREATEST(settlements.platform_fees, EXCLUDED.platform_fees),
          gateway_fees = GREATEST(settlements.gateway_fees, EXCLUDED.gateway_fees),
          manual_collections = GREATEST(settlements.manual_collections, EXCLUDED.manual_collections),
          net_settlement = GREATEST(settlements.net_settlement, EXCLUDED.net_settlement),
          status = EXCLUDED.status,
          settled_at = EXCLUDED.settled_at,
          updated_at = now()`,
        [
          databaseId("settlements", settlement.id),
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
        [databaseId("audit_logs", audit.id), toDate(audit.timestamp), audit.actor, audit.action, audit.details],
      );
    }
  }
}
