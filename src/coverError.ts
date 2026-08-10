// Turns anything a cover-image upload can fail with — an Error, a JSON error
// body, a FastAPI-style validation array — into one readable string.
//
// Without this, a non-string reaches `new Error(...)` / JSX and JavaScript
// coerces it with String(), which renders an object as the literal text
// "[object Object]". Error state for this feature is `string | null`, and this
// is the only thing allowed to produce that string.

export const COVER_UPLOAD_FALLBACK = "Please upload a JPG, PNG or WebP image under 50 MB.";

// "[object Object]" is never a message worth showing, even if some older path
// already baked it into an Error.
function usable(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "[object Object]") return null;
  return trimmed;
}

// A body field may be a plain string ({"error": "..."}) or a list of validation
// issues ({"detail": [{"msg": "..."}]}), which is what FastAPI returns on 422.
function fromField(field: unknown): string | null {
  if (typeof field === "string") return usable(field);
  if (!Array.isArray(field)) return null;
  const parts = field
    .map((item) => {
      if (typeof item === "string") return item;
      const issue = item as { msg?: unknown; message?: unknown } | null;
      if (typeof issue?.msg === "string") return issue.msg;
      if (typeof issue?.message === "string") return issue.message;
      return null;
    })
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  return parts.length ? parts.join(", ") : null;
}

export function coverErrorMessage(value: unknown): string {
  if (typeof value === "string") return usable(value) ?? COVER_UPLOAD_FALLBACK;
  if (value instanceof Error) return usable(value.message) ?? COVER_UPLOAD_FALLBACK;
  if (typeof value === "object" && value !== null) {
    const body = value as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      const message = fromField(body[key]);
      if (message) return message;
    }
  }
  return COVER_UPLOAD_FALLBACK;
}
