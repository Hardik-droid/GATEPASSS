import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState";
import { createApp } from "./app";
import { createNeonVerifier } from "./neonAuth";
import type { AppStateStore } from "./store";

const ISS = "https://neon.example/neondb/auth";

class MemoryStore implements AppStateStore {
  private state: AppStateSnapshot | null = null;
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
  assert.equal(response.body.state.user.name, "Hardik Jain");
  assert.ok(Array.isArray(response.body.state.events));
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
  const token = await mint();
  const state = createInitialAppState();
  state.user.name = "Production Test User";
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
