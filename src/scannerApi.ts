import { authFetch } from "./authFetch";
import { SCANNER_API_BASE_URL } from "./apiBase";

export interface ScannerAssignment {
  id: string;
  event_id: string;
  event_name: string;
  venue: string;
  start_time: string;
  end_time: string;
  accepting_entries: boolean;
  gate: string;
}

export interface ScannerGrant {
  id: string;
  name: string;
  email: string;
  event_id: string;
  event_name: string;
  gate: string;
}

export interface ScannerAccess {
  is_owner: boolean;
  can_scan: boolean;
  assignments: ScannerAssignment[];
  grants: ScannerGrant[];
}

export interface ScanResult {
  decision: "APPROVED" | "REJECTED";
  reason: string;
  message: string;
  attendee: { name: string } | null;
  ticket: {
    id: string;
    event_id: string;
    event_name: string;
    ticket_type: string;
    entry_count: number;
    max_entries: number;
    original_owner_name: string;
  } | null;
  ownership: {
    owner_count: number;
    is_transferred: boolean;
    transferred_from_name: string | null;
  } | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.detail ??
      data?.message ??
      `Scanner service returned ${response.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data as T;
}

export async function fetchScannerAccess(): Promise<ScannerAccess> {
  return readJson<ScannerAccess>(
    await authFetch(`${SCANNER_API_BASE_URL}/api/scanner/assignments`),
  );
}

export async function updateScannerAccess(input: {
  email: string;
  event_id: string;
  gate: string;
  allowed: boolean;
}): Promise<void> {
  await readJson(
    await authFetch(`${SCANNER_API_BASE_URL}/api/scanner/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function validateScannerQr(
  eventId: string,
  payload: string,
): Promise<ScanResult> {
  return readJson<ScanResult>(
    await authFetch(`${SCANNER_API_BASE_URL}/api/scanner/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ event_id: eventId, payload }),
    }),
  );
}
