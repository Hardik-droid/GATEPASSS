
# GatePass

GatePass is an event-operations app for attendees, organisers, and entry teams.
It uses verified OAuth identity, role-controlled organiser tools, and a signed
permanent QR pass that can be loaded and scanned across devices.

## Production architecture

| Concern | Production service |
| --- | --- |
| Web app | Vite/React static site on Vercel |
| Permanent QR pass | Vercel Python Function: `GET /api/qr/me` |
| QR credential security | FastAPI in `backend/` with Neon Postgres |
| Operations state | Node/Express service in `server/` (deploy separately when state persistence is used) |
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
| `GATEPASS_ADMIN_EMAILS` | FastAPI | Reserved comma-separated authorised scanner-admin emails |
| `DATABASE_URL` | Node state API | Postgres URL used for app state |
| `CORS_ORIGIN` | Node state API | Exact public web origin |
| `VITE_NEON_AUTH_URL` | Vite build | Public Neon Auth URL (not a secret) |
| `VITE_API_BASE_URL` | Vite build | Public origin of the separately deployed Node state API, if used |

Leave `VITE_SCANNER_API_BASE_URL` unset in a Vercel production build. The QR
function is served from the same origin at `/api/qr/me`; a localhost value can
never work on a visitor's phone.

## Deploy

### Vercel web app and QR function

1. Import this repository as a Vercel project.
2. Use the committed `vercel.json`, build command `npm run build`, and output
   directory `dist`.
3. Configure the QR-function variables in the table above, including
   `APP_ENV=production`.
4. Add `VITE_NEON_AUTH_URL` and, when the Node operations API is deployed,
   its HTTPS `VITE_API_BASE_URL` at build time.
5. Redeploy after changing any `VITE_*` value; Vite embeds those values during
   the build.

The `api/qr/me.py` filesystem function handles `/api/qr/me`; the SPA rewrite
intentionally excludes `/api/*` so API requests do not return `index.html`.

### Node state API

Deploy the repository with Nixpacks/Railway using the committed
`nixpacks.toml`. Set `NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGIN`, and
the Neon Auth settings. Railway builds `server/index.ts` and starts
`dist-server/index.js`; it must not run a .NET Docker image.

## Scanner release gate

This repository currently ships the permanent QR credential endpoint, but it
does **not** ship `/api/scanner/pair`, `/api/scanner/me`, or
`/api/scanner/scan`. The former Node mock routes were intentionally removed,
and the remaining Scanner UI must stay out of a production entry workflow until
a server-backed scanner service implements assignment, validation, audit logs,
and device authorisation. Do not replace those controls with local or demo
validation.

## Verify before release

Run these checks from a clean checkout:

```powershell
npm run lint
npm run test:api
npm run build
python -m pytest tests -q
```

After deployment, check that the public QR route returns JSON (an unauthenticated
request should be a JSON `401`, not HTML), then sign in on a real phone and
confirm that the QR code renders. Add a real scanner validation test only after
the server-backed scanner service described above is deployed.

## Security rules

- Never use demo QR data or client-only validation in production.
- Never expose database URLs, signing keys, payment secrets, or server tokens
  through `VITE_*` variables.
- Keep `GATEPASS_QR_SIGNING_KEY` stable and rotate it only through a planned
  pass reissue.
- Deploy over HTTPS; camera access and reliable QR scanning require it on
  mobile browsers.
