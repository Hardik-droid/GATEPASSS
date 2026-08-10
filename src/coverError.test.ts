import assert from "node:assert/strict";
import test from "node:test";
import { coverErrorMessage, COVER_UPLOAD_FALLBACK } from "./coverError";

// The bug this guards: any of these values used to reach `new Error(...)` or
// JSX directly, and rendered in the Event Cover alert as "[object Object]".
const OBJECT_SHAPED_FAILURES: unknown[] = [
  { error: { code: 415, reason: "bad type" } }, // non-string `error` field
  { detail: [{ type: "value_error", msg: "Invalid image", loc: ["body"] }] },
  { unexpected: "shape" },
  new Error("[object Object]"), // already-coerced message from an older path
  {},
  [],
  null,
  undefined,
  0,
];

test("no server response shape can render as [object Object]", () => {
  for (const value of OBJECT_SHAPED_FAILURES) {
    const message = coverErrorMessage(value);
    assert.equal(typeof message, "string");
    assert.ok(message.trim().length > 0, `empty message for ${JSON.stringify(value)}`);
    assert.ok(
      !message.includes("[object Object]"),
      `leaked object text for ${JSON.stringify(value)}`,
    );
  }
});

test("readable server messages are shown to the organizer verbatim", () => {
  assert.equal(coverErrorMessage({ error: "Image is too large." }), "Image is too large.");
  assert.equal(coverErrorMessage("Please upload a JPG."), "Please upload a JPG.");
  assert.equal(coverErrorMessage(new Error("Network down")), "Network down");
});

test("FastAPI validation arrays collapse into one readable line", () => {
  const message = coverErrorMessage({
    detail: [{ msg: "File must be an image" }, { msg: "File too large" }],
  });
  assert.equal(message, "File must be an image, File too large");
});

test("blank and unknown values fall back to the actionable message", () => {
  assert.equal(coverErrorMessage({ error: "   " }), COVER_UPLOAD_FALLBACK);
  assert.equal(coverErrorMessage(undefined), COVER_UPLOAD_FALLBACK);
});
