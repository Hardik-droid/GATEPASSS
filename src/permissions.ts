import { UserRole, type UserProfile } from "./types";

export const OWNER_EMAIL = "ophardik001@gmail.com";

export function roleForAuthenticatedEmail(email: string | null | undefined): UserRole {
  return email?.trim().toLowerCase() === OWNER_EMAIL
    ? UserRole.OWNER
    : UserRole.ATTENDEE;
}

export function hasOrganizerAccess(
  user: UserProfile,
  authenticatedEmail: string | null,
): boolean {
  const email = authenticatedEmail?.trim().toLowerCase();
  return Boolean(
    email
    && email === user.email.trim().toLowerCase()
    && roleForAuthenticatedEmail(email) === UserRole.OWNER,
  );
}
