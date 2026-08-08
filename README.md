
# GatePass

GatePass is an event-operations app for attendees, organisers, and entry teams.
It uses verified OAuth identity, role-controlled organiser tools, and a signed
permanent QR pass that can be loaded and scanned across devices.

## Production architecture

| Concern | Production service |
| --- | --- |
| Web app | Vite/React static site on Vercel |
| QR pass, scanner, transfers | FastAPI in `backend/`, deployed as its own Render web service, with Neon Postgres |
| Operations, state, ticket checkout | Node/Express service in `server/`, deployed as its own Render web service |
| Identity | Neon Auth JWTs verified server-side |

The web app calls the two Render services cross-origin via `VITE_API_BASE_URL`
(Node service) and `VITE_SCANNER_API_BASE_URL` (FastAPI service). Both
backends only ever wrap `backend/main.py` and `server/app.ts` respectively —
there is no separate Vercel Function code path to keep in sync.

The old .NET backend has deliberately been removed. It was not on the
production request path and could be selected by a Docker deployment, where it
failed before startup when its separate database configuration was absent.

## Role policy

- `ophardik001@gmail.com` is the Owner after Google OAuth sign-in.
- Every other OAuth account is an Attendee by default.
- The UI does not show organiser controls to attendees. Elevated access must be
  granted by an existing Owner, admin, or organiser through the authorised
  access workflow; a browser-supplied role is never trusted.

## Run locally

### Prerequisites

- Node.js 22+
- Python 3.11+
- A Neon Postgres database and Neon Auth application

Copy `.env.example` to `.env`, then fill in real values. Do not commit `.env`.

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
npm run dev:full
```

`npm run server:dev` (and therefore `npm run dev:full`) and `npm start` run
`python -m alembic upgrade head` before Node starts. Startup stops if the
migration fails; the application runtime never creates or alters tables.

This starts:

- Vite at `http://localhost:5173`
- Node operations API at `http://localhost:3001`
- FastAPI scanner service at `http://127.0.0.1:8010`

To run migrations without starting the services:

```powershell
npm run db:migrate
```

Alembic owns both `public.*` and `scanner.*` DDL. The SQL in
`db/postgres18_schema.sql` is migration input, not a manual setup script.

## Environment variables

Set secrets in Vercel/Render's encrypted environment settings, never in Git
or browser-visible `VITE_*` variables.

| Variable | Required by | Purpose |
| --- | --- | --- |
| `SCANNER_DATABASE_URL` | FastAPI (Render) | Neon Postgres URL for the scanner schema |
| `SCANNER_MIGRATIONS_DATABASE_URL` | FastAPI (Render, migration step) | Direct/non-pooler Neon URL used only to run Alembic |
| `GATEPASS_QR_SIGNING_KEY` | FastAPI (Render) | Stable secret of at least 32 characters; changing it invalidates existing QR passes |
| `NEON_AUTH_URL` | Both Render services | Neon Auth issuer URL |
| `NEON_AUTH_AUDIENCE` | Both Render services | Expected JWT audience; required in staging and production |
| `GATEPASS_PUBLIC_APP_URL` | FastAPI (Render) | Public web origin, for example `https://gatepasss.vercel.app`; also used for CORS |
| `GATEPASS_OWNER_EMAIL` | Both Render services | Exact OAuth email allowed to grant or revoke scanner access |
| `GATEPASS_ADMIN_EMAILS` | Both Render services | Reserved comma-separated authorised scanner-admin emails |
| `DATABASE_URL` | Node service (Render) | Postgres URL used for app state |
| `CORS_ORIGIN` | Node service (Render) | Comma-separated list of allowed browser origins, for example `https://gatepasss.vercel.app` |
| `RAZORPAY_KEY_ID` | Node service (Render) | Server-selected Razorpay checkout key ID |
| `RAZORPAY_KEY_SECRET` | Node service (Render) | HMAC/order API secret; server-only |
| `VITE_NEON_AUTH_URL` | Vite build (Vercel) | Public Neon Auth URL (not a secret) |
| `VITE_API_BASE_URL` | Vite build (Vercel) | Public URL of the Render Node service, for example `https://gatepass-server.onrender.com` |
| `VITE_SCANNER_API_BASE_URL` | Vite build (Vercel) | Public URL of the Render FastAPI service, for example `https://gatepass-scanner.onrender.com` |

`DATABASE_URL`, `SCANNER_DATABASE_URL`, and
`SCANNER_MIGRATIONS_DATABASE_URL` must identify the same database (the
migration URL may use its direct/non-pooler hostname). Ticket synchronization
uses Postgres triggers between that database's `public` and `scanner` schemas.

`VITE_SCANNER_API_BASE_URL` and `VITE_API_BASE_URL` must be set to the real
Render service URLs in the Vercel production build — the frontend and
backends are on different origins, so there is no same-origin fallback
anymore. `resolveApiBase` (`src/apiBase.ts`) still treats a `localhost`/
`127.0.0.1` value as "unset" so a stray local override in Vercel can never
leak into a deployed build.

## Deploy

The frontend (Vercel) and the two backends (Render) are three independent
deployments. Nothing under `api/` exists anymore — Vercel serves only the
static Vite build.

### FastAPI scanner service (Render)

1. Create a Render **Web Service** from this repo, root directory `.`,
   runtime **Python**.
2. Build command: `pip install -r backend/requirements.txt`
3. Start command: `python -m alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   — migrations run before Uvicorn binds, matching the "startup stops if the
   migration fails" rule below.
4. Health check path: `/health`
5. Set `APP_ENV=production` plus every FastAPI variable in the table above.

### Node operations/ticket service (Render)

1. Create a second Render **Web Service** from this repo, runtime **Node**.
2. Build command: `npm ci && npm run build && npm run build:server`
   (`build` produces `dist/` so the service's static-file fallback has
   something to serve; `build:server` bundles `server/index.ts`).
3. Start command: `node dist-server/index.js` — deliberately **not**
   `npm start`. `npm start`'s `db:migrate` step shells out to Python/Alembic,
   which this Node runtime doesn't have; the FastAPI service above already
   owns running migrations.
4. Health check path: `/api/health`
5. Set `NODE_ENV=production` plus every Node variable in the table above.

### Vercel web app

1. Import this repository as a Vercel project.
2. Use the committed `vercel.json` as-is — it's a plain static Vite build, no
   backend build step. The output directory is `dist`.
3. Set `VITE_NEON_AUTH_URL`, `VITE_API_BASE_URL` (Node service URL), and
   `VITE_SCANNER_API_BASE_URL` (FastAPI service URL) as Vercel project
   environment variables.
4. Redeploy after changing any `VITE_*` value; Vite embeds those values during
   the build.

## Mobile scanner

The mobile scanner uses the signed permanent GatePass QR and validates every
scan on the FastAPI service:

- `GET /api/scanner/assignments` returns only events and gates the signed-in
  operator is allowed to scan.
- `PUT /api/scanner/access` lets the configured Owner grant or revoke
  event-scoped scanner access by verified OAuth email.
- `POST /api/scanner/validate` verifies the signed QR, operator assignment,
  event window, ticket status, current holder, transfer history, remaining
  entries, and idempotency before approving entry.

Delegated scanner operators remain Attendees. Scanner access never grants
organiser tools or changes an OAuth role.

Ticket issuance writes `public.tickets`/`public.orders`, which a database
trigger syncs into `scanner.ticket_entitlements` and
`scanner.ticket_assignments` (falling back to reading `public.tickets`
directly if the sync hasn't caught up). The scanner deliberately has no
client-side, legacy-ticket, or demo-data fallback.

## Ticket checkout and state ownership

- `POST /api/tickets/checkout` derives the event, category, price, fees, and
  attendee identity on the server. Free tickets issue immediately. Paid
  checkout reserves capacity, creates a Razorpay order with server credentials,
  and issues only after HMAC signature verification.
- `POST /api/tickets/manual` is Owner/admin-only, accepts a quantity, and
  requires the attendee email to already exist in `scanner.users`.
- Idempotency keys are durable in Postgres. A retry returns the same Razorpay
  order or the same issued order/tickets; every quantity creates one distinct
  opaque ticket token.
- Issuance commits its order, tickets, category sold count, settlement, audit,
  app-state snapshot, reservation, and trigger-driven scanner rows in one
  transaction.
- Attendee `GET /api/state` responses contain public events plus only that
  attendee's orders/tickets. Invites, scan logs, settlements, audit logs, and
  other users' access requests are excluded. Attendee `PUT /api/state` can
  update only the caller profile and add sanitized pending access requests;
  organizer and financial collections cannot be replaced from the browser.

On mobile, use the HTTPS deployment so the browser can open the rear camera.
The scanner stops decoding after the first QR result and resumes only when the
operator taps **Scan next ticket**, preventing duplicate frame submissions.

## Verify before release

Run these checks from a clean checkout:

```powershell
npm run lint
npm run test:api
npm run build
python -m pytest tests -q
```

After deployment, check that the public QR and scanner routes return JSON (an
unauthenticated request should be a JSON `401`, not HTML). Then sign in on a
real phone, confirm that the permanent QR renders, grant one Attendee scanner
access, and scan an original and transferred ticket through the rear camera.

## Security rules

- Never use demo QR data or client-only validation in production.
- Never expose database URLs, signing keys, payment secrets, or server tokens
  through `VITE_*` variables.
- Keep `GATEPASS_QR_SIGNING_KEY` stable and rotate it only through a planned
  pass reissue.
- Deploy over HTTPS; camera access and reliable QR scanning require it on
  mobile browsers.
