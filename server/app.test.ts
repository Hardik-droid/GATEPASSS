import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import request from "supertest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState";
import { UserRole } from "../src/types";
import { createApp } from "./app";
import { createNeonVerifier } from "./neonAuth";
import { TICKET_UPSERT_SQL, type AppStateStore } from "./store";

const ISS = "https://neon.example/neondb/auth";

class MemoryStore implements AppStateStore {
  private state: AppStateSnapshot | null = null;
  private eventImages = new Map<string, { contentType: string; data: Buffer }>();
  async ensureReady() {}
  async health() {
    return { now: new Date(0).toISOString() };
  }
  async load() {
    return this.state;
  }
  async save(state: AppStateSnapshot) {
    this.state = state;
  }
  async saveEventImage(_uploadedBy: string, contentType: string, data: Buffer) {
    const id = "11111111-1111-4111-8111-111111111111";
    this.eventImages.set(id, { contentType, data });
    return id;
  }
  async loadEventImage(id: string) {
    return this.eventImages.get(id) ?? null;
  }
}

// Build an app whose Neon verifier trusts a locally generated Ed25519 key, plus
// a matching JWT minter — no live Neon Auth call needed.
async function authedApp() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  jwk.alg = "EdDSA";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const neonVerifier = createNeonVerifier({ jwks, issuer: ISS });
  const app = createApp({ store: new MemoryStore(), neonVerifier });
  const mint = (claims: Record<string, unknown> = {}, expSec = 60) =>
    new SignJWT({ sub: "node-user", ...claims })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(ISS)
      .setExpirationTime(`${expSec}s`)
      .sign(privateKey);
  return { app, mint, privateKey };
}

test("health route returns database status (no auth)", async () => {
  const { app } = await authedApp();
  const response = await request(app).get("/api/health").expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.db.now, new Date(0).toISOString());
});

test("GET /api/state accepts a valid Neon JWT", async () => {
  const { app, mint } = await authedApp();
  const token = await mint({ email: "n@x.com" });
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(response.body.state.user.name, "GatePass Member");
  assert.equal(response.body.state.user.email, "n@x.com");
  assert.equal(response.body.state.user.role, "Attendee");
  assert.ok(Array.isArray(response.body.state.events));
});

// The stored snapshot is shared by every user, so the previous saver's name
// must never be served back as the caller's identity.
test("GET /api/state returns the caller's own name, not the stored one", async () => {
  const { app, mint } = await authedApp();
  const saver = await mint({ email: "first@x.com", name: "First Saver" });
  const state = createInitialAppState();
  state.user.name = "First Saver";
  await request(app)
    .put("/api/state")
    .set("Authorization", `Bearer ${saver}`)
    .send({ state })
    .expect(204);

  const viewer = await mint({ email: "second@x.com", name: "Second Viewer" });
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${viewer}`)
    .expect(200);
  assert.equal(response.body.state.user.name, "Second Viewer");
  assert.equal(response.body.state.user.email, "second@x.com");
});

test("GET /api/state assigns Owner only to the configured OAuth email", async () => {
  const { app, mint } = await authedApp();
  const token = await mint({ email: "ophardik001@gmail.com" });
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(response.body.state.user.email, "ophardik001@gmail.com");
  assert.equal(response.body.state.user.role, "Owner");
});

test("GET /api/state rejects a missing token", async () => {
  const { app } = await authedApp();
  await request(app).get("/api/state").expect(401);
});

test("GET /api/state rejects a gp_session_ string", async () => {
  const { app } = await authedApp();
  await request(app).get("/api/state").set("Authorization", "Bearer gp_session_test").expect(401);
});

test("GET /api/state rejects an expired JWT", async () => {
  const { app, mint } = await authedApp();
  const token = await mint({}, -10);
  await request(app).get("/api/state").set("Authorization", `Bearer ${token}`).expect(401);
});

test("PUT /api/state validates payloads before persisting", async () => {
  const { app, mint } = await authedApp();
  const token = await mint();
  await request(app)
    .put("/api/state")
    .set("Authorization", `Bearer ${token}`)
    .send({ state: { bad: true } })
    .expect(400);
});

test("PUT /api/state persists a valid snapshot", async () => {
  const { app, mint } = await authedApp();
  const token = await mint({ email: "attendee@example.com" });
  const state = createInitialAppState();
  state.user.name = "Production Test User";
  state.user.role = UserRole.OWNER;
  await request(app)
    .put("/api/state")
    .set("Authorization", `Bearer ${token}`)
    .send({ state })
    .expect(204);
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  assert.equal(response.body.state.user.name, "Production Test User");
  assert.equal(response.body.state.user.email, "attendee@example.com");
  assert.equal(response.body.state.user.role, "Attendee");
});

test("event cover upload stores a real image and serves it publicly", async () => {
  const { app, mint } = await authedApp();
  const token = await mint();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const uploaded = await request(app)
    .post("/api/event-images")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "image/png")
    .send(png)
    .expect(201);
  const id = new URL(uploaded.body.url).searchParams.get("id");
  assert.equal(id, "11111111-1111-4111-8111-111111111111");
  const downloaded = await request(app).get(`/api/event-images?id=${id}`).expect(200);
  assert.equal(downloaded.headers["content-type"], "image/png");
  assert.deepEqual(downloaded.body, png);
});

test("event cover upload rejects a spoofed image", async () => {
  const { app, mint } = await authedApp();
  const token = await mint();
  await request(app)
    .post("/api/event-images")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "image/png")
    .send(Buffer.from("not an image"))
    .expect(400);
});

test("removed Node mock QR route now 404s", async () => {
  const { app, mint } = await authedApp();
  const token = await mint();
  await request(app).get("/api/qr/me").set("Authorization", `Bearer ${token}`).expect(404);
});

test("removed Node mock scanner route now 404s", async () => {
  const { app } = await authedApp();
  await request(app).post("/api/scanner/pair").send({ pairing_code: "123456" }).expect(404);
});

test("unknown API route returns 404", async () => {
  const { app } = await authedApp();
  await request(app).get("/api/missing").expect(404);
});

// --- neonAuth verifier unit tests ---

test("verifier accepts a valid Neon JWT", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  jwk.alg = "EdDSA";
  const verifier = createNeonVerifier({ jwks: createLocalJWKSet({ keys: [jwk] }), issuer: ISS });
  const token = await new SignJWT({ sub: "u1", email: "u@x.com" })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setIssuer(ISS)
    .setExpirationTime("60s")
    .sign(privateKey);
  const claims = await verifier.verify(token);
  assert.equal(claims.sub, "u1");
});

test("verifier rejects a gp_session_ string", async () => {
  const { publicKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  jwk.alg = "EdDSA";
  const verifier = createNeonVerifier({ jwks: createLocalJWKSet({ keys: [jwk] }), issuer: ISS });
  await assert.rejects(() => verifier.verify("gp_session_abc"));
});

test("verifier rejects a wrong-issuer token", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  jwk.alg = "EdDSA";
  const verifier = createNeonVerifier({ jwks: createLocalJWKSet({ keys: [jwk] }), issuer: ISS });
  const bad = await new SignJWT({ sub: "u1" })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setIssuer("https://evil/auth")
    .setExpirationTime("60s")
    .sign(privateKey);
  await assert.rejects(() => verifier.verify(bad));
});

// --- state sync ownership guards ---
//
// public.tickets ownership columns are written only by the transfer engine
// (backend/transfer_routes.py). If the state-blob sync ever overwrites them,
// every accepted transfer silently reverts on the next browser autosave.

test("ticket upsert never overwrites owner columns", () => {
  const doUpdate = TICKET_UPSERT_SQL.split(/DO UPDATE SET/i)[1];
  assert.ok(doUpdate, "ticket upsert must have a DO UPDATE clause");
  for (const column of ["attendee_email", "attendee_name", "attendee_phone"]) {
    assert.ok(
      !doUpdate.includes(column),
      `${column} is owned by the transfer engine and must not be in DO UPDATE`,
    );
  }
  assert.ok(doUpdate.includes("category_name"), "non-owner columns must still update");
});

test("state sync never truncates the reporting tables", async () => {
  const source = await readFile(new URL("./store.ts", import.meta.url), "utf8");
  assert.ok(
    !/TRUNCATE/i.test(source),
    "TRUNCATE deletes rows created by other users; use upserts",
  );
});
