// Pure frontend helper for event expiry calculation.
// Returns true ONLY when event's end date/time has passed (now >= end_time).
export function isEventExpired(endTime?: string | Date | null): boolean {
  if (!endTime) return false;
  try {
    const endMs = new Date(endTime).getTime();
    if (isNaN(endMs)) return false;
    return Date.now() >= endMs;
  } catch {
    return false;
  }
}
