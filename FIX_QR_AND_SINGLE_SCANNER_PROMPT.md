# Codex Prompt — Fix QR Display and Keep Only One Scanner

You are working inside my existing GatePass project.

Project root:

```text
C:\Users\Asus\Downloads\gatepass
```

## Current problem

When the user tries to view their GatePass QR, the scanner interface opens instead of the user's QR.

The current screen shows:

- `GATEPASS SCANNER HUB`
- `AWAITING QR PASS TRANSMISSION`
- a simulated ticket dropdown
- a `SIMULATE SCANNER CHECK-IN` button

This is wrong.

I want:

1. The user QR screen to display the logged-in user's permanent QR only.
2. One real scanner in the entire project.
3. All duplicate, demo, simulated, modal-based, and obsolete scanners removed.

Do not use Git commands.

---

# Main rule

```text
My QR screen != Scanner screen
```

The QR view and scanner must be completely separate.

---

# Final expected behavior

## My QR

When a user clicks:

```text
My QR
View QR
GatePass
Wallet
```

the app must display the user's permanent QR.

It must not:

- open the camera
- open the scanner
- show scan corners
- show scanner status
- show a simulated ticket selector
- show a simulate button
- request camera permission

Use the real backend QR endpoint already implemented in the project, such as:

```text
GET /api/qr/me
GET /api/qr/me.png
```

Inspect the backend and use the actual route.

Do not use a mock QR.

## One scanner

The project must contain exactly one canonical scanner.

Preferred route:

```text
/scanner
```

Optional pairing route, only if required by the approved backend:

```text
/scanner/pair
```

The scanner must:

- use the real camera
- scan only QR payloads starting with `gp:v1:`
- send the QR payload to the real backend
- show APPROVED or REJECTED
- show user and ticket information only when returned by the backend
- prevent duplicate requests
- allow only one in-flight scan request
- generate one UUID idempotency key per physical scan
- auto-reset after a result
- provide a manual reset button

Remove all simulation behavior.

---

# Step 1 — Inspect before editing

Inspect the complete repository before changing code.

Check:

```text
src/App.tsx
src/main.tsx
all route files
all scanner components
all QR/pass/wallet components
all API helper files
backend scanner routes
backend QR routes
scanner database models
scanner migrations
```

Search the entire repository for:

```text
ScannerHub
GATEPASS SCANNER HUB
AWAITING QR PASS TRANSMISSION
SIMULATE SCANNER CHECK-IN
Demo QR Pass token
simulated digital ticket
simulate scanner
simulateCheckIn
scanner modal
scannerModal
mock scanner
demo scanner
QR transmission
GATE_NODE
openScanner
setScannerOpen
showScanner
isScannerHubOpen
showQr
viewQr
openGatePass
```

First report:

1. Why the scanner opens when the user asks for their QR.
2. Every scanner implementation found.
3. Every route or button that opens a scanner.
4. The one scanner implementation you plan to retain.

Then make the changes.

---

# Step 2 — Fix the QR display

Create or retain one canonical QR component, for example:

```text
src/features/gatepass/UniversalQrCard.tsx
```

Adapt the path to the actual project structure.

The component should:

- load the current user's permanent QR from the backend
- display the QR at a clearly scannable size
- show loading state
- show authentication errors
- show backend errors
- provide retry
- display the user's name when available
- explain that the same QR can be used for supported GatePass services

Example UI intent:

```tsx
<section>
  <h2>My GatePass QR</h2>
  <img src={qrImageUrl} alt="My permanent GatePass QR" />
  <p>Use this same QR for tickets, identity, attendance, and access.</p>
</section>
```

Do not put scanner logic in this component.

Do not reuse a scanner modal as the QR viewer.

Do not access the camera from the QR component.

---

# Step 3 — Separate navigation actions

There must be two different actions:

```text
My QR
Open Scanner
```

`My QR` must open the user QR view.

`Open Scanner` must navigate to:

```text
/scanner
```

If scanner access is operator/admin-only, hide or protect the scanner action for normal users.

Do not show more than one scanner link.

Fix all incorrect button handlers and routes.

---

# Step 4 — Remove obsolete scanner interfaces

Delete or remove from active code all obsolete scanner variants, including:

- scanner hub modal
- demo scanner
- simulated scanner
- fake QR transmission screen
- simulated ticket dropdown
- simulated pass selector
- `SIMULATE SCANNER CHECK-IN` button
- duplicate camera scanners
- duplicate scanner result components
- duplicate scanner API helpers
- scanner selection UI
- scanner switching UI
- multiple scanner cards
- mock scanner data

Do not leave dead imports, unused state, or unused CSS.

Search and remove obsolete state such as:

```text
isScannerHubOpen
selectedDemoPass
simulatedScanResult
demoQrToken
mockScannerStatus
fakeGateNode
scannerModalOpen
```

Remove obsolete CSS selectors related to:

```text
scanner-hub
scanner-modal
transmission
simulated-pass
gate-node
controller-version
demo-scanner
```

Do not remove shared code used by unrelated features.

---

# Step 5 — Keep one canonical scanner frontend

Use one feature structure, for example:

```text
src/features/scanner/
  GatePassScannerPage.tsx
  PairScannerPage.tsx
  ScannerResult.tsx
  scannerApi.ts
  scannerSession.ts
  scanner.css
```

Only create files that are needed.

Do not keep a second scanner elsewhere.

The final scanner page should include:

- scanner name
- online/offline state
- camera preview
- scan frame
- camera permission handling
- start camera
- stop camera
- switch camera when supported
- APPROVED state
- REJECTED state
- user photo/name when authorized
- ticket type and entry count when returned
- reset button
- automatic reset

Use the existing camera library when available.

Otherwise use:

```text
@zxing/browser
```

Before submitting:

```ts
qrPayload.startsWith("gp:v1:")
```

This client check is only for fast rejection. The backend must still perform full signature verification.

---

# Step 6 — Single-scanner mode

For the current MVP, the entire project must have only one active scanner.

Use one canonical scanner configuration:

```text
Name: GatePass Main Scanner
Purpose: TICKET_VALIDATION
Gate: MAIN_GATE
Status: ACTIVE
```

Do not expose scanner switching in the frontend.

Do not put scanner secrets in frontend source code or Vite environment variables.

If pairing already exists:

- keep pairing only for this one scanner
- remove scanner list management
- remove multiple scanner creation UI
- remove scanner selection
- remove scanner switching

If multiple scanner records already exist:

- do not delete scan history
- choose one canonical scanner
- mark all other scanner records inactive or revoked
- preserve old logs
- document which scanner remains active

Enforce the one-active-scanner rule in the backend, not only in the frontend.

Preferred database-level protection:

```sql
CREATE UNIQUE INDEX uq_scanner_one_active
ON scanner.scanners ((status))
WHERE status = 'active';
```

If this does not fit the existing schema, implement a transaction-safe singleton rule using row locking.

Do not create a scanner automatically on every server restart.

Provide one explicit admin setup/seed command for the canonical scanner.

---

# Step 7 — Keep endpoint responsibilities separate

User QR endpoints:

```text
GET /api/qr/me
GET /api/qr/me.png
POST /api/qr/reissue
```

Scanner endpoints:

```text
POST /api/scanner/pair
GET /api/scanner/me
POST /api/scanner/scan
```

Use the real routes discovered in the repository.

Rules:

- QR UI calls only QR/user endpoints.
- Scanner UI calls only scanner endpoints.
- QR UI must never call `/api/scanner/scan`.
- Scanner UI must never generate the user's permanent QR.
- Scanner purpose/event/gate must come from the authenticated backend scanner configuration.
- Do not trust purpose/event/gate sent by the frontend.

---

# Step 8 — Preserve approved backend security

Do not remove or weaken:

- permanent QR credentials
- `gp:v1:` format
- HMAC-SHA256 verification
- constant-time signature comparison
- QR revocation and reissue
- scanner pairing
- scanner sessions
- scanner expiration/revocation
- backend ticket entitlement validation
- active ticket assignment validation
- idempotency
- row locking for entry counts
- approved and rejected scan logs
- separate scanner schema
- no runtime dependency on client-owned JSON state

Do not put PII, ticket data, or permissions inside the QR.

---

# Step 9 — Fix routes

Expected result:

```text
/wallet or /gatepass or /profile
  -> displays the user's QR

/scanner
  -> opens the one real scanner

/scanner/pair
  -> pairs the one scanner, only when needed
```

Inspect how routes are currently implemented.

Do not install `react-router` if the app already uses a different routing mechanism.

Do not create duplicate routes.

---

# Step 10 — Remove demo and mock scanner data

Search for:

```text
demoPass
mockTickets
simulatedTickets
scannerDemo
INITIAL_USER
mockData
```

Remove only scanner-related mocks that are no longer needed.

Do not remove shared mock/development data used by unrelated features without checking its consumers.

The scanner production path must use real backend data only.

---

# Step 11 — Error handling

User QR errors:

```text
QR_NOT_AVAILABLE
USER_NOT_AUTHENTICATED
QR_REVOKED
QR_LOAD_FAILED
```

Scanner errors:

```text
SCANNER_NOT_PAIRED
SCANNER_SESSION_EXPIRED
SCANNER_INACTIVE
CAMERA_PERMISSION_DENIED
INVALID_QR_FORMAT
INVALID_QR_SIGNATURE
QR_REVOKED
NO_VALID_TICKET
ENTRY_LIMIT_REACHED
NETWORK_ERROR
```

Show friendly UI messages.

Do not expose raw stack traces or secrets.

---

# Step 12 — Migration safety

If database changes are necessary:

1. Inspect the current Alembic migration head.
2. Create a new migration.
3. Do not edit already-applied migrations.
4. Do not leave placeholder revision IDs.
5. Preserve scan logs.
6. Preserve the canonical scanner.
7. Mark extra scanners inactive rather than deleting them.
8. Add a valid downgrade.
9. Run Alembic checks.

---

# Required validation

Run:

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

Run backend tests:

```powershell
python -m pytest backend -q
```

If migrations changed:

```powershell
python -m alembic check
python -m alembic upgrade head
```

Start the real frontend and backend.

Manually verify:

1. Open the user Wallet/GatePass screen.
2. Click `My QR`.
3. Confirm the permanent QR appears.
4. Confirm the camera does not open.
5. Confirm camera permission is not requested.
6. Open `/scanner`.
7. Confirm the only scanner opens.
8. Confirm the simulated ticket dropdown is gone.
9. Confirm the simulate button is gone.
10. Confirm non-`gp:v1:` QR values are rejected.
11. Confirm a valid GatePass QR reaches the backend.
12. Confirm there are no duplicate scanner links.
13. Confirm there are no scanner modals remaining.
14. Confirm only one active backend scanner exists.

---

# Do not do

Do not:

- use Git commands
- disable Vite errors
- keep an obsolete scanner hidden
- keep demo scanner options
- use mock ticket data in production paths
- put scanner secrets in frontend code
- hardcode QR payloads
- create another scanner route
- create another QR component
- use `any`
- delete scan history
- weaken backend validation
- change unrelated UI
- claim commands passed when they were not executed

---

# Acceptance criteria

The work is complete only when:

```text
1. My QR displays the logged-in user's permanent QR.
2. My QR never opens a scanner.
3. The project contains one canonical scanner frontend.
4. Only one backend scanner is active.
5. The scanner exists at /scanner.
6. The simulated scanner hub is removed.
7. The demo pass selector is removed.
8. The simulate check-in button is removed.
9. Only real GatePass QR payloads are processed.
10. Backend remains the source of truth.
11. Lint passes.
12. TypeScript checking passes.
13. Production build passes.
14. Backend tests pass.
15. Migration checks pass when applicable.
```

---

# Completion report

At the end, report:

1. Exact root cause of the QR opening the scanner.
2. All scanner implementations found.
3. The single scanner implementation retained.
4. Scanner files removed.
5. QR component retained or created.
6. Routes changed.
7. Button handlers changed.
8. Navigation items removed.
9. Backend single-scanner enforcement.
10. Canonical active scanner ID/name.
11. Migration created, if any.
12. Lint result.
13. TypeScript result.
14. Build result.
15. Backend test result.
16. Manual verification result.

Begin by inspecting the repository and locating the exact action that opens
the scanner instead of the user's QR.
