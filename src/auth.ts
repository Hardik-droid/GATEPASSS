import { createInternalNeonAuth } from "@neondatabase/neon-js/auth";

export const neonAuthUrl =
  import.meta.env.VITE_NEON_AUTH_URL?.trim() ||
  "https://ep-spring-brook-au0wvirq.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth";

if (!neonAuthUrl) {
  throw new Error("VITE_NEON_AUTH_URL is required.");
}

const neonAuth = createInternalNeonAuth(neonAuthUrl);

export const authClient = neonAuth.adapter;

export const { signIn, signOut, useSession, getSession } = authClient;

// Neon Auth issues an EdDSA JWT that backends verify via JWKS. Use the SDK's
// own getJWTToken() — it rides the same session-cookie request getSession()
// already uses (JWT arrives via a set-auth-jwt response header), instead of a
// second, independent cross-origin fetch to <baseURL>/token that needs its
// own CORS/cookie wiring. Never store secrets in frontend code.
export async function getAuthToken(): Promise<string | null> {
  try {
    return await neonAuth.getJWTToken();
  } catch {
    return null;
  }
}

