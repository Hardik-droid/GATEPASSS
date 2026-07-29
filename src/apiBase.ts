// Resolves a build-time `VITE_*` API base URL into one that is usable at runtime.
//
// Vite inlines `VITE_*` values into the bundle at build time. A loopback base
// (the correct value for local development) therefore gets shipped to every
// visitor's browser, where `http://127.0.0.1:8010` resolves to the visitor's
// own machine and every request fails to connect. Treat that case as "unset"
// and fall back to the deployment's own origin, where the API is served from
// the same host.

function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(hostname);
  } catch {
    return false; // relative base such as "/api" — nothing to reject
  }
}

export function resolveApiBase(raw: string | undefined, pageOrigin: string): string {
  const base = (raw ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (isLoopback(base) && !isLoopback(pageOrigin)) return "";
  try {
    if (new URL(pageOrigin).protocol === "https:" && new URL(base).protocol === "http:") return "";
  } catch {
    // Relative bases are same-origin and inherit the page's protocol.
  }
  return base;
}

export const pageOrigin = typeof window === "undefined" ? "" : window.location.origin;

// Optional chaining keeps this module importable outside Vite (node:test).
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

export const SCANNER_API_BASE_URL = resolveApiBase(env.VITE_SCANNER_API_BASE_URL, pageOrigin);

export const API_BASE_URL = resolveApiBase(env.VITE_API_BASE_URL, pageOrigin);
