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

