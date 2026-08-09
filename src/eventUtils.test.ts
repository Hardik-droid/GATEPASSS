import assert from "node:assert/strict";
import test from "node:test";
import { isEventExpired } from "./eventUtils";

test("Future event is NOT expired", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(isEventExpired(future), false);
});

test("Currently live event (startTime < now < endTime) is NOT expired", () => {
  const liveEnd = new Date(Date.now() + 3600000).toISOString();
  assert.equal(isEventExpired(liveEnd), false);
});

test("Just expired event (endTime <= now) IS expired", () => {
  const pastEnd = new Date(Date.now() - 1000).toISOString();
  assert.equal(isEventExpired(pastEnd), true);
});

test("Old historical event (ended long ago) IS expired", () => {
  const oldEnd = new Date(Date.now() - 30 * 86400000).toISOString();
  assert.equal(isEventExpired(oldEnd), true);
});

test("Missing or invalid endTime does NOT expire event (safety fallback)", () => {
  assert.equal(isEventExpired(undefined), false);
  assert.equal(isEventExpired(null), false);
  assert.equal(isEventExpired("invalid_date_string"), false);
});
