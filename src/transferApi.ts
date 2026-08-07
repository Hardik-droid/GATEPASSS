import { authFetch } from "./authFetch";
import { SCANNER_API_BASE_URL } from "./apiBase";

export type TransferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export interface MyTicket {
  id: string;
  ticket_type: string;
  event_id: string;
  event_name: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  entry_count: number;
  transferable: boolean;
  blocked_reason: string | null;
  pending_transfer: { id: string; to_email: string; expires_at: string } | null;
}

export interface TransferSummary {
  id: string;
  ticket_id: string;
  ticket_type: string;
  event_name: string;
  starts_at: string;
  from_name: string;
  from_email: string;
  to_email: string;
  status: TransferStatus;
  created_at: string;
  expires_at: string;
}

export interface TransferLists {
  incoming: TransferSummary[];
  outgoing: TransferSummary[];
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.detail ?? data?.message ?? `Request failed (${response.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data as T;
}

export async function fetchMyTickets(): Promise<MyTicket[]> {
  const data = await readJson<{ tickets: MyTicket[] }>(
    await authFetch(`${SCANNER_API_BASE_URL}/api/tickets/mine`),
  );
  return data.tickets;
}

export async function fetchTransfers(): Promise<TransferLists> {
  return readJson<TransferLists>(
    await authFetch(`${SCANNER_API_BASE_URL}/api/transfers/list`),
  );
}

export async function createTransfer(ticketId: string, toEmail: string): Promise<void> {
  await readJson(
    await authFetch(`${SCANNER_API_BASE_URL}/api/transfers/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, to_email: toEmail }),
    }),
  );
}

export async function respondToTransfer(
  transferId: string,
  action: "accept" | "decline" | "cancel",
): Promise<void> {
  await readJson(
    await authFetch(`${SCANNER_API_BASE_URL}/api/transfers/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transfer_id: transferId, action }),
    }),
  );
}
