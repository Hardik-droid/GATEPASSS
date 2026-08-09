import assert from "node:assert/strict";
import test from "node:test";
import { isEventExpired, isPassExpired } from "./eventUtils";

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

test("Pass with 'Valid: 6 Aug 2026' when today is after 6 Aug 2026 IS expired", () => {
  const pass = {
    title: "XYHXHF",
    status: "APPROVED" as const,
    validityText: "Valid: 6 Aug 2026"
  };
  assert.equal(isPassExpired(pass), true);
});

test("Pass with '24/7 Gate Entry Allowed' is NOT expired", () => {
  const pass = {
    title: "Library Access",
    status: "APPROVED" as const,
    validityText: "24/7 Gate Entry Allowed"
  };
  assert.equal(isPassExpired(pass), false);
});

test("Event-linked pass whose event has ended IS expired", () => {
  const pass = {
    title: "Cultural Fest Pass",
    status: "APPROVED" as const,
    validityText: "Valid for Event"
  };
  const events = [
    {
      id: "evt_1",
      title: "Cultural Fest Pass",
      description: "",
      eventType: "Fest",
      venue: "Main Stage",
      startTime: new Date(Date.now() - 7200000).toISOString(),
      endTime: new Date(Date.now() - 3600000).toISOString(),
      bannerUrl: "",
      capacity: 500,
      ticketCategories: []
    }
  ];
  assert.equal(isPassExpired(pass, events), true);
});
