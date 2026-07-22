# GatePass Neon-Native Super-App — Program Plan (Phased Decomposition)

> **This is a program plan, not a single implementation plan.** It decomposes
> the "Neon-Native GatePass Nationwide Super-App" spec into independently
> shippable phases. Each phase gets its **own** detailed task-level plan
> (`docs/superpowers/plans/YYYY-MM-DD-gatepass-phaseN-*.md`) written with
> `superpowers:writing-plans` when that phase starts — do not expand all
> phases up front (most later scope is speculative or approval-gated).

**Program goal:** Evolve today's event-ticketing app into a Neon-Postgres +
Neon-Auth multi-vertical PWA, released publicly together but developed behind
feature flags.

**Guiding rule for this plan:** every phase must leave the app *working and
releasable*. No phase may half-migrate auth, the database, or routing and
leave `main` broken.

---

## 0. Ground truth — what actually exists today (2026-07-22)

Verified in the repo, not assumed. This is the real starting line; the spec
describes the destination.

**Three backends already coexist:**
- **Node/Express** (`server/`, Railway) — owns `/api/state` (the client JSON
  blob), `/api/auth/google-login` (Google `tokeninfo` → `gp_session_<sub>`
  string), and its `PostgresAppStateStore` **truncates + re-inserts** the
  `public` reporting tables on every save (`server/store.ts`). It currently
  **also re-hosts mock QR/scanner routes** (`/api/qr/me` →
  `gp:v1:mock_token_payload`, `/api/scanner/pair` with `123456`) — a
  regression to be removed in Phase 3.
- **.NET** (`GatepassApi/`) — maps only `app_state`. Untouched by this program.
- **FastAPI** (`backend/`) — the newest layer. Owns the Neon `scanner.*`
  schema (13 tables, Alembic head `0001_scanner_schema`), is the QR
  authority (HMAC-signed `gp:v1:<public_id>.<sig>`, verified end-to-end
  against Neon), and has **already begun the Neon Auth migration**:
  `backend/security.py::verify_neon_auth_token` (JWKS + `/get-session`
  introspection fallback), `backend/config.py` now carries `neon_auth_url`
  (Google client id field removed).

**Database:** Neon Postgres is live (`DATABASE_URL` pooled, `-pooler`,
`sslmode=require`). `scanner.*` schema owned by FastAPI/Alembic. `public.*`
holds the Node blob + reporting tables **plus orphan `gp_*` tables** from a
dead earlier build (ignore/clean later; not FK-referenced).

**Auth:** mid-migration. Neon Auth (`better-auth` installed, `NEON_AUTH_URL`
+ `VITE_NEON_AUTH_URL` set) is being adopted; Node still issues
`gp_session_<sub>`; frontend `scannerQr.ts` already reads a `neon_auth_token`
sessionStorage key. **This is the single most load-bearing in-flight change**
and Phase 2 must finish it coherently.

**Frontend:** React 19 + Vite 6 + `react-router-dom@7` (already using
`<Routes>`/`<Route>` inline in `src/App.tsx`, not a route manifest). Pages in
`src/pages/`: Home, Events, Organizer, Scanner (in-app simulation), Profile
(identity/QR), Approvals, Wallet, RequestAccess, LandingPage. `IS_DEMO_MODE =
true` bypasses role gating.

**Already done (do not re-plan):** Alembic + `scanner.*` migration on Neon;
FastAPI QR generation service; `/health` + `/ready`.

---

## Global Constraints (bind every phase)

Copied from the spec; every phase's own plan inherits these verbatim.

- **Neon is the only production DB.** SQLite is test-only, and only where
  Postgres behavior is irrelevant. `DATABASE_URL` = pooled (`-pooler`,
  `sslmode=require`, `channel_binding=require`); `DIRECT_DATABASE_URL` =
  direct, used **only** by migrations/backups/admin scripts. Small pool per
  process, `pool_pre_ping`, request-scoped sessions. (This program keeps the
  FastAPI service's existing `SCANNER_DATABASE_URL`/
  `SCANNER_MIGRATIONS_DATABASE_URL` split, which already realizes the
  pooled-vs-direct rule.)
- **No `Base.metadata.create_all()` in production startup.** Alembic only;
  startup may *verify* the migration version, never mutate schema.
- **Neon Auth is the only production login** (Google + email; MSG91 phone
  optional, never required for checkout). Verify JWKS with rotation/`kid`/
  alg/iss/aud/exp/skew, one refresh retry on unknown key. Identity =
  immutable Neon `sub`. No production passwords stored; no duplicate Neon
  sessions. First authenticated request atomically upserts the GatePass
  profile by `sub`; email changes never change ownership IDs.
- **FastAPI is the only public data-access layer.** Never expose Neon Data
  API tables to browsers.
- **No second production DB, no stored-value wallet, no paid resale, no
  private messaging, no native apps, no speculative microservices.**
- **Release together, develop behind feature flags.**
- **India-only launch:** INR, GST-aware pricing, UTC storage / local display,
  English + Hindi. Money/security/concurrency paths are never simplified away.
- **No overselling / no duplicate payment effects / no duplicate scans /
  no duplicate transfers**, proven under concurrency with real Neon branches.

---

## Phase map (dependency-ordered)

```
P1 Foundations ─┬─ P2 Neon Auth (finish migration) ─┬─ P4 Events→shared core
 (Neon cfg,     │                                    ├─ P5 Verticals + discovery
  routing,      └─ P3 Platform data model            ├─ P6 Integrations (gated)
  Alembic,          (orgs/RBAC/commerce/             └─ P7 Release rehearsal
  branches)          credentials/audit)
```

P1→P2→P3 are the critical path and are **buildable now with no external
approvals**. P4/P5 depend on P3. P6 is **approval-gated** (Razorpay Route,
WhatsApp, MSG91 DLT, KYC) — code can be written behind flags but cannot be
production-validated here. P7 is the cutover.

---

## Phase 1 — Foundations: Neon config discipline + route contract

**Independently shippable?** Yes — pure refactor, no behavior removed.
**External approvals?** None. **Detailed plan:** to be written at phase start.

**Goal:** make configuration explicit and give every screen a stable deep
link, without changing what the app does yet.

**Scope (buildable now):**
1. **Config/DB discipline (mostly already true for FastAPI):** confirm
   pooled vs direct split, `pool_pre_ping`, request-scoped sessions,
   transaction timeout; add a **startup migration-version check** (compare
   `scanner.alembic_version` to the code's head; log/refuse on mismatch, never
   auto-migrate). Add `DIRECT_DATABASE_URL` to `.env.example`. Enable +
   migration-test `pg_trgm` (PostGIS deferred to P5 discovery).
2. **Route contract:** replace the inline `<Routes>` in `src/App.tsx` with a
   **route manifest** (`src/routes/manifest.ts`: `path`, `title`, `roles`,
   `nav`, `breadcrumbs`, `featureFlag`) + nested layouts + lazy feature
   modules + route-level guard + loading/error boundaries. Only wire routes
   whose screens exist today; register future paths as flag-off stubs so the
   manifest is the single source of truth without shipping empty screens.
3. **Legacy aliases** (preserve query params + safe `returnTo`):
   `/approvals→/account/access`, `/req-acc→/account/access/request`,
   `/control-room→/organizer/dashboard`,
   `/reconciliation→/organizer/finance/reconciliation`, `/wallet→/passes`.
   `/admin`, `/events`, `/forbidden` canonical.
4. **SPA hard-refresh fallback** serves every route (FastAPI static fallback
   already does this for its host; ensure Node/Vite dev parity + a real 404).

**Exit criteria:** every canonical + legacy URL resolves on direct paste,
hard refresh, in-app nav, and unknown paths 404; `tsc`/`build` green; app
behaves exactly as before otherwise.

**Feature flag:** `ff.newRouting` (default on once verified; the manifest
gates unbuilt areas).

---

## Phase 2 — Finish the Neon Auth migration (single identity)

**Independently shippable?** Yes, and it must be atomic — no mixed auth.
**External approvals?** None (Neon Auth project already provisioned).
**Detailed plan:** to be written at phase start. **Highest-risk phase.**

**Goal:** one login path. Neon Auth issues identity everywhere; delete the
`gp_session_<sub>` string scheme; FastAPI stays the QR/scanner authority
keyed on Neon `sub`.

**Scope (buildable now — reconciles the in-flight change already in the tree):**
1. **Frontend:** adopt `better-auth`/Neon Auth client fully; all flows return
   through `/auth/callback`; store the Neon token under the `neon_auth_token`
   key `scannerQr.ts` already expects; render explicit recoverable states for
   OAuth success/cancel/expired/JWKS-down/invalid-`returnTo`/missing-profile
   (no white page). Remove `@react-oauth/google` GoogleLogin usage.
2. **FastAPI:** harden `verify_neon_auth_token` — the current `/get-session`
   introspection fallback is a network call in the hot path; keep JWKS
   (rotation, `kid`, alg allow-list, iss/aud/exp/skew, one refresh retry) as
   the primary and treat introspection as an explicit, rate-limited fallback
   only. Confirm `scanner.users(google_issuer, google_subject)` maps to Neon
   `(iss, sub)` (rename columns to `auth_issuer/auth_subject` via migration
   for honesty — currently named `google_*`).
3. **Node:** stop minting `gp_session_<sub>`; `/api/state` auth must accept a
   verified Neon token (or move state reads behind FastAPI later). Remove
   `/api/auth/google-login`. Remove the re-added Node mock QR/scanner routes
   (folds Phase 3's "regression" item forward if convenient).
4. **Superadmin bootstrap:** remove any auto-created password admin; seed
   admins only after their Neon user exists, via an auditable one-time
   command reading `GATEPASS_ADMIN_EMAILS`.

**Exit criteria:** sign-up, Google+email login, logout, key rotation, expired
JWT, wrong iss/aud, disabled user, deep-link OAuth restoration all behave
correctly; no code path accepts `gp_session_` anymore; QR endpoint works with
a Neon token end-to-end.

**Feature flag:** `ff.neonAuth` — but auth cannot be half-on; the flag gates
the *cutover commit*, not a runtime mix.

**Migration note:** `scanner.users` currently keys on `(google_issuer,
google_subject)`. Renaming to `auth_*` is one Alembic revision; existing rows
carry over (values are already Neon `sub` once P2 lands). Snapshot the Neon
branch before this migration.

---

## Phase 3 — Shared platform data model (orgs, RBAC, commerce, audit)

**Independently shippable?** Yes as additive migrations + APIs behind flags.
**External approvals?** None. **Detailed plan:** to be written at phase start.
This is the biggest schema phase — its plan will itself be multi-part.

**Goal:** the shared core every vertical rides on, all in `scanner.*` (or a
new `platform` schema — decide at phase start; keep the no-FK-to-`public`
rule).

**Scope (buildable now):**
- **Identity/tenancy:** `organizations`, `memberships`, scoped permissions;
  system roles `superadmin/admin/finance/support`; org roles
  `owner/manager/catalog_manager/box_office/scanner/vendor_operator/viewer`.
- **Commerce core:** shared `Listing`, `Offer`, `Availability`,
  `InventoryHold` (10-min holds, row locks, unique constraints → no
  oversell), `Order`, `Payment`, `Booking`, `Credential`,
  `RefundPolicySnapshot`, `FeeSnapshot` (effective-dated fees snapshotted
  onto orders).
- **Ops:** supplier KYC, subscription plans, consent, support cases,
  **immutable audit events**.
- **API surface:** introduce `/api/v1` groups (catalog, search, checkout,
  orders, payments, bookings, credentials, transfers, organizations,
  organizer, partner, scans, POS, notifications, support, admin, webhooks).
  **Generate frontend TS types from FastAPI OpenAPI** to kill the current
  role/response drift between Node and the React app.
- **Transfers (fold in existing scanner transfer design):** free; recipient
  claims with matching Neon email; old credential revoked atomically; new
  issued; QR image never sent.
- **Remove:** `LegacyState`, demo payment references, obsolete duplicate
  components, any startup schema creation. Fix the `server/store.ts`
  truncate-and-resync hazard (or retire those reporting tables) so it can
  never wipe rows other systems depend on.

**Exit criteria:** tenant isolation + supplier restrictions provable across
every `/api/v1` endpoint; oversell/double-pay/double-transfer impossible
under concurrency (real Neon branch tests); OpenAPI-generated types compile.

**Feature flags:** `ff.orgs`, `ff.commerceCore` (per-endpoint gating).

---

## Phase 4 — Connect existing events to the shared core

**Independently shippable?** Yes. **Approvals?** None (real payments = P6).
**Goal:** re-point today's event/ticket/scanner features at P3's shared
commerce/access/credential core instead of the JSON blob. Events keep
sessions, tiers, seating, guest lists, access approvals, teams, scanners,
promotions, manual orders, analytics — now backed by shared records. This is
the proof that the shared core is real before adding new verticals.

**Exit criteria:** full event flow (browse→checkout→ticket→transfer→scan→
refund→settlement) runs on `scanner.*`/platform tables with the blob no
longer authoritative for events.

---

## Phase 5 — New verticals + discovery + partner/admin catalog

**Independently shippable?** Per-vertical, behind flags. **Approvals?** None
for the software; content/supplier onboarding is operational.
**Goal:** movies, dining, artists, activities/venues as shared-core
consumers, each preserving its vertical inventory (spec §"Preserve
vertical-specific inventory"); nationwide discovery via Postgres FTS/trigram
+ **PostGIS** (enable + migration-test here); **rules-based** recommendations
(no ML service); follows/favorites/reviews/sharing only. Partner (supplier)
tools: availability + fulfillment of **approved** listings only — no
self-publish, no fee changes, no KYC bypass. Admin catalog management +
approvals.

**Exit criteria:** each vertical's full flow tested on a Neon branch; discovery
returns correct geo/text results; supplier restrictions enforced.

**Feature flags:** `ff.movies`, `ff.dining`, `ff.artists`, `ff.activities`,
`ff.discovery` (each independently toggleable).

---

## Phase 6 — Integrations (APPROVAL-GATED — code now, validate later)

**Independently shippable?** Code yes, production validation **no** without
external approvals. **Goal:** wire the real-world integrations behind flags.

- **Payments:** Razorpay Orders/Checkout; **Route** linked accounts for
  marketplace splits; **Subscriptions** for organizer plans. Store+verify raw
  webhooks, dedupe provider event IDs, tolerate duplicate/out-of-order before
  state change. UPI Intent / dynamic QR (not deprecated Collect). **QR/RFID
  never stores funds; POS = ordinary Razorpay/cash txn.**
- **Messaging:** WhatsApp Cloud API, MSG91 SMS/OTP, Resend email — via a
  **Neon-backed outbox worker** (consent, templates, delivery events,
  suppression, retries).
- **Storage:** S3-compatible for media + private KYC docs; Neon stores only
  metadata/ownership/hashes/audit.
- **PWA:** installable shell, update prompt, offline pass display, Web Push;
  responsive attendee/organizer/scanner/POS modes.
- **Scanning:** online authoritative; optional offline = short-lived
  device-bound signed manifests, conflict-report on sync. QR cameras direct;
  RFID via vendor-neutral keyboard-wedge / local-bridge adapters.

**Hard gates (cannot be satisfied in this environment):** Razorpay
Gateway/Route/Subscriptions approval, WhatsApp approval, **MSG91 India DLT
registration**, verified email domains, supplier KYC/contracts, RFID hardware
certification. Each integration ships flag-off until its gate clears.

---

## Phase 7 — Release rehearsal + single public cutover

Rehearse the whole release on a disposable Neon branch; snapshot/PITR the
production branch immediately before the one migration; run migration + smoke
checks; flip flags on together. Rollback = restore code + promote
pre-migration branch state if compatibility checks fail. Neon branching +
CI workflow per the spec's linked Neon docs.

---

## Explicitly excluded (do not build — from the spec)

Second production DB · stored-value wallet · paid resale · open social
networking / private messaging · supplier self-publishing · external
inventory feeds · native mobile apps · speculative microservices · ML
recommendation service.

---

## Cross-cutting risks to watch every phase

1. **Auth half-migration** (P2) is the top risk — three backends currently
   trust three different token shapes. Cut over atomically.
2. **`server/store.ts` truncate-resync** can wipe reporting rows other
   systems now depend on; neutralize before P3/P4 lean on those tables.
3. **Orphan `public.gp_*` tables** from the dead build — leave untouched
   until a dedicated cleanup migration; never FK to them.
4. **Two authoritative QR paths** (Node mock re-added + FastAPI real) — Phase
   2/3 must leave exactly one (FastAPI).
5. **Feature-flag discipline:** "release together" means flags, not
   long-lived branches; every phase ships to `main` flag-off.

---

## Immediate next step

Phase 1 has no dependencies and no external approvals. When you're ready,
say so and I'll write the detailed `docs/superpowers/plans/2026-07-22-
gatepass-phase1-foundations.md` (bite-sized TDD tasks) and execute it — OR,
given the auth work already in flight, we start with **Phase 2** to stop the
codebase sitting in a half-migrated auth state. My recommendation: **Phase 2
first**, because leaving auth half-migrated is the biggest active risk, and
Phase 1's routing refactor is safer to do on top of a settled auth model.
