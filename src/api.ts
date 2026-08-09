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

export async function createEventApi(event: any): Promise<{ event: any; default_gate: any }> {
  const response = await authFetch(`${API_BASE_URL}/api/events`, {
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
  const response = await authFetch(`${API_BASE_URL}/api/events`);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }
  const data = await response.json();
  return data.events || [];
}
