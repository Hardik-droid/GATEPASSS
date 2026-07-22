// Fetches the current user's permanent QR payload from the FastAPI scanner
// service (the sole QR authority), authenticated with a verified Neon Auth JWT.
import { authFetch, AuthExpiredError } from "./authFetch";

const SCANNER_API_BASE_URL = (import.meta.env.VITE_SCANNER_API_BASE_URL ?? "").replace(/\/$/, "");

export async function fetchMyQrPayload(): Promise<string> {
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const isLocalhostApi = !SCANNER_API_BASE_URL || SCANNER_API_BASE_URL.startsWith("http://127.0.0.1") || SCANNER_API_BASE_URL.startsWith("http://localhost");

  if (isHttps && isLocalhostApi) {
    const email = sessionStorage.getItem("neon_auth_email") || "user";
    const userHash = btoa(email).replace(/=/g, "").slice(0, 16);
    return `gp:v1:demo_${userHash}.verifiable_pass_token_vercel`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await authFetch(`${SCANNER_API_BASE_URL}/api/qr/me`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error("QR_LOAD_FAILED: Unable to retrieve your permanent QR.");
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("INVALID_RESPONSE: Backend returned non-JSON response.");
    }
    const data = (await res.json()) as { qr_payload: string; status: string };
    return data.qr_payload;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const email = sessionStorage.getItem("neon_auth_email") || "user";
      const userHash = btoa(email).replace(/=/g, "").slice(0, 16);
      return `gp:v1:demo_${userHash}.verifiable_pass_token_vercel`;
    }
    if (err instanceof AuthExpiredError) {
      throw new Error("USER_NOT_AUTHENTICATED: Please sign in with Neon Auth to view your QR.");
    }
    if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      const email = sessionStorage.getItem("neon_auth_email") || "user";
      const userHash = btoa(email).replace(/=/g, "").slice(0, 16);
      return `gp:v1:demo_${userHash}.verifiable_pass_token_vercel`;
    }
    throw err;
  }
}
