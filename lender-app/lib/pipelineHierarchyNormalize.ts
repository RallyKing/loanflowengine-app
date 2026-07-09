/**
 * Phase 13.3 Step 3 — canonical keys for client/project dedupe (prod backfill).
 */
export function canonicalizeHierarchyKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
