# GatepassApi (.NET) — authentication status

**As of Phase 2 (Neon Auth migration), the .NET service holds no protected
production route and introduces no token format.**

- Neon Auth is the single production user-identity authority. User/admin
  endpoints authenticate with a Neon Auth **JWT**, verified via JWKS by the
  FastAPI scanner service and the Node legacy API.
- `Controllers/AuthController.cs` exposes a legacy `POST /api/auth/google-login`
  that validates a Google ID token. **The SPA does not call it** (verified: no
  frontend base URL or env var targets this service), and it is **not** part of
  the authenticated production path.
- The `GatepassDbContext` maps only `app_state`; .NET makes no QR, scanner,
  ticket, or user-identity security decisions.

## If .NET must guard a production route later

Do **not** revive Google-token or any bespoke session verification. Verify Neon
Auth JWTs via JWKS (`<NEON_AUTH_URL>/.well-known/jwks.json`, `EdDSA`), matching
the FastAPI (`backend/security.py`) and Node (`server/neonAuth.ts`) verifiers:
check signature, `kid`, algorithm allow-list (`EdDSA`), issuer, audience (when
configured), expiry, and subject. No fourth token format.
