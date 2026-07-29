import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiBase } from "./apiBase";

test("drops a loopback base that was baked into a deployed bundle", () => {
  assert.equal(resolveApiBase("http://127.0.0.1:8010", "https://gatepasss.vercel.app"), "");
  assert.equal(resolveApiBase("http://localhost:3001", "https://gatepasss.vercel.app"), "");
  assert.equal(resolveApiBase("http://0.0.0.0:8010", "https://gatepasss.vercel.app"), "");
  assert.equal(resolveApiBase("http://[::1]:8010", "https://gatepasss.vercel.app"), "");
});

test("drops an insecure API base from an HTTPS deployment", () => {
  assert.equal(resolveApiBase("http://api.gatepass.app", "https://gatepasss.vercel.app"), "");
});

test("keeps a loopback base while developing locally", () => {
  assert.equal(
    resolveApiBase("http://127.0.0.1:8010", "http://localhost:5173"),
    "http://127.0.0.1:8010",
  );
});

test("keeps a real remote base and strips trailing slashes", () => {
  assert.equal(
    resolveApiBase("https://api.gatepass.app/", "https://gatepasss.vercel.app"),
    "https://api.gatepass.app",
  );
});

test("treats unset or blank as same-origin", () => {
  assert.equal(resolveApiBase(undefined, "https://gatepasss.vercel.app"), "");
  assert.equal(resolveApiBase("   ", "https://gatepasss.vercel.app"), "");
});
