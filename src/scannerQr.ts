// Fetches the current user's permanent QR payload from the FastAPI scanner
// service (the sole QR authority), authenticated with a verified Neon Auth JWT.
import { authFetch, AuthExpiredError } from "./authFetch";

const SCANNER_API_BASE_URL = (import.meta.env.VITE_SCANNER_API_BASE_URL ?? "").replace(/\/$/, "");

export async function fetchMyQrPayload(): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await authFetch(`${SCANNER_API_BASE_URL}/api/qr/me`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 401) {
        throw new AuthExpiredError("Session expired or invalid token.");
      }
      throw new Error(`QR_LOAD_FAILED: Scanner backend returned status ${res.status}`);
    }
    const data = (await res.json()) as { qr_payload: string; status: string };
    if (!data.qr_payload) {
      throw new Error("QR_LOAD_FAILED: Empty QR payload received.");
    }
    return data.qr_payload;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("TIMEOUT: Scanner API request timed out. Please verify VITE_SCANNER_API_BASE_URL is accessible.");
    }
    if (err instanceof AuthExpiredError) {
      throw new Error("USER_NOT_AUTHENTICATED: Please sign in with Neon Auth to view your QR.");
    }
    throw err;
  }
}
