import { InvitePass, EventItem } from "./types";

// Pure helper for event expiry calculation.
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

// Pure helper for pass expiry calculation.
// Returns true when a pass is explicitly expired/revoked, its validity date string has passed,
// or its associated event's end time has passed.
export function isPassExpired(
  pass?: Partial<InvitePass> | null,
  events?: EventItem[]
): boolean {
  if (!pass) return false;

  // 1. Explicit status check
  const statusUpper = (pass.status || "").toUpperCase();
  if (statusUpper === "EXPIRED" || statusUpper === "REVOKED") {
    return true;
  }

  const text = (pass.validityText || "").trim();
  const textLower = text.toLowerCase();

  // 2. Un-expiring 24/7 access
  if (textLower.includes("24/7") || textLower.includes("unlimited")) {
    return false;
  }

  // 3. Event-linked pass check
  if (events && events.length > 0) {
    const matchingEvent = events.find(
      (e) =>
        e.title &&
        (pass.title?.toLowerCase().includes(e.title.toLowerCase()) ||
          e.title?.toLowerCase().includes((pass.title || "").toLowerCase()))
    );
    if (matchingEvent && matchingEvent.endTime) {
      if (isEventExpired(matchingEvent.endTime)) {
        return true;
      }
    }
  }

  // 4. "Valid: 6 Aug 2026" / "Valid: Aug 6, 2026" / "Valid: 2026-08-06" / "Valid: 06/08/2026"
  const dateMatch = text.match(
    /(?:valid|expires|validity|date|until|expired)?\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i
  );

  if (dateMatch) {
    const rawDateStr = dateMatch[1];
    const parsedDate = new Date(rawDateStr);
    if (!isNaN(parsedDate.getTime())) {
      // End of day: 23:59:59.999
      parsedDate.setHours(23, 59, 59, 999);
      if (Date.now() >= parsedDate.getTime()) {
        return true;
      }
    }
  }

  // 5. "Expires: Today, 2:00 PM" or "Valid: Today, 2:00 PM - 6:00 PM"
  if (textLower.includes("today")) {
    const expMatch =
      textLower.match(/expires:\s*today,\s*(\d{1,2}):(\d{2})\s*(am|pm)/) ||
      textLower.match(/exp:\s*(\d{1,2}):(\d{2})/);
    if (expMatch) {
      const [_, h, m, ap] = expMatch;
      let hour = parseInt(h);
      if (ap && ap === "pm" && hour < 12) hour += 12;
      if (ap && ap === "am" && hour === 12) hour = 0;
      const min = parseInt(m);
      const targetDate = new Date();
      targetDate.setHours(hour, min, 59, 999);
      return Date.now() >= targetDate.getTime();
    }

    const rangeMatch = textLower.match(
      /(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)/
    );
    if (rangeMatch) {
      const [_, _sh, _sm, _sap, eh, em, eap] = rangeMatch;
      let endHour = parseInt(eh);
      if (eap === "pm" && endHour < 12) endHour += 12;
      if (eap === "am" && endHour === 12) endHour = 0;
      const endMin = parseInt(em);
      const targetDate = new Date();
      targetDate.setHours(endHour, endMin, 59, 999);
      return Date.now() >= targetDate.getTime();
    }
  }

  // 6. Explicit "Expired:" text without date
  if (textLower.includes("expired")) {
    return true;
  }

  return false;
}
