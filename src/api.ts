import type { AppStateSnapshot } from "./appState";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function loadAppState(): Promise<AppStateSnapshot | null> {
  const token = sessionStorage.getItem("gp_session_token");
  const response = await fetch(`${API_BASE_URL}/api/state`, {
    headers: { 
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load app state: ${response.status}`);
  }

  const payload = (await response.json()) as { state: AppStateSnapshot | null };
  return payload.state;
}

export async function saveAppState(state: AppStateSnapshot): Promise<void> {
  const token = sessionStorage.getItem("gp_session_token");
  const response = await fetch(`${API_BASE_URL}/api/state`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save app state: ${response.status}`);
  }
}
