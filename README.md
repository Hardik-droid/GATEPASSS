
# GatePass

GatePass is an event-operations app for attendees, organisers, and entry teams.
It uses verified OAuth identity, role-controlled organiser tools, and a signed
permanent QR pass that can be loaded and scanned across devices.

## Production architecture

| Concern | Production service |
| --- | --- |
| Web app | Vite/React static site on Vercel |
| Permanent QR pass | Vercel Python Function: `GET /api/qr/me` |
| Mobile entry scanner | Vercel Python Functions under `/api/scanner/*` |
| QR credential security | FastAPI in `backend/` with Neon Postgres |
| Operations state | Node/Express service in `server/`, served as a Vercel Function: `GET/PUT /api/state` |
| Identity | Neon Auth JWTs verified server-side |

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

This starts:

- Vite at `http://localhost:5173`
- Node operations API at `http://localhost:3001`
- FastAPI scanner service at `http://127.0.0.1:8010`

For the scanner schema, run migrations against a configured development
database before testing scanner flows:

```powershell
python -m alembic upgrade head
```

## Environment variables

Set secrets in Vercel/Railway/your platform's encrypted environment settings,
never in Git or browser-visible `VITE_*` variables.

| Variable | Required by | Purpose |
| --- | --- | --- |
| `SCANNER_DATABASE_URL` | QR function / FastAPI | Neon Postgres URL for the scanner schema |
| `GATEPASS_QR_SIGNING_KEY` | QR function / FastAPI | Stable secret of at least 32 characters; changing it invalidates existing QR passes |
| `NEON_AUTH_URL` | Server services | Neon Auth issuer URL |
| `NEON_AUTH_AUDIENCE` | Production FastAPI | Expected JWT audience; required in staging and production |
| `GATEPASS_PUBLIC_APP_URL` | QR function / FastAPI | Public web origin, for example `https://gatepasss.vercel.app` |
| `GATEPASS_OWNER_EMAIL` | FastAPI | Exact OAuth email allowed to grant or revoke scanner access |
| `GATEPASS_ADMIN_EMAILS` | FastAPI | Reserved comma-separated authorised scanner-admin emails |
| `DATABASE_URL` | `/api/state` Vercel Function | Postgres URL used for app state |
| `VITE_NEON_AUTH_URL` | Vite build | Public Neon Auth URL (not a secret) |

Leave `VITE_SCANNER_API_BASE_URL` and `VITE_API_BASE_URL` unset in a Vercel
production build. Both the QR function (`/api/qr/me`) and the state API
(`/api/state`) are served from the same origin as the web app; a localhost
value can never work on a visitor's phone.

## Deploy

### Vercel web app and QR function

1. Import this repository as a Vercel project.
2. Use the committed `vercel.json`, build command `npm run build`, and output
   directory `dist`.
3. Configure the QR-function variables in the table above, including
   `APP_ENV=production`.
4. Add `VITE_NEON_AUTH_URL`, `DATABASE_URL` (for `/api/state`), and
   `NEON_AUTH_URL`/`NEON_AUTH_AUDIENCE` as needed.
5. Redeploy after changing any `VITE_*` value; Vite embeds those values during
   the build.

The filesystem functions in `api/qr/`, `api/scanner/`, and `api/state.ts`
expose the FastAPI routes and the Node operations API. The SPA rewrite
intentionally excludes `/api/*` so API requests do not return `index.html`.

### Node state API

`api/state.ts` wraps `server/app.ts` and runs as a Vercel Node Function in the
same deployment as the web app — no separate host is required. It needs
`DATABASE_URL` (or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`) and
`NEON_AUTH_URL`/`VITE_NEON_AUTH_URL` set in the Vercel project. The Railway
path (`nixpacks.toml`, `server/index.ts` → `dist-server/index.js`) still works
as a standalone alternative if you'd rather run it off-platform.

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
