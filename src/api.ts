import type { AppStateSnapshot } from "./appState";
import { authFetch } from "./authFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

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
