/**
 * Canonical stored `authUsers.email`: trim + lowercase.
 * Empty / whitespace-only → `undefined` (omit field on insert).
 */
export function normalizeAuthEmail(
  raw: string | undefined | null,
): string | undefined {
  if (raw == null) return undefined;
  let t = raw.trim();
  try {
    t = t.normalize("NFKC");
  } catch {
    /* ignore */
  }
  t = t.toLowerCase();
  return t.length > 0 ? t : undefined;
}
