import type { AppStateSnapshot } from "./appState";
import { authFetch } from "./authFetch";
import { API_BASE_URL } from "./apiBase";

export async function loadAppState(): Promise<AppStateSnapshot | null> {
  const response = await authFetch(`${API_BASE_URL}/api/state`);
  if (!response.ok) {
    throw new Error(`Failed to load app state: ${response.status}`);
  }
  const payload = (await response.json()) as { state: AppStateSnapshot | null };
  return payload.state;
}

export async function saveAppState(state: AppStateSnapshot): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save app state: ${response.status}`);
  }
}

export async function uploadEventImage(file: File): Promise<string> {
  const response = await authFetch(`${API_BASE_URL}/api/event-images`, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error ?? `Failed to upload event picture: ${response.status}`);
  }
  return payload.url;
}
