// Fetches the current user's permanent QR payload from the FastAPI scanner
// service (the sole QR authority), authenticated with the raw Google ID token
// captured at login. Google ID tokens expire (~1h); on 401 the caller should
// prompt a fresh sign-in.
const SCANNER_API_BASE_URL = (import.meta.env.VITE_SCANNER_API_BASE_URL ?? "").replace(/\/$/, "");

export const GOOGLE_ID_TOKEN_KEY = "gp_google_id_token";

export async function fetchMyQrPayload(): Promise<string> {
  const token = sessionStorage.getItem(GOOGLE_ID_TOKEN_KEY);
  if (!token) {
    throw new Error("USER_NOT_AUTHENTICATED: Please sign in with Google to view your QR.");
  }
  const response = await fetch(`${SCANNER_API_BASE_URL}/api/qr/me`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("USER_NOT_AUTHENTICATED: Your session expired — please sign in with Google again.");
  }
  if (!response.ok) {
    throw new Error("QR_LOAD_FAILED: Unable to retrieve your permanent QR.");
  }
  const data = (await response.json()) as { qr_payload: string; status: string };
  return data.qr_payload;
}
