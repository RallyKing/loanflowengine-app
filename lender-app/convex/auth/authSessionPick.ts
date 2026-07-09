import type { Doc } from "../_generated/dataModel";

/** Duplicate `authSessions` rows for the same `publicId` must not crash session validation. */
export function pickCanonicalAuthSession(
  rows: Doc<"authSessions">[],
): Doc<"authSessions"> | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;
  return rows.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
}
