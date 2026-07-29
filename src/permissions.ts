import { UserRole, type UserProfile } from "./types";

const ORGANIZER_ROLES = new Set([
  UserRole.OWNER,
  UserRole.EVENT_MANAGER,
  UserRole.FINANCE_MANAGER,
  UserRole.GATE_STAFF,
  UserRole.SCANNER_STAFF,
]);

export function hasOrganizerAccess(
  user: UserProfile,
  authenticatedEmail: string | null,
): boolean {
  return Boolean(
    authenticatedEmail
    && authenticatedEmail.trim().toLowerCase() === user.email.trim().toLowerCase()
    && ORGANIZER_ROLES.has(user.role),
  );
}
