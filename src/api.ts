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

import { prepareWebReadyImage, validateImageFile } from "./imageValidation";

export async function uploadEventCoverApi(file: File): Promise<string> {
  const prepared = await prepareWebReadyImage(file);

  try {
    const response = await optionalAuthFetch(`${API_BASE_URL}/api/event-images`, {
      method: "POST",
      headers: {
        "Content-Type": prepared.mimeType,
      },
      body: prepared.blob,
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("Image size exceeds the server upload limit.");
      }
      if (response.status === 404) {
        throw new Error("Event image service endpoint unreachable (404 Not Found).");
      }
      const body = await response.json().catch(() => null);
      if (body) {
        const message = coverErrorMessage(body);
        throw new Error(message);
      }
      throw new Error(`Upload failed with server status ${response.status}. Please try again.`);
    }

    const data = await response.json().catch(() => null);
    const url = (data as { url?: unknown } | null)?.url;
    if (typeof url === "string" && url.trim()) return url;
    const id = (data as { id?: unknown } | null)?.id;
    if (typeof id === "string" && id.trim()) return `${API_BASE_URL}/api/event-images?id=${id}`;
    throw new Error("Upload succeeded, but no valid image URL was returned by server.");
  } catch (err: unknown) {
    if (err instanceof Error) throw err;
    throw new Error("Failed to upload image. Please check your network connection and try again.");
  }
}
