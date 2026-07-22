# Phase 2 — Neon Auth as the single identity authority (Implementation Plan)

> **For agentic workers:** execute task-by-task with TDD. Write the failing
> test, run it red, implement the smallest change, run it green, then the
> validation commands, then the next task. **Do not use Git commands.**
> **Do not touch routing / RBAC / commerce / verticals** — those are later
> phases. Steps use `- [ ]` checkboxes.

**Goal:** exactly one production user-identity authority — Neon Auth. The
frontend obtains a Neon Auth **JWT**, and both the FastAPI QR/scanner service
and the Node legacy API verify it via Neon's **JWKS**. Scanner-device auth
(opaque session token) stays entirely separate. No backend invents or trusts
its own unchecked session string.

**Architecture:** Neon Auth (better-auth) issues EdDSA JWTs at
`<NEON_AUTH_URL>/token` (session-cookie authenticated). JWKS is published at
`<NEON_AUTH_URL>/.well-known/jwks.json` (verified live: one `EdDSA`/`Ed25519`
key, `kid ced0b50a-…`). Verifiers validate signature, `alg` allow-list
(`EdDSA`), `kid`, `iss`, `exp`, `sub`, and `aud` when configured, refreshing
JWKS once on an unknown `kid`. Verified `sub` → `scanner.users` row.

**Tech stack:** FastAPI + PyJWT 2.13 (`PyJWKClient`, `cryptography` present →
Ed25519 OK); React 19 + `better-auth@1.6` client; Node/Express + `jose` (new
dep) for JWKS verify; existing `pytest` and `tsx --test` harnesses.

## Global Constraints (from the Phase 2 objective — bind every task)

- Neon Auth `sub` is the stable identity. Email/name/photo are profile
  attributes only. **Never trust a body-supplied user id or email.**
- No backend may mint or accept its own unchecked session token
  (`gp_session_*` is dead and must be rejected everywhere).
- No unchecked JWT decoding, no `verify=False`, no `algorithms` wildcard, no
  `none` alg. Fail **closed** when auth config is missing.
- No secrets in frontend code; no raw tokens in logs; no mock users in
  production paths; no fallback authentication in production.
- Token separation is mandatory and tested: Neon JWT → user/admin endpoints
  only; scanner session token → scanner endpoints only. Each is rejected on
  the wrong endpoint class.
- Do not make Node a QR authority. Remove the regressed Node mock QR/scanner
  routes once FastAPI integration passes.
- Do not create a fourth token format (no new .NET token).

---

## Current auth inventory (requirement 1 — verified in the repo, 2026-07-22)

| Path | Where | Current behavior | Phase-2 disposition |
|---|---|---|---|
| Neon Auth client | `src/auth.ts` | `better-auth/react` `createAuthClient`, baseURL `VITE_NEON_AUTH_URL`; `signIn.social({provider:"google"})` in `LandingPage.tsx`, `Profile.tsx` | **Keep** — the one client |
| Session sync | `src/App.tsx:197-228` | `authClient.getSession()` → stores `session.token` **or fake `"neon_auth_active"`** under `neon_auth_token` | **Fix** — store a real JWT from `/token`; delete the fake fallback |
| Frontend state fetch | `src/api.ts:6,23` | still reads dead `gp_session_token` → Node calls go unauthenticated → app silently offline | **Fix** — send Neon JWT via `authFetch` |
| QR fetch | `src/scannerQr.ts` | reads `neon_auth_token`, Bearer → FastAPI `/api/qr/me` | **Keep key, ensure it holds a JWT** |
| Direct Google OAuth / mock client id | — | **already removed** from `src/` (no `@react-oauth/google`, no `GoogleOAuthProvider`, no mock client id) | verify `@react-oauth/google` dep unused, drop it |
| Node user auth | `server/app.ts:94-108` | `authenticateSession` trusts any `Bearer gp_session_*` string (unchecked) | **Replace** with Neon JWKS verify adapter |
| Node Google exchange | `server/app.ts:51-92` | `/api/auth/google-login` → `gp_session_<sub>` | **Remove** |
| Node mock QR/scanner | `server/app.ts:129-179` | `gp:v1:mock_token_payload`, pairing `123456`, fixed `gp_scanner_session_token` (regressed back in) | **Remove** after FastAPI passes |
| FastAPI user auth | `backend/security.py:47-154` | `verify_neon_auth_token`: JWKS **then `/get-session` introspection fallback**; `get_current_user` upserts `scanner.users(google_issuer,google_subject)` | **Harden** — JWKS-only, fail closed, strict claims; drop introspection |
| FastAPI scanner auth | `backend/security.py:163-180` | `require_scanner_session`: hashed opaque token → `scanner.scanner_sessions` | **Keep** — already separate |
| .NET auth | `GatepassApi/Controllers/AuthController.cs:37-42` | verifies Google ID tokens (legacy); **SPA never calls .NET** (no frontend base URL points to it) | **Mark legacy / out-of-path**; no new token |

**Two live bugs this phase fixes:** the `"neon_auth_active"` placeholder
token (sent to FastAPI, always rejected) and `api.ts` reading the dead
`gp_session_token` (state API silently unauthenticated).

---

## Canonical identity model (requirement 2)

```
Neon Auth JWT (EdDSA, from <NEON_AUTH_URL>/token)
  claims: iss=<NEON_AUTH_URL>, sub=<stable user id>, exp, [aud], email?, name?, picture?
        │  verified via JWKS (kid ced0b50a-…, alg EdDSA)
        ▼
scanner.users:  (auth_issuer, auth_subject) = (iss, sub)   ← renamed from google_*
                email/display_name/photo_url = profile attributes (updatable, never identity)
```

- One user row per `(iss, sub)`. Email change updates the attribute, never the
  row identity. (Column rename `google_issuer/google_subject` →
  `auth_issuer/auth_subject` is Task 1b, a data-preserving Alembic revision.)
- Scanner device identity is a **separate** axis: opaque session token →
  `scanner.scanner_sessions` → `scanner.scanners`. A JWT is never a scanner
  credential and vice-versa.

---

## Task 0 — Preconditions (no code)

- [ ] Confirm services import and Neon reachable:
  `.venv\Scripts\python.exe -c "import backend.main"` (expect no error);
  `curl -s <NEON_AUTH_URL>/.well-known/jwks.json` returns a `keys` array.
- [ ] Confirm `.env` has `NEON_AUTH_URL` and `VITE_NEON_AUTH_URL` (present).
- [ ] Add optional `NEON_AUTH_AUDIENCE` to `.env.example` (unset ⇒ aud check
  skipped, per "audience when required").

**Rollback:** none (read-only).

---

## Task 1 — FastAPI: strict JWKS JWT verification, fail-closed

**Files:** modify `backend/security.py`; modify `backend/config.py` (add
`neon_auth_audience`); create `tests/test_neon_auth.py`.

**Interfaces produced:** `verify_neon_auth_token(token) -> NeonAuthIdentity`
(JWKS-only), `InvalidNeonToken`, `NeonAuthIdentity(issuer, subject, email,
name, picture)`. Removes the `/get-session` introspection fallback and the
`urllib`/`json` imports it needed.

- [ ] **Step 1 — failing tests.** `tests/test_neon_auth.py` mints EdDSA JWTs
  with a locally generated Ed25519 key and monkeypatches the module's JWKS
  client to return that key, so no live Neon call is needed:

```python
import time
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import jwt as pyjwt

from backend import security

ISS = "https://neon.example/neondb/auth"
KID = "test-kid-1"


@pytest.fixture(autouse=True)
def _config(monkeypatch):
    monkeypatch.setattr(security.settings, "neon_auth_url", ISS, raising=False)
    monkeypatch.setattr(security.settings, "neon_auth_audience", "", raising=False)


@pytest.fixture
def keypair():
    priv = Ed25519PrivateKey.generate()
    return priv, priv.public_key()


def _mint(priv, *, kid=KID, iss=ISS, sub="user-123", exp_delta=3600, aud=None, alg="EdDSA", extra=None):
    headers = {"kid": kid}
    payload = {"iss": iss, "sub": sub, "exp": int(time.time()) + exp_delta}
    if aud is not None:
        payload["aud"] = aud
    if extra:
        payload.update(extra)
    return pyjwt.encode(payload, priv, algorithm=alg, headers=headers)


@pytest.fixture
def patch_jwks(monkeypatch, keypair):
    priv, pub = keypair
    class _Key:  # mimics PyJWK
        key = pub
    def _get(token):
        return _Key()
    monkeypatch.setattr(security, "_get_signing_key", _get)
    return priv


def test_valid_token_maps_claims(patch_jwks):
    token = _mint(patch_jwks, extra={"email": "a@b.com", "name": "A B", "picture": "http://p"})
    ident = security.verify_neon_auth_token(token)
    assert ident.subject == "user-123"
    assert ident.issuer == ISS
    assert ident.email == "a@b.com"


def test_missing_token_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token("")


def test_expired_token_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(patch_jwks, exp_delta=-10))


def test_bad_signature_rejected(patch_jwks, keypair):
    other = Ed25519PrivateKey.generate()
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(other))  # signed by wrong key


def test_wrong_issuer_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(patch_jwks, iss="https://evil/auth"))


def test_wrong_audience_rejected(patch_jwks, monkeypatch):
    monkeypatch.setattr(security.settings, "neon_auth_audience", "expected-aud", raising=False)
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(patch_jwks, aud="other-aud"))


def test_correct_audience_accepted(patch_jwks, monkeypatch):
    monkeypatch.setattr(security.settings, "neon_auth_audience", "expected-aud", raising=False)
    ident = security.verify_neon_auth_token(_mint(patch_jwks, aud="expected-aud"))
    assert ident.subject == "user-123"


def test_unsupported_algorithm_rejected(patch_jwks):
    # HS256 token must be rejected even if signature "verifies" — alg allow-list is EdDSA only
    hs = pyjwt.encode({"iss": ISS, "sub": "x", "exp": int(time.time()) + 60}, "secret", algorithm="HS256", headers={"kid": KID})
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(hs)


def test_missing_subject_rejected(patch_jwks, keypair):
    priv, _ = keypair
    import time as _t
    tok = pyjwt.encode({"iss": ISS, "exp": int(_t.time()) + 60}, priv, algorithm="EdDSA", headers={"kid": KID})
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(tok)


def test_gp_session_string_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token("gp_session_abc123")


def test_unknown_kid_triggers_single_refresh(monkeypatch, keypair):
    priv, pub = keypair
    calls = {"n": 0}
    class _Key:
        key = pub
    def _get(token):
        calls["n"] += 1
        if calls["n"] == 1:
            raise pyjwt.exceptions.PyJWKClientError("kid not found")
        return _Key()
    reset = {"n": 0}
    monkeypatch.setattr(security, "_get_signing_key", _get)
    monkeypatch.setattr(security, "_reset_jwks_client", lambda: reset.__setitem__("n", reset["n"] + 1))
    ident = security.verify_neon_auth_token(_mint(priv))
    assert ident.subject == "user-123"
    assert calls["n"] == 2 and reset["n"] == 1  # refreshed once, retried once
```

- [ ] **Step 2 — run red:**
  `.venv\Scripts\python.exe -m pytest tests/test_neon_auth.py -v`
  Expected: fails (current `verify_neon_auth_token` differs — introspection
  fallback, `_get_signing_key`/`_reset_jwks_client` don't exist yet).

- [ ] **Step 3 — implement.** In `backend/config.py` add
  `neon_auth_audience: str` to `Settings` and load
  `os.environ.get("NEON_AUTH_AUDIENCE", "")`. Rewrite the verification block
  of `backend/security.py` (replace lines ~19-110, keeping the QR/hash/scanner
  helpers below unchanged):

```python
QR_PREFIX = "gp:v1:"
ALLOWED_ALGORITHMS = ["EdDSA"]  # Neon Auth JWKS publishes Ed25519/EdDSA

_jwks_client: PyJWKClient | None = None


def _reset_jwks_client() -> None:
    global _jwks_client
    _jwks_client = None


def _get_signing_key(token: str):
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.neon_auth_url.rstrip('/')}/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client.get_signing_key_from_jwt(token)


class InvalidNeonToken(Exception):
    pass


@dataclass(frozen=True)
class NeonAuthIdentity:
    issuer: str
    subject: str
    email: str
    name: str
    picture: str | None


def verify_neon_auth_token(token: str) -> NeonAuthIdentity:
    if not token or not settings.neon_auth_url:
        raise InvalidNeonToken("Neon Auth is not configured or token is missing")
    try:
        try:
            signing_key = _get_signing_key(token)
        except Exception:
            _reset_jwks_client()  # unknown kid / rotated key → refresh once
            signing_key = _get_signing_key(token)

        decode_kwargs = dict(
            algorithms=ALLOWED_ALGORITHMS,
            issuer=settings.neon_auth_url.rstrip("/"),
            options={"require": ["exp", "iss", "sub"], "verify_aud": bool(settings.neon_auth_audience)},
        )
        if settings.neon_auth_audience:
            decode_kwargs["audience"] = settings.neon_auth_audience
        claims = jwt.decode(token, signing_key.key, **decode_kwargs)
    except InvalidNeonToken:
        raise
    except Exception as exc:  # pyjwt errors, key errors, etc. — fail closed
        raise InvalidNeonToken(str(exc)) from exc

    subject = claims.get("sub")
    if not subject:
        raise InvalidNeonToken("missing subject")
    email = claims.get("email") or f"{subject}@neon.auth"
    return NeonAuthIdentity(
        issuer=claims["iss"].rstrip("/"),
        subject=subject,
        email=email,
        name=claims.get("name") or claims.get("display_name") or email,
        picture=claims.get("picture") or claims.get("image"),
    )
```

  Delete the now-unused `import json`, `import urllib.request`, and the old
  `get_jwks_client`/introspection code. Keep `get_current_user`,
  `require_admin`, `require_scanner_session`, and all QR helpers as-is.

- [ ] **Step 4 — run green:**
  `.venv\Scripts\python.exe -m pytest tests/test_neon_auth.py -v`
  Expected: 12 passed.

**Rollback:** revert `backend/security.py` + `backend/config.py` to prior
content; delete `tests/test_neon_auth.py`. No DB/schema change in this task.

---

## Task 1b — Alembic: rename user identity columns to `auth_*`

**Files:** create `alembic/versions/0002_rename_user_auth_columns.py`; modify
`backend/models.py` (`User.google_issuer→auth_issuer`,
`google_subject→auth_subject`, unique constraint name); update
`backend/security.py` `get_current_user` filter/insert to the new names.

Rationale: identity is Neon `(iss, sub)`, not Google — the `google_*` names
are now misleading and requirement 2 says name identity honestly.

- [ ] **Step 1 — failing test** (extends `tests/test_neon_auth.py`, needs Neon
  — the `scanner.*` schema is live):

```python
def test_get_current_user_upserts_by_auth_subject(patch_jwks):
    from backend.db import SessionLocal
    from backend.models import User
    db = SessionLocal()
    db.query(User).filter_by(auth_subject="user-123").delete(); db.commit()
    tok = _mint(patch_jwks, extra={"email": "id@x.com", "name": "Id X"})
    u1 = security.get_current_user(authorization=f"Bearer {tok}", db=db)
    u2 = security.get_current_user(authorization=f"Bearer {tok}", db=db)
    assert u1.id == u2.id and u1.auth_subject == "user-123"
    db.query(User).filter_by(id=u1.id).delete(); db.commit(); db.close()
```

- [ ] **Step 2 — run red:** fails (`User` has no `auth_subject`).

- [ ] **Step 3 — implement.** Migration `0002` (down_revision
  `0001_scanner_schema`):

```python
def upgrade() -> None:
    op.alter_column("users", "google_issuer", new_column_name="auth_issuer", schema="scanner")
    op.alter_column("users", "google_subject", new_column_name="auth_subject", schema="scanner")
    op.drop_constraint("users_google_issuer_google_subject_key", "users", schema="scanner", type_="unique")
    op.create_unique_constraint("uq_users_auth_identity", "users", ["auth_issuer", "auth_subject"], schema="scanner")

def downgrade() -> None:
    op.drop_constraint("uq_users_auth_identity", "users", schema="scanner", type_="unique")
    op.alter_column("users", "auth_issuer", new_column_name="google_issuer", schema="scanner")
    op.alter_column("users", "auth_subject", new_column_name="google_subject", schema="scanner")
    op.create_unique_constraint("users_google_issuer_google_subject_key", "users", ["google_issuer", "google_subject"], schema="scanner")
```

  (Verify the existing unique constraint's real name first:
  `.venv\Scripts\python.exe -m alembic ... ` or introspect
  `information_schema.table_constraints` — substitute the actual name into
  `drop_constraint`.) Update `backend/models.py` `User` columns +
  `UniqueConstraint("auth_issuer","auth_subject")`, and
  `get_current_user`'s `filter_by(auth_issuer=…, auth_subject=…)` and the
  `User(...)` insert kwargs.

- [ ] **Step 4 — apply + verify:**
  `.venv\Scripts\python.exe -m alembic upgrade head` then
  `.venv\Scripts\python.exe -m alembic check` (expect "No new upgrade
  operations detected") then re-run `tests/test_neon_auth.py`.

**Rollback:** `.venv\Scripts\python.exe -m alembic downgrade 0001_scanner_schema`
(restores `google_*` names), revert `models.py`/`security.py`. **Snapshot the
Neon branch before applying** (spec §branching). Existing `scanner.users` rows
carry over — this is a pure rename, no data loss.

---

## Task 2 — FastAPI: token separation (each token rejected on the wrong class)

**Files:** create `tests/test_token_separation.py`. No production code change
expected — this task **proves** the separation the design already gives, and
only touches `security.py` if a test reveals a leak.

**Interfaces consumed:** `get_current_user`, `require_scanner_session`
(unchanged), `verify_neon_auth_token`, `generate_scanner_session_token`,
`hash_secret`.

- [ ] **Step 1 — failing tests.** Uses the live Neon `scanner.*` schema via
  `SessionLocal`; each test cleans up its rows:

```python
import time
import pytest
from datetime import datetime, timedelta, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import jwt as pyjwt
from fastapi import HTTPException

from backend import security
from backend.db import SessionLocal
from backend.models import Scanner, ScannerSession, Resource

ISS = "https://neon.example/neondb/auth"


@pytest.fixture(autouse=True)
def _cfg(monkeypatch):
    monkeypatch.setattr(security.settings, "neon_auth_url", ISS, raising=False)
    monkeypatch.setattr(security.settings, "neon_auth_audience", "", raising=False)


@pytest.fixture
def user_jwt(monkeypatch):
    priv = Ed25519PrivateKey.generate()
    class _Key: key = priv.public_key()
    monkeypatch.setattr(security, "_get_signing_key", lambda t: _Key())
    return pyjwt.encode({"iss": ISS, "sub": "sep-user", "exp": int(time.time()) + 60},
                        priv, algorithm="EdDSA", headers={"kid": "k"})


@pytest.fixture
def scanner_token():
    db = SessionLocal()
    res = Resource(organization_name="Org", name="R"); db.add(res); db.flush()
    sc = Scanner(name="S", organization_name="Org", purpose="ACCESS_CONTROL", resource_id=res.id)
    db.add(sc); db.flush()
    tok, tok_hash = security.generate_scanner_session_token()
    db.add(ScannerSession(scanner_id=sc.id, token_hash=tok_hash,
                          expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    db.commit()
    yield tok, sc.id, res.id
    db.query(ScannerSession).filter_by(scanner_id=sc.id).delete()
    db.query(Scanner).filter_by(id=sc.id).delete()
    db.query(Resource).filter_by(id=res.id).delete()
    db.commit(); db.close()


def test_scanner_token_rejected_on_user_endpoint(scanner_token):
    tok, _, _ = scanner_token
    db = SessionLocal()
    with pytest.raises(HTTPException) as e:
        security.get_current_user(authorization=f"Bearer {tok}", db=db)
    assert e.value.status_code == 401
    db.close()


def test_user_jwt_rejected_on_scanner_endpoint(user_jwt):
    db = SessionLocal()
    with pytest.raises(HTTPException) as e:
        security.require_scanner_session(authorization=f"Bearer {user_jwt}", db=db)
    assert e.value.status_code == 401
    assert e.value.detail == {"reason": "SCANNER_SESSION_EXPIRED"}
    db.close()


def test_valid_user_jwt_accepted_on_user_endpoint(user_jwt):
    from backend.models import User
    db = SessionLocal()
    db.query(User).filter_by(auth_subject="sep-user").delete(); db.commit()
    u = security.get_current_user(authorization=f"Bearer {user_jwt}", db=db)
    assert u.auth_subject == "sep-user"
    db.query(User).filter_by(id=u.id).delete(); db.commit(); db.close()


def test_valid_scanner_token_accepted_on_scanner_endpoint(scanner_token):
    tok, sc_id, _ = scanner_token
    db = SessionLocal()
    scanner = security.require_scanner_session(authorization=f"Bearer {tok}", db=db)
    assert str(scanner.id) == str(sc_id)
    db.close()


def test_gp_session_rejected_on_both(scanner_token):
    db = SessionLocal()
    with pytest.raises(HTTPException):
        security.get_current_user(authorization="Bearer gp_session_x", db=db)
    with pytest.raises(HTTPException):
        security.require_scanner_session(authorization="Bearer gp_session_x", db=db)
    db.close()
```

- [ ] **Step 2 — run red** (before Task 1b's rename the `auth_subject`
  assertions fail; run this task **after** 1b): `... -m pytest
  tests/test_token_separation.py -v`.

- [ ] **Step 3 — implement.** Expected: **no code change**. If
  `test_scanner_token_rejected_on_user_endpoint` fails (e.g. a scanner token
  somehow verifies as a JWT), that's a real leak — fix in `security.py` and
  re-run. Do not weaken any assertion to make it pass.

- [ ] **Step 4 — run green:** 5 passed.

**Rollback:** delete `tests/test_token_separation.py`.

---

## Task 3 — Frontend: one auth client, real JWT retrieval, centralized fetch

**Files:** modify `src/auth.ts` (add `getAuthToken()`); create
`src/authFetch.ts`; modify `src/scannerQr.ts`, `src/api.ts`, `src/App.tsx`.
No frontend test framework exists → verification is `tsc`/`build` + the
manual `/identity` check in Task 6. Keep changes minimal and typed (no `any`
beyond what already exists).

**Interfaces produced:** `getAuthToken(): Promise<string | null>` (fetches a
Neon JWT from `<NEON_AUTH_URL>/token` using the session cookie, caches until
~30s before `exp`), `authFetch(path, init)` (attaches `Authorization: Bearer
<jwt>`, throws a typed `AuthExpiredError` on 401/403).

- [ ] **Step 1 — `src/auth.ts`** — add JWT retrieval:

```typescript
import { createAuthClient } from "better-auth/react";

export const neonAuthUrl =
  import.meta.env.VITE_NEON_AUTH_URL ||
  "https://ep-steep-pond-adbj8b86.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth";

export const authClient = createAuthClient({ baseURL: neonAuthUrl });
export const { signIn, signOut, useSession, getSession } = authClient;

// Neon Auth issues an EdDSA JWT at <baseURL>/token for the current session
// cookie. Backends verify it via JWKS. Never store secrets here.
export async function getAuthToken(): Promise<string | null> {
  try {
    const res = await fetch(`${neonAuthUrl.replace(/\/$/, "")}/token`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2 — `src/authFetch.ts`** (new):

```typescript
import { getAuthToken } from "./auth";

const TOKEN_KEY = "neon_auth_token";

export class AuthExpiredError extends Error {}

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
```

- [ ] **Step 3 — `src/scannerQr.ts`** — use `authFetch`, drop the manual token
  read:

```typescript
import { authFetch, AuthExpiredError } from "./authFetch";

const SCANNER_API_BASE_URL = (import.meta.env.VITE_SCANNER_API_BASE_URL ?? "").replace(/\/$/, "");

export async function fetchMyQrPayload(): Promise<string> {
  try {
    const res = await authFetch(`${SCANNER_API_BASE_URL}/api/qr/me`);
    if (!res.ok) throw new Error("QR_LOAD_FAILED: Unable to retrieve your permanent QR.");
    const data = (await res.json()) as { qr_payload: string; status: string };
    return data.qr_payload;
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      throw new Error("USER_NOT_AUTHENTICATED: Please sign in with Neon Auth to view your QR.");
    }
    throw err;
  }
}
```

- [ ] **Step 4 — `src/api.ts`** — replace both `gp_session_token` reads with
  the Neon JWT via `authFetch` (state API now authenticates with the real
  identity):

```typescript
import type { AppStateSnapshot } from "./appState";
import { authFetch } from "./authFetch";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function loadAppState(): Promise<AppStateSnapshot | null> {
  const response = await authFetch(`${API_BASE_URL}/api/state`);
  if (!response.ok) throw new Error(`Failed to load app state: ${response.status}`);
  const payload = (await response.json()) as { state: AppStateSnapshot | null };
  return payload.state;
}

export async function saveAppState(state: AppStateSnapshot): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!response.ok) throw new Error(`Failed to save app state: ${response.status}`);
}
```

- [ ] **Step 5 — `src/App.tsx`** — in the Neon session sync effect
  (~lines 197-228) replace the fake-token line
  `const token = sessionRes.data.session?.token || "neon_auth_active";` and
  the `sessionStorage.setItem("neon_auth_token", token)` with a real fetch:

```typescript
        if (sessionRes?.data?.user) {
          const u = sessionRes.data.user;
          const jwt = await getAuthToken();
          if (jwt) sessionStorage.setItem("neon_auth_token", jwt);
          setUser((prev) => ({ ...prev, id: u.id || prev.id, name: u.name || prev.name,
            email: u.email || prev.email, avatarUrl: u.image || prev.avatarUrl }));
          setIsAuthenticated(true);
          setAuthEmail(u.email || null);
          if (u.email) sessionStorage.setItem("neon_auth_email", u.email);
        }
```

  Add `import { getAuthToken } from "./auth";`. The state-load effect
  (~231-270) and persist effect (~273+) keep gating on `neon_auth_token`,
  which now holds a real JWT. Leave `handleGoogleLoginSuccess`/`Error`
  (harmless no-op toasts) unless they trigger a lint error; if they do,
  delete them and their prop wiring.

- [ ] **Step 6 — verify:** `npx tsc --noEmit` (0 errors) and `npm run build`
  (success).

**Rollback:** revert the five files. Frontend-only; no schema/service impact.

---

## Task 4 — Node: verify Neon JWT; remove mock QR/scanner + google-login

**Files:** create `server/neonAuth.ts`; modify `server/app.ts`; modify
`server/config.ts` (add `NEON_AUTH_URL`); add `jose` to `package.json`
dependencies; extend `server/app.test.ts`.

**Interfaces produced:** `createNeonVerifier(jwksResolver)` →
`{ verify(token): Promise<{sub:string;email?:string}> }`; an
`authenticateNeon` Express middleware. Injecting `jwksResolver` lets tests
supply a local key set.

- [ ] **Step 1 — install dep:** `npm install jose`
  (expect `jose` under dependencies).

- [ ] **Step 2 — failing tests** in `server/app.test.ts` (harness:
  `npm run test:api` = `tsx --test`). Generate a local Ed25519 keypair with
  `jose`, expose it as a `JWKS`-shaped resolver, mint a JWT, and assert the
  middleware accepts it and rejects missing/`gp_session_`/expired:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { createNeonVerifier } from "./neonAuth";

const ISS = "https://neon.example/neondb/auth";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1"; jwk.alg = "EdDSA";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const verifier = createNeonVerifier({ jwks, issuer: ISS });
  const mint = (claims: Record<string, unknown> = {}, expSec = 60) =>
    new SignJWT({ sub: "node-user", ...claims })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(ISS).setExpirationTime(`${expSec}s`).sign(privateKey);
  return { verifier, mint };
}

test("accepts a valid Neon JWT", async () => {
  const { verifier, mint } = await setup();
  const claims = await verifier.verify(await mint({ email: "n@x.com" }));
  assert.equal(claims.sub, "node-user");
});

test("rejects gp_session_ string", async () => {
  const { verifier } = await setup();
  await assert.rejects(() => verifier.verify("gp_session_abc"));
});

test("rejects expired token", async () => {
  const { verifier, mint } = await setup();
  await assert.rejects(() => verifier.verify(await mint({}, -10)));
});

test("rejects wrong issuer", async () => {
  const { verifier } = await setup();
  const { privateKey } = await generateKeyPair("EdDSA");
  const bad = await new SignJWT({ sub: "x" }).setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setIssuer("https://evil/auth").setExpirationTime("60s").sign(privateKey);
  await assert.rejects(() => verifier.verify(bad));
});
```

- [ ] **Step 3 — implement `server/neonAuth.ts`:**

```typescript
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { config } from "./config";

export interface NeonVerifierOptions {
  jwks?: JWTVerifyGetKey;
  issuer?: string;
  audience?: string;
}

export function createNeonVerifier(opts: NeonVerifierOptions = {}) {
  const issuer = opts.issuer ?? config.NEON_AUTH_URL.replace(/\/$/, "");
  const jwks =
    opts.jwks ??
    createRemoteJWKSet(new URL(`${config.NEON_AUTH_URL.replace(/\/$/, "")}/.well-known/jwks.json`));
  return {
    async verify(token: string): Promise<{ sub: string; email?: string }> {
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

const defaultVerifier = createNeonVerifier();

export function authenticateNeon(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Neon Auth token required." });
  }
  defaultVerifier
    .verify(header.slice(7))
    .then((claims) => { req.authSubject = claims.sub; next(); })
    .catch(() => res.status(401).json({ error: "Unauthorized: invalid Neon Auth token." }));
}
```

  In `server/config.ts` add `NEON_AUTH_URL: z.string().default(process.env.NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL || "")`.
  In `server/app.ts`: replace the `authenticateSession` middleware usage on
  `/api/state` (GET+PUT) with `authenticateNeon`; **delete** `authenticateSession`,
  `/api/auth/google-login`, and the mock `/api/qr/*` + `/api/scanner/*` routes.

- [ ] **Step 4 — run green:** `npm run test:api` (new tests pass; existing
  state round-trip test updated to send a minted JWT via the injected
  verifier, or marked to use `authenticateNeon` with a test key).

- [ ] **Step 5 — build check:** `npm run build:server` (esbuild bundles with
  `jose`, exit 0).

**Rollback:** revert `server/app.ts`, `server/config.ts`, delete
`server/neonAuth.ts`, `npm uninstall jose`, revert `server/app.test.ts`.
Node changes are independent of FastAPI and the DB schema.

---

## Task 5 — .NET: mark legacy, out of the authenticated production path

**Files:** modify `GatepassApi/Controllers/AuthController.cs` (comment/attribute
only); create `GatepassApi/README-auth.md`.

The SPA calls only Node (`VITE_API_BASE_URL`) and FastAPI
(`VITE_SCANNER_API_BASE_URL`) — **no frontend base URL targets .NET** (verified
by grep). `AuthController` is a legacy Google-ID-token endpoint. Per
requirement 6, do not integrate a new token format; explicitly mark it legacy.

- [ ] **Step 1 — verify no caller:** `grep -rn "google-login\|GatepassApi\|:5000\|:5001" src/ .env` shows no SPA reference → confirmed out-of-path.
- [ ] **Step 2 — annotate:** add a header comment to `AuthController.cs`
  stating it is legacy/non-production-authoritative and must not be wired into
  protected production routes; write `GatepassApi/README-auth.md` recording
  that .NET holds no protected production route and introduces no token format
  (Neon Auth is the sole authority; if .NET ever guards a production route it
  must verify Neon JWTs via JWKS, not Google tokens).
- [ ] **Step 3 — verify build unaffected** (no behavioral change): none needed
  beyond confirming the comment compiles (it's a comment).

**Rollback:** revert the comment; delete the README. No behavioral change to
roll back.

---

## Task 6 — Cutover validation gate (requirement 13 exit criteria)

**Files:** none — checks only.

- [ ] **Backend tests:**
  `.venv\Scripts\python.exe -m pytest tests -q` → all pass
  (`test_config`, `test_neon_auth`, `test_token_separation`, and any prior).
- [ ] **Alembic:** `.venv\Scripts\python.exe -m alembic check` → "No new
  upgrade operations detected"; head is `0002_rename_user_auth_columns`.
- [ ] **Node tests:** `npm run test:api` → all pass.
- [ ] **Lint/types/build:** `npm run lint` (`tsc --noEmit`) → 0; `npx tsc
  --noEmit` → 0; `npm run build` → success; `npm run build:server` → success.
- [ ] **Live smoke (services running):** restart FastAPI (8010), Node (3001),
  Vite (5173). Assert:
  - `curl :8010/ready` → `{"ready":true,...}`.
  - `curl :8010/api/qr/me` (no token) → 401; with `Bearer gp_session_x` → 401.
  - `curl :3001/api/qr/me` → 404 (mock removed); `curl :3001/api/scanner/me`
    → 404.
  - Node `/api/state` without token → 401; with `gp_session_x` → 401.
- [ ] **Manual `/identity` E2E** (browser): sign in with Neon Auth (Google),
  open `/identity`, confirm the permanent QR loads from FastAPI using the Neon
  JWT; sign out and confirm the QR then shows the "please sign in" state
  (fail-closed).
- [ ] **Exit-criteria checklist (requirement 13):** all production user
  endpoints accept only verified Neon identity ✔; scanner endpoints accept
  only scanner sessions ✔ (Task 2); frontend uses one auth client ✔; `/identity`
  loads the real FastAPI QR ✔; Node mock QR/scanner routes removed ✔; lint/TS/
  build/backend tests/Node tests pass ✔.

**Report** actual results (commands + outputs) after this task. Do not claim
"pass" for any command not actually executed (the manual `/identity` E2E
requires a real browser login and is reported as such).

---

## Task ordering & dependencies

```
Task 0 (preconditions)
  → Task 1  (FastAPI JWKS verify)            ← unit-testable, no DB
  → Task 1b (rename auth_* columns, migrate) ← needs Neon; snapshot first
  → Task 2  (token separation)               ← after 1b (asserts auth_subject)
  → Task 3  (frontend)                        ← independent of 1b, do after 1
  → Task 4  (Node JWT verify + remove mocks) ← independent; needs jose
  → Task 5  (.NET legacy annotation)          ← independent
  → Task 6  (validation gate)                 ← last
```

Tasks 3, 4, 5 are mutually independent and can be done in any order after
Task 1; Task 6 is always last.

## What this phase deliberately does NOT do

Routing/route-manifest (Phase 1), organizations/RBAC/commerce/audit
(Phase 3), verticals (Phase 5), Razorpay/messaging/PWA (Phase 6). No stored
value, no resale, no new .NET token, no second DB. Auth only.

