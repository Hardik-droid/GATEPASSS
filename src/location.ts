export function formatLocation(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const address = (data as { address?: unknown }).address;
  if (!address || typeof address !== "object") return null;

  const parts = address as Record<string, unknown>;
  const locality = ["city", "town", "village", "municipality", "county"]
    .map((key) => parts[key])
    .find((value): value is string => typeof value === "string" && value.length > 0);
  const country = typeof parts.country === "string" ? parts.country : null;
  return [locality, country].filter(Boolean).join(", ") || null;
}
