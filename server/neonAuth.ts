import type express from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { config } from "./config";

export interface NeonVerifierOptions {
  jwks?: JWTVerifyGetKey;
  issuer?: string;
  audience?: string;
}

export interface NeonVerifier {
  verify(token: string): Promise<{ sub: string; email?: string }>;
}

// Verifies a Neon Auth JWT via JWKS (EdDSA). Inject `jwks` in tests to supply a
// local key set; production resolves the remote JWKS from NEON_AUTH_URL.
export function createNeonVerifier(opts: NeonVerifierOptions = {}): NeonVerifier {
  const base = config.NEON_AUTH_URL.replace(/\/$/, "");
  let origin = base;
  try {
    origin = new URL(base).origin;
  } catch {}
  const issuers = Array.from(new Set([base, origin]));
  const issuer = opts.issuer ? [opts.issuer] : issuers;
  const jwks =
    opts.jwks ?? createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`));
  return {
    async verify(token: string) {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        algorithms: ["EdDSA"],
        ...(opts.audience ? { audience: opts.audience } : {}),
      });
      if (!payload.sub) throw new Error("missing subject");
      return { sub: payload.sub, email: payload.email as string | undefined };
    },
  };
}

export function makeAuthenticateNeon(verifier: NeonVerifier) {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Neon Auth token required." });
      return;
    }
    verifier
      .verify(header.slice(7))
      .then((claims) => {
        (req as express.Request & { authSubject?: string }).authSubject = claims.sub;
        next();
      })
      .catch(() => res.status(401).json({ error: "Unauthorized: invalid Neon Auth token." }));
  };
}
