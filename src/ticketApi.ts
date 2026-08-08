import { API_BASE_URL } from "./apiBase";
import { authFetch } from "./authFetch";
import type { Order, Ticket } from "./types";

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
    currency: string;
    name: string;
    description: string;
  };
}

export type CheckoutPrepareResult = IssuedTicketsResult | PaymentRequiredResult;

export interface TicketCheckoutConfirmInput {
  operationId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function isIssued(value: unknown): value is IssuedTicketsResult {
  if (!isObject(value) || value.status !== "issued" || !isObject(value.order) || !Array.isArray(value.tickets)) {
    return false;
  }
  return typeof value.order.id === "string"
    && value.tickets.length > 0
    && value.tickets.every((ticket) => isObject(ticket) && typeof ticket.id === "string");
}

function isPaymentRequired(value: unknown): value is PaymentRequiredResult {
  if (!isObject(value) || value.status !== "payment_required" || typeof value.operationId !== "string" || !isObject(value.checkout)) {
    return false;
  }
  const checkout = value.checkout;
  return typeof checkout.key === "string"
    && typeof checkout.orderId === "string"
    && typeof checkout.amount === "number"
    && typeof checkout.currency === "string"
    && typeof checkout.name === "string"
    && typeof checkout.description === "string";
}

function parseCheckoutPrepareResult(value: unknown): CheckoutPrepareResult {
  if (isIssued(value) || isPaymentRequired(value)) return value;
  throw new Error("Ticket service returned an invalid checkout response.");
}

function parseIssuedTicketsResult(value: unknown): IssuedTicketsResult {
  if (isIssued(value)) return value;
  throw new Error("Ticket service did not return issued tickets.");
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await authFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isObject(data) ? data.detail ?? data.error ?? data.message : null;
    throw new Error(typeof detail === "string" ? detail : `Ticket service returned ${response.status}.`);
  }
  return data;
}

export async function prepareTicketCheckout(input: {
  eventId: string;
  categoryId: string;
  quantity: number;
  phone: string;
  idempotencyKey: string;
}): Promise<CheckoutPrepareResult> {
  return parseCheckoutPrepareResult(await post("/api/tickets/checkout", { action: "prepare", ...input }));
}

export async function confirmTicketCheckout(input: TicketCheckoutConfirmInput): Promise<IssuedTicketsResult> {
  return parseIssuedTicketsResult(await post("/api/tickets/checkout", { action: "confirm", ...input }));
}

export async function issueManualTickets(input: {
  eventId: string;
  categoryId: string;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<IssuedTicketsResult> {
  return parseIssuedTicketsResult(await post("/api/tickets/manual", input));
}
