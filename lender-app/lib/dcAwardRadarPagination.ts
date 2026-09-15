/**
 * Client-driven pagination helpers for DC award radar.
 *
 * Fail-closed: every Convex `list` call loads at most PAGE_SIZE rows via
 * `.paginate()` / `.take()` — never `.collect()`. "Load all" is a client loop
 * that requests one page per query, with a hard max page count.
 */

export const DC_AWARD_RADAR_PAGE_SIZE = 200;
export const DC_AWARD_RADAR_PAGE_SIZE_MIN = 50;
export const DC_AWARD_RADAR_PAGE_SIZE_MAX = 200;
/** Hard cap for client "Load all" — 100 × 200 = 20_000 rows max. */
export const DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES = 100;

export function clampDcAwardRadarPageSize(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DC_AWARD_RADAR_PAGE_SIZE;
  }
  const n = Math.floor(requested);
  if (n < DC_AWARD_RADAR_PAGE_SIZE_MIN) return DC_AWARD_RADAR_PAGE_SIZE_MIN;
  if (n > DC_AWARD_RADAR_PAGE_SIZE_MAX) return DC_AWARD_RADAR_PAGE_SIZE_MAX;
  return n;
}

export type DcAwardRadarPageMergeRow = { _id: string };

/**
 * Append next page rows, dropping duplicates by `_id` (reactive first page
 * refresh can overlap an already-loaded id).
 */
export function mergeDcAwardRadarSignalPages<T extends DcAwardRadarPageMergeRow>(
  existing: readonly T[],
  nextPage: readonly T[],
): T[] {
  if (nextPage.length === 0) return [...existing];
  if (existing.length === 0) return [...nextPage];
  const seen = new Set(existing.map((row) => row._id));
  const out = [...existing];
  for (const row of nextPage) {
    if (seen.has(row._id)) continue;
    seen.add(row._id);
    out.push(row);
  }
  return out;
}

export type DcAwardRadarLoadAllGate = {
  pagesLoaded: number;
  maxPages: number;
  truncated: boolean;
  continueCursor: string | null;
};

/**
 * Whether the client Load-all loop may request another page.
 * Stops when the server reports no more rows, cursor is missing, or the
 * hard page cap is reached (fail-closed — never unbounded).
 */
export function dcAwardRadarLoadAllCanContinue(
  gate: DcAwardRadarLoadAllGate,
): boolean {
  if (!gate.truncated) return false;
  if (!gate.continueCursor) return false;
  if (gate.pagesLoaded >= gate.maxPages) return false;
  return true;
}

export function formatDcAwardRadarListStatus(args: {
  loadedCount: number;
  truncated: boolean;
  pageSize: number;
  hitPageCap?: boolean;
}): string {
  const { loadedCount, truncated, pageSize, hitPageCap } = args;
  if (hitPageCap) {
    return `Showing ${loadedCount} (page cap ${DC_AWARD_RADAR_MAX_LOAD_ALL_PAGES} × ${pageSize} reached — more may exist)`;
  }
  if (truncated) {
    return `Showing ${loadedCount} (more available)`;
  }
  return `Showing ${loadedCount}`;
}
