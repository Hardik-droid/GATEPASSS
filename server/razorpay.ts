import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: "INR";
}

export interface RazorpayGateway {
  readonly keyId: string;
  createOrder(input: {
    amount: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createRazorpayGateway(): RazorpayGateway {
  return {
    keyId: config.RAZORPAY_KEY_ID,
    async createOrder({ amount, receipt, notes }) {
      if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) {
        throw new HttpError(503, "Online payments are not configured.");
      }
      const authorization = `Basic ${Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString("base64")}`;
      try {
        const response = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: { Authorization: authorization, "Content-Type": "application/json" },
          body: JSON.stringify({ amount, currency: "INR", receipt, notes }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await response.json().catch(() => null) as unknown;
        if (
          response.ok
          && typeof body === "object"
          && body !== null
          && typeof (body as { id?: unknown }).id === "string"
          && (body as { amount?: unknown }).amount === amount
          && (body as { currency?: unknown }).currency === "INR"
        ) {
          return body as RazorpayOrder;
        }
      } catch {
        // A timeout can happen after Razorpay accepted the unique receipt.
      }

      const lookup = new URL("https://api.razorpay.com/v1/orders");
      lookup.searchParams.set("receipt", receipt);
      lookup.searchParams.set("count", "10");
      const recovered = await fetch(lookup, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      const collection = recovered
        ? await recovered.json().catch(() => null) as unknown
        : null;
      const items = typeof collection === "object"
        && collection !== null
        && Array.isArray((collection as { items?: unknown }).items)
        ? (collection as { items: unknown[] }).items
        : [];
      const order = items.find((item) =>
        typeof item === "object"
        && item !== null
        && (item as { receipt?: unknown }).receipt === receipt
        && (item as { amount?: unknown }).amount === amount
        && (item as { currency?: unknown }).currency === "INR"
        && typeof (item as { id?: unknown }).id === "string");
      if (order) return order as RazorpayOrder;
      throw new HttpError(502, "The payment provider could not create an order.");
    },
    verifySignature: (orderId, paymentId, signature) => verifyRazorpaySignature(
      orderId,
      paymentId,
      signature,
      config.RAZORPAY_KEY_SECRET,
    ),
  };
}
