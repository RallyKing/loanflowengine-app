import type { Doc } from "./_generated/dataModel";

/** Multiple rows per `accountId` can exist after bad migrations; never throw from `.unique()`. */
export function pickCanonicalUserPreferences(
  rows: Doc<"userPreferences">[],
): Doc<"userPreferences"> | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;
  return rows.reduce((best, cur) =>
    cur.updatedAt > best.updatedAt ? cur : best,
  );
}
