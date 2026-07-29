// Fetches the current user's permanent QR payload from the FastAPI scanner
// service (the sole QR authority), authenticated with a verified Neon Auth JWT.
import { authFetch, AuthExpiredError } from "./authFetch";
import { SCANNER_API_BASE_URL } from "./apiBase";

export async function fetchMyQrPayload(): Promise<string> {
  const controller = new AbortController();
  // Generous enough to absorb a cold Python function plus its first JWKS fetch.
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await authFetch(`${SCANNER_API_BASE_URL}/api/qr/me`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 401) {
        throw new AuthExpiredError("Session expired or invalid token.");
      }
      // Surface the backend's own reason (FastAPI puts it in `detail`) instead
      // of a bare status code — a misconfigured deployment is otherwise silent.
      const detail = await res.text().catch(() => "");
      throw new Error(
        `QR_LOAD_FAILED: Scanner backend returned ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
      );
    }
    const data = (await res.json()) as { qr_payload: string; status: string };
    if (!data.qr_payload) {
      throw new Error("QR_LOAD_FAILED: Empty QR payload received.");
    }
    return data.qr_payload;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("TIMEOUT: The QR service did not respond in time. Please retry.");
    }
    if (err instanceof AuthExpiredError) {
      throw new Error("USER_NOT_AUTHENTICATED: Please sign in with Neon Auth to view your QR.");
    }
    throw err;
  }
}
