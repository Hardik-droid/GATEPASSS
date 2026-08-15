import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import request from "supertest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState";
import { UserRole } from "../src/types";
import { createApp } from "./app";
import { createNeonVerifier } from "./neonAuth";
import { PostgresAppStateStore, TICKET_UPSERT_SQL, toEventDbId, type AppStateStore } from "./store";

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
  async createEvent(eventData: any) {
    return { event: eventData, default_gate: { id: "g_1", name: "Owner Gate" } };
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

test("GET /api/state allows unauthenticated public requests", async () => {
  const { app } = await authedApp();
  const response = await request(app).get("/api/state").expect(200);
  assert.ok(response.body.state);
});

test("GET /api/state with invalid or expired token falls back gracefully to public state", async () => {
  const { app, mint } = await authedApp();
  const expiredToken = await mint({}, -10);
  const response = await request(app).get("/api/state").set("Authorization", `Bearer ${expiredToken}`).expect(200);
  assert.ok(response.body.state);
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
  // Host-independent on purpose: an absolute URL here bakes the uploading
  // host into the stored cover value, which is how a dev upload once wrote
  // "http://127.0.0.1:3001/api/event-images?id=..." into a production event.
  assert.ok(
    uploaded.body.url.startsWith("/api/event-images?"),
    `expected a root-relative reference, got ${uploaded.body.url}`,
  );
  const id = new URL(uploaded.body.url, "https://example.test").searchParams.get("id");
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

test("POST /api/events rejects temporary browser cover references", async () => {
  const { app, mint } = await authedApp();
  const token = await mint();
  for (const bannerUrl of ["blob:https://gatepasss.vercel.app/preview", "data:image/png;base64,iVBORw0KGgo="]) {
    const event = { ...createInitialAppState().events[0], bannerUrl };
    await request(app)
      .post("/api/events")
      .set("Authorization", `Bearer ${token}`)
      .send({ event })
      .expect(400);
  }
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

// Publishing one event used to re-upsert every row of the whole state blob:
// ~130 sequential round trips, 49s against Neon, past the serverless time
// budget — the transaction rolled back and the organizer saw "Failed to save".
test("state sync writes only the rows that changed", async () => {
  const store = Object.create(PostgresAppStateStore.prototype) as any;
  const state = createInitialAppState();
  const sql: string[] = [];
  const client = {
    query: async (text: string) => {
      sql.push(text);
      return { rows: [] };
    },
  };

  await store.syncReportingTables(client, state, structuredClone(state));
  assert.deepEqual(sql, [], "an unchanged snapshot must not write anything");

  const published = structuredClone(state);
  published.events = [{ ...state.events[0], id: "ev_new", title: "New Event" }, ...state.events];
  await store.syncReportingTables(client, published, state);

  assert.ok(sql.length > 0, "the new event must be written");
  assert.ok(
    sql.length <= 2 + published.events[0].ticketCategories.length,
    `only the new event's rows may be written, got ${sql.length} queries`,
  );
  assert.ok(
    sql.every((text) => /INSERT INTO (public\.)?(scanner\.)?(events|ticket_categories)/.test(text)),
    "untouched users, orders, tickets and logs must be left alone",
  );
});

test("state sync never truncates the reporting tables", async () => {
  const source = await readFile(new URL("./store.ts", import.meta.url), "utf8");
  assert.ok(
    !/TRUNCATE/i.test(source),
    "TRUNCATE deletes rows created by other users; use upserts",
  );
});

// The cover-persistence root cause. Events are handed back to the browser
// carrying their database uuid, so the client id -> database id mapping must be
// idempotent. When it was not, every save minted a fresh row for an event that
// already had one, and load() re-appended that row as a duplicate event still
// holding its original banner_url — so a newly set cover appeared to revert to
// the default after a refresh, and the event list grew a copy per save.
test("event database id is idempotent for an already-persisted event", () => {
  const clientId = "ev_1785944164551";
  const dbId = toEventDbId(clientId);
  assert.match(dbId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(dbId, clientId);
  // Re-deriving from the id the client now holds must not mint a second row.
  assert.equal(toEventDbId(dbId), dbId);
  assert.equal(toEventDbId(toEventDbId(dbId)), dbId);
});

test("load makes the committed database cover win without duplicating the event", async () => {
  const state = createInitialAppState();
  const staleEvent = {
    ...state.events[0],
    id: "ev_stale_cover",
    bannerUrl: "https://images.example/default.jpg",
  };
  state.events = [staleEvent];
  const committedCover = "/api/event-images?id=11111111-1111-4111-8111-111111111111";
  const store = Object.create(PostgresAppStateStore.prototype) as PostgresAppStateStore;

  (store as any).pool = { query: async (sql: string) => {
    if (sql.includes("SELECT payload FROM app_state")) {
      return { rows: [{ payload: structuredClone(state) }] };
    }
    if (sql.includes("FROM public.events")) {
      return { rows: [{
        id: toEventDbId(staleEvent.id),
        title: staleEvent.title,
        description: staleEvent.description,
        event_type: staleEvent.eventType,
        venue: staleEvent.venue,
        start_time: staleEvent.startTime,
        end_time: staleEvent.endTime,
        banner_url: committedCover,
        capacity: staleEvent.capacity,
      }] };
    }
    throw new Error("Unexpected query");
  } };

  const loaded = await store.load();
  assert.equal(loaded?.events.length, 1);
  assert.equal(loaded?.events[0].id, staleEvent.id);
  assert.equal(loaded?.events[0].bannerUrl, committedCover);
});

test("a persisted cover reference survives PUT /api/state intact", async () => {
  const { app, mint } = await authedApp();
  const token = await mint({ email: "attendee@example.com" });
  const state = createInitialAppState();
  const cover = "/api/event-images?id=11111111-1111-4111-8111-111111111111";
  state.events = [
    {
      id: "ev_cover_1",
      title: "COVER_PERSISTENCE_TEST_001",
      description: "cover persistence",
      eventType: "Concert",
      venue: "Main Stage",
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3_600_000).toISOString(),
      bannerUrl: cover,
      capacity: 100,
      ticketCategories: [],
      coverUploadConfig: { token: "tok_1", createdAt: new Date().toISOString(), hasCustomCover: true },
    },
  ] as any;

  await request(app).put("/api/state").set("Authorization", `Bearer ${token}`).send({ state }).expect(204);
  const response = await request(app).get("/api/state").set("Authorization", `Bearer ${token}`).expect(200);

  const saved = response.body.state.events[0];
  assert.equal(saved.bannerUrl, cover, "cover reference must round-trip unchanged");
  // Previously stripped by the schema, which reset hasCustomCover and minted a
  // new share token on every reload.
  assert.equal(saved.coverUploadConfig?.hasCustomCover, true);
  assert.equal(saved.coverUploadConfig?.token, "tok_1");
});

test("a temporary browser preview can never be stored as a cover", async () => {
  const { app, mint } = await authedApp();
  const token = await mint();
  for (const ephemeral of ["blob:https://gatepasss.vercel.app/8f3c-uuid", "data:image/png;base64,iVBORw0KGgo="]) {
    const state = createInitialAppState();
    state.events = [
      {
        id: "ev_blob",
        title: "T",
        description: "d",
        eventType: "Concert",
        venue: "V",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        bannerUrl: ephemeral,
        capacity: 10,
        ticketCategories: [],
      },
    ] as any;
    await request(app).put("/api/state").set("Authorization", `Bearer ${token}`).send({ state }).expect(400);
  }
});
