import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { completeTicketCheckout } from "./ticketCheckout";
import type { IssuedTicketsResult, TicketCheckoutConfirmInput } from "./ticketApi";

test("ticket flows use authoritative endpoints without local paid-ticket fallbacks", async () => {
  const [api, events, organizer] = await Promise.all([
    readFile(new URL("./ticketApi.ts", import.meta.url), "utf8"),
    readFile(new URL("./pages/Events.tsx", import.meta.url), "utf8"),
    readFile(new URL("./pages/Organizer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(api, /action: "prepare"/);
  assert.match(api, /action: "confirm"/);
  assert.match(api, /\/api\/tickets\/manual/);
  assert.match(events, /prepareTicketCheckout/);
  assert.match(events, /confirmTicketCheckout/);
  assert.match(organizer, /issueManualTickets/);
  assert.doesNotMatch(events, /Simulating payment|rzp_test_|paymentStatus: "paid"|TKT_/);
  assert.doesNotMatch(organizer, /manual@offline\.org|GP_MAN_|ord_manual_|tkt_manual_/);
});

test("a failed confirmation retries the captured payment without preparing again", async () => {
  const confirmation: TicketCheckoutConfirmInput = {
    operationId: "operation-1",
    razorpayOrderId: "order-1",
    razorpayPaymentId: "payment-1",
    razorpaySignature: "signature-1",
  };
  const issued = { status: "issued", order: { id: "order-1" }, tickets: [{ id: "ticket-1" }] } as IssuedTicketsResult;
  let pending: TicketCheckoutConfirmInput | null = null;
  let prepareCalls = 0;
  let paymentWindows = 0;
  let confirmCalls = 0;

  const actions = {
    prepare: async () => {
      prepareCalls += 1;
      return {
        status: "payment_required" as const,
        operationId: confirmation.operationId,
        checkout: { key: "key", orderId: "order-1", amount: 100, currency: "INR", name: "GatePass", description: "Ticket" },
      };
    },
    capturePayment: async () => {
      paymentWindows += 1;
      return confirmation;
    },
    rememberConfirmation: (value: TicketCheckoutConfirmInput) => {
      pending = value;
    },
    confirm: async (value: TicketCheckoutConfirmInput) => {
      confirmCalls += 1;
      assert.deepEqual(value, confirmation);
      if (confirmCalls === 1) throw new Error("network timeout");
      return issued;
    },
  };

  await assert.rejects(completeTicketCheckout(pending, actions), /network timeout/);
  assert.deepEqual(pending, confirmation);

  assert.equal(await completeTicketCheckout(pending, actions), issued);
  assert.equal(prepareCalls, 1);
  assert.equal(paymentWindows, 1);
  assert.equal(confirmCalls, 2);
});
