import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import request from "supertest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createInitialAppState } from "../src/appState";
import { UserRole } from "../src/types";
import { createApp } from "./app";
import { createNeonVerifier } from "./neonAuth";
import type { RazorpayGateway } from "./razorpay";
import {
  EXPECTED_ALEMBIC_HEAD,
  MemoryAppStateStore,
  PostgresAppStateStore,
  runTransaction,
  TICKET_UPSERT_SQL,
} from "./store";

const ISS = "https://neon.example/neondb/auth";
const PAYMENT_SECRET = "test_payment_secret_which_is_not_real";

class FakeRazorpayGateway implements RazorpayGateway {
  readonly keyId = "rzp_test_server_key";
  createCalls = 0;

  async createOrder(input: { amount: number; receipt: string }) {
    this.createCalls += 1;
    await Promise.resolve();
    return {
      id: `order_${input.receipt.replace(/[^A-Za-z0-9]/g, "")}`,
      amount: input.amount,
      currency: "INR" as const,
    };
  }

  verifySignature(orderId: string, paymentId: string, signature: string) {
    return signature === createHmac("sha256", PAYMENT_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  }

  sign(orderId: string, paymentId: string): string {
    return createHmac("sha256", PAYMENT_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  }
}

class MemoryStore extends MemoryAppStateStore {
  private testEventImages = new Map<string, { contentType: string; data: Buffer }>();
  override async health() {
    return { now: new Date(0).toISOString() };
  }
  override async saveEventImage(_uploadedBy: string, contentType: string, data: Buffer) {
    const id = "11111111-1111-4111-8111-111111111111";
    this.testEventImages.set(id, { contentType, data });
    return id;
  }
  override async loadEventImage(id: string) {
    return this.testEventImages.get(id) ?? null;
  }
}

// Build an app whose Neon verifier trusts a locally generated Ed25519 key, plus
// a matching JWT minter — no live Neon Auth call needed.
async function authedApp(options: { store?: MemoryStore; gateway?: RazorpayGateway } = {}) {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  jwk.alg = "EdDSA";
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const neonVerifier = createNeonVerifier({ jwks, issuer: ISS });
  const store = options.store ?? new MemoryStore();
  const app = createApp({ store, neonVerifier, razorpayGateway: options.gateway ?? new FakeRazorpayGateway() });
  const mint = (claims: Record<string, unknown> = {}, expSec = 60) =>
    new SignJWT({ sub: "node-user", ...claims })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(ISS)
      .setExpirationTime(`${expSec}s`)
      .sign(privateKey);
  return { app, mint, privateKey, store };
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

test("attendee state hides other users and organizer-only collections", async () => {
  const { app, mint } = await authedApp();
  const token = await mint({ email: "hardik.jain@college.edu", name: "Aditya Rao" });
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const state = response.body.state;
  assert.ok(state.orders.length > 0);
  assert.ok(state.orders.every((order: { buyerEmail: string }) => order.buyerEmail === "hardik.jain@college.edu"));
  assert.ok(state.tickets.every((ticket: { attendeeEmail: string }) => ticket.attendeeEmail === "hardik.jain@college.edu"));
  for (const key of ["invitePasses", "scanLogs", "settlements", "auditLogs"] as const) {
    assert.deepEqual(state[key], []);
  }
});

test("attendee PUT cannot replace events, orders, tickets, or financial state", async () => {
  const { app, mint } = await authedApp();
  const attendee = await mint({ email: "attendee@example.com", name: "Attendee" });
  const attendeeState = (await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${attendee}`)
    .expect(200)).body.state;
  attendeeState.events = [];
  attendeeState.orders = [];
  attendeeState.tickets = [];
  attendeeState.settlements = [];
  attendeeState.auditLogs = [];
  await request(app)
    .put("/api/state")
    .set("Authorization", `Bearer ${attendee}`)
    .send({ state: attendeeState })
    .expect(204);

  const owner = await mint({ email: "ophardik001@gmail.com", name: "Owner" });
  const ownerState = (await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${owner}`)
    .expect(200)).body.state;
  assert.equal(ownerState.events.length, createInitialAppState().events.length);
  assert.equal(ownerState.orders.length, createInitialAppState().orders.length);
  assert.equal(ownerState.tickets.length, createInitialAppState().tickets.length);
  assert.equal(ownerState.settlements.length, createInitialAppState().settlements.length);
});

test("attendee PUT accepts only sanitized new pending access requests", async () => {
  const { app, mint } = await authedApp();
  const attendee = await mint({ email: "alice@example.com", name: "Verified Alice" });
  const state = (await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${attendee}`)
    .expect(200)).body.state;
  state.requests = [
    {
      id: "client-pending",
      requesterName: "Forged Name",
      zoneName: "Main Gate",
      durationHours: "2",
      purpose: "Volunteer access",
      status: "pending",
      requestTime: new Date().toISOString(),
    },
    {
      id: "client-approved",
      requesterName: "Forged Name",
      zoneName: "Backstage",
      durationHours: "9",
      purpose: "Self approval",
      status: "approved",
      requestTime: new Date().toISOString(),
    },
  ];
  await request(app)
    .put("/api/state")
    .set("Authorization", `Bearer ${attendee}`)
    .send({ state })
    .expect(204);

  const owner = await mint({ email: "ophardik001@gmail.com", name: "Owner" });
  const ownerState = (await request(app)
    .get("/api/state")
    .set("Authorization", `Bearer ${owner}`)
    .expect(200)).body.state;
  const saved = ownerState.requests.filter((item: { purpose: string }) => item.purpose === "Volunteer access");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].requesterName, "Verified Alice");
  assert.equal(saved[0].status, "pending");
  assert.equal(ownerState.requests.some((item: { purpose: string }) => item.purpose === "Self approval"), false);
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

test("runtime readiness only verifies the installed Alembic head", async () => {
  const statements: string[] = [];
  const store = Object.create(PostgresAppStateStore.prototype) as PostgresAppStateStore;
  Object.defineProperty(store, "pool", {
    value: {
      query: async (sql: string) => {
        statements.push(sql);
        return sql === "SELECT 1"
          ? { rows: [] }
          : { rows: [{ version_num: EXPECTED_ALEMBIC_HEAD }] };
      },
    },
  });

  await store.ensureReady();

  assert.deepEqual(statements, [
    "SELECT 1",
    "SELECT version_num FROM scanner.alembic_version",
  ]);
  assert.ok(statements.every((sql) => !/\b(?:CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)));
});

test("runtime readiness rejects a database below the expected head", async () => {
  const store = Object.create(PostgresAppStateStore.prototype) as PostgresAppStateStore;
  Object.defineProperty(store, "pool", {
    value: {
      query: async (sql: string) => sql === "SELECT 1"
        ? { rows: [] }
        : { rows: [{ version_num: "0002_cleanup_legacy_and_sync" }] },
    },
  });

  await assert.rejects(
    store.ensureReady(),
    /expected 0003_public_schema, found 0002_cleanup_legacy_and_sync/,
  );
});
