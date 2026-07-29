import assert from "node:assert/strict";
import test from "node:test";

import { formatLocation } from "./location";

test("formats the best available locality and country", () => {
  assert.equal(
    formatLocation({ address: { city: "New Delhi", country: "India" } }),
    "New Delhi, India",
  );
  assert.equal(
    formatLocation({ address: { village: "Kufri", country: "India" } }),
    "Kufri, India",
  );
  assert.equal(formatLocation({ address: {} }), null);
});
