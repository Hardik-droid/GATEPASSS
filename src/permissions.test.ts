import assert from "node:assert/strict";
import test from "node:test";

import { hasOrganizerAccess, roleForAuthenticatedEmail } from "./permissions";
import { UserRole, type UserProfile } from "./types";

const user: UserProfile = {
  id: "u1",
  name: "User",
  email: "user@example.com",
  phone: "",
  role: UserRole.ATTENDEE,
  avatarUrl: "",
};

test("OAuth email makes only the configured owner an Owner", () => {
  assert.equal(roleForAuthenticatedEmail("OPHARDIK001@gmail.com"), UserRole.OWNER);
  assert.equal(roleForAuthenticatedEmail("user@example.com"), UserRole.ATTENDEE);
  assert.equal(roleForAuthenticatedEmail(null), UserRole.ATTENDEE);
});

test("organizer access is exclusive to the authenticated owner email", () => {
  assert.equal(hasOrganizerAccess(user, "user@example.com"), false);
  assert.equal(
    hasOrganizerAccess(
      { ...user, email: "ophardik001@gmail.com" },
      "ophardik001@gmail.com",
    ),
    true,
  );
  assert.equal(
    hasOrganizerAccess(
      { ...user, email: "other@example.com", role: UserRole.OWNER },
      "other@example.com",
    ),
    false,
  );
  assert.equal(
    hasOrganizerAccess(
      { ...user, email: "ophardik001@gmail.com" },
      "other@example.com",
    ),
    false,
  );
});
