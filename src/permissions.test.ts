import assert from "node:assert/strict";
import test from "node:test";

import { hasOrganizerAccess } from "./permissions";
import { UserRole, type UserProfile } from "./types";

const user: UserProfile = {
  id: "u1",
  name: "User",
  email: "user@example.com",
  phone: "",
  role: UserRole.ATTENDEE,
  avatarUrl: "",
};

test("organizer access requires a matching authenticated email and granted role", () => {
  assert.equal(hasOrganizerAccess(user, "user@example.com"), false);
  assert.equal(
    hasOrganizerAccess({ ...user, role: UserRole.EVENT_MANAGER }, "other@example.com"),
    false,
  );
  assert.equal(
    hasOrganizerAccess({ ...user, role: UserRole.EVENT_MANAGER }, "USER@example.com"),
    true,
  );
});
