import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState";
import { createApp } from "./app";
import type { AppStateStore } from "./store";

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

test("health route returns database status", async () => {
  const app = createApp({ store: new MemoryStore() });
  const response = await request(app).get("/api/health").expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.db.now, new Date(0).toISOString());
});

test("state route returns initial state when database is empty", async () => {
  const app = createApp({ store: new MemoryStore() });
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", "Bearer gp_session_test")
    .expect(200);

  assert.equal(response.body.state.user.name, "Hardik Jain");
  assert.ok(Array.isArray(response.body.state.events));
});

test("state route validates payloads before persisting", async () => {
  const app = createApp({ store: new MemoryStore() });
  await request(app)
    .put("/api/state")
    .set("Authorization", "Bearer gp_session_test")
    .send({ state: { bad: true } })
    .expect(400);
});

test("state route persists a valid snapshot", async () => {
  const app = createApp({ store: new MemoryStore() });
  const state = createInitialAppState();
  state.user.name = "Production Test User";

  await request(app)
    .put("/api/state")
    .set("Authorization", "Bearer gp_session_test")
    .send({ state })
    .expect(204);
    
  const response = await request(app)
    .get("/api/state")
    .set("Authorization", "Bearer gp_session_test")
    .expect(200);

  assert.equal(response.body.state.user.name, "Production Test User");
});

test("unknown API route returns 404", async () => {
  const app = createApp({ store: new MemoryStore() });
  await request(app).get("/api/missing").expect(404);
});

test("GET /api/qr/me returns active qr payload", async () => {
  const app = createApp({ store: new MemoryStore() });
  const response = await request(app)
    .get("/api/qr/me")
    .set("Authorization", "Bearer gp_session_test")
    .expect(200);

  assert.equal(response.body.status, "active");
  assert.match(response.body.qr_payload, /^gp:v1:/);
});

test("POST /api/scanner/pair registers scanner with valid code", async () => {
  const app = createApp({ store: new MemoryStore() });
  const response = await request(app)
    .post("/api/scanner/pair")
    .send({ pairing_code: "123456" })
    .expect(200);

  assert.equal(response.body.scanner_id, "scanner_main_gate");
  assert.equal(response.body.token, "gp_scanner_session_token");
});

test("POST /api/scanner/scan rejects malformed payloads", async () => {
  const app = createApp({ store: new MemoryStore() });
  await request(app)
    .post("/api/scanner/scan")
    .send({ payload: "invalid-prefix" })
    .expect(400);
});


