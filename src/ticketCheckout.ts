import type {
  CheckoutPrepareResult,
  IssuedTicketsResult,
  PaymentRequiredResult,
  TicketCheckoutConfirmInput,
} from "./ticketApi";

interface TicketCheckoutActions {
  prepare: () => Promise<CheckoutPrepareResult>;
  capturePayment: (payment: PaymentRequiredResult) => Promise<TicketCheckoutConfirmInput>;
  rememberConfirmation: (confirmation: TicketCheckoutConfirmInput) => void;
  confirm: (confirmation: TicketCheckoutConfirmInput) => Promise<IssuedTicketsResult>;
}

export async function completeTicketCheckout(
  pendingConfirmation: TicketCheckoutConfirmInput | null,
  actions: TicketCheckoutActions,
): Promise<IssuedTicketsResult> {
  if (pendingConfirmation) return actions.confirm(pendingConfirmation);

  const prepared = await actions.prepare();
  if (prepared.status === "issued") return prepared;

  const confirmation = await actions.capturePayment(prepared);
  actions.rememberConfirmation(confirmation);
  return actions.confirm(confirmation);
}
