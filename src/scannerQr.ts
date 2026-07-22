// Fetches the current user's permanent QR payload from the FastAPI scanner
// service (the sole QR authority), authenticated with a verified Neon Auth JWT.
import { authFetch, AuthExpiredError } from "./authFetch";

const SCANNER_API_BASE_URL = (import.meta.env.VITE_SCANNER_API_BASE_URL ?? "").replace(/\/$/, "");

export async function fetchMyQrPayload(): Promise<string> {
  try {
    const res = await authFetch(`${SCANNER_API_BASE_URL}/api/qr/me`);
    if (!res.ok) {
      throw new Error("QR_LOAD_FAILED: Unable to retrieve your permanent QR.");
    }
    const data = (await res.json()) as { qr_payload: string; status: string };
    return data.qr_payload;
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      throw new Error("USER_NOT_AUTHENTICATED: Please sign in with Neon Auth to view your QR.");
    }
    throw err;
  }
}
