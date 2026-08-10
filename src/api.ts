import type { AppStateSnapshot } from "./appState";
import { optionalAuthFetch } from "./authFetch";
import { API_BASE_URL } from "./apiBase";
import { coverErrorMessage, COVER_UPLOAD_FALLBACK } from "./coverError";

export async function loadAppState(): Promise<AppStateSnapshot | null> {
  const response = await optionalAuthFetch(`${API_BASE_URL}/api/state`);
  if (!response.ok) {
    throw new Error(`Failed to load app state: ${response.status}`);
  }
  const payload = (await response.json()) as { state: AppStateSnapshot | null };
  return payload.state;
}

export async function saveAppState(state: AppStateSnapshot): Promise<void> {
  const response = await optionalAuthFetch(`${API_BASE_URL}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save app state: ${response.status}`);
  }
}

export async function createEventApi(event: any): Promise<{ event: any; default_gate: any }> {
  const response = await optionalAuthFetch(`${API_BASE_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create event in Neon: ${response.status}`);
  }
  return response.json();
}

export async function fetchEventsApi(): Promise<any[]> {
  const response = await optionalAuthFetch(`${API_BASE_URL}/api/events`);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }
  const data = await response.json();
  return data.events || [];
}

export async function uploadEventCoverApi(file: File): Promise<string> {
  // The endpoint takes the raw image bytes with the image's own Content-Type
  // (server/app.ts uses express.raw), not multipart/form-data.
  const response = await optionalAuthFetch(`${API_BASE_URL}/api/event-images`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "image/png",
    },
    body: file,
  });
  if (!response.ok) {
    // Never pass the parsed body straight to Error(): a non-string field would
    // be coerced to "[object Object]" and shown to the organizer as-is.
    const body = await response.json().catch(() => null);
    throw new Error(coverErrorMessage(body));
  }
  const data = await response.json().catch(() => null);
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url === "string" && url.trim()) return url;
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id === "string" && id.trim()) return `${API_BASE_URL}/api/event-images?id=${id}`;
  // Refuse to persist a bogus banner URL built from a missing/!string id.
  throw new Error(COVER_UPLOAD_FALLBACK);
}
