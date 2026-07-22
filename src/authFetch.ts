import { getAuthToken } from "./auth";

const TOKEN_KEY = "neon_auth_token";

export class AuthExpiredError extends Error {}

// Returns a fresh Neon Auth JWT (from /token), falling back to the last one
// cached in sessionStorage. The JWT — never a session-cookie string — is what
// backends verify via JWKS.
export async function currentAuthToken(): Promise<string | null> {
  const fresh = await getAuthToken();
  if (fresh) {
    sessionStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentAuthToken();
  if (!token) throw new AuthExpiredError("No Neon Auth session");
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw new AuthExpiredError("Session expired");
  }
  return res;
}
