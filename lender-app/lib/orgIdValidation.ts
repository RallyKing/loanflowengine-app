import type { Id } from "@/convex/_generated/dataModel";

/** Mirrors Convex org / document id rules for early client rejection. */
const MIN_LEN = 10;
const MAX_LEN = 96;

/** Convex document ids are url-safe lowercase alphanumeric strings. */
const CONVEX_ID_RE = /^[a-z0-9]+$/;

/**
 * Table-agnostic Convex document id shape check (length + charset).
 * Server paths should use the same rules via `convex/organizationValidators`.
 */
export function parseConvexDocumentId(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s.length < MIN_LEN || s.length > MAX_LEN) return null;
  if (!CONVEX_ID_RE.test(s)) return null;
  return s;
}

/**
 * Returns a typed org id only when the string matches structural rules for a
 * Convex table id. Does **not** prove the row exists — use Convex validation for that.
 */
export function parseOrganizationId(
  raw: string | null | undefined,
): Id<"organizations"> | null {
  const s = parseConvexDocumentId(raw);
  return (s ?? null) as Id<"organizations"> | null;
}

export function isLikelyConvexOrganizationId(raw: string | null | undefined): boolean {
  return parseOrganizationId(raw) != null;
}
