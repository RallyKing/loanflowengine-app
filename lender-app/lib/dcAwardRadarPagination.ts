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

/**
 * Empty first page after server post-filter, but Convex reports more DB pages.
 * Operators must still see Load more / Load all (not a dead-end empty state).
 */
export function dcAwardRadarEmptyButMoreAvailable(args: {
  loadedCount: number;
  truncated: boolean;
  continueCursor: string | null;
}): boolean {
  return (
    args.loadedCount === 0 &&
    args.truncated &&
    typeof args.continueCursor === "string" &&
    args.continueCursor.length > 0
  );
}

/** Title/description when loaded pages are empty but more pages exist. */
export function formatDcAwardRadarEmptyButMoreCopy(): {
  title: string;
  description: string;
} {
  return {
    title: "No matching signals on loaded pages",
    description:
      "This page had no rows after filters, but more pages are available. Use Load more or Load all to continue — later pages may match.",
  };
}

/**
 * Chip / footnote honesty for loaded-page stats.
 * After Load all exhausts (`truncated === false`), do not keep saying "load more".
 */
export function formatDcAwardRadarLoadedStatsNote(args: {
  truncated: boolean;
  hitPageCap?: boolean;
}): string | null {
  if (args.hitPageCap) {
    return "from loaded pages only — page cap reached; more may exist";
  }
  if (args.truncated) {
    return "from loaded pages only — load more to include more";
  }
  return null;
}

/**
 * Fail-closed GHL: require exhausted pages before send when more can still load.
 * Page-cap leftover allows send with an explicit loaded-pages-only caveat.
 */
export function dcAwardRadarGhlRequiresLoadAllFirst(args: {
  truncated: boolean;
  hitPageCap: boolean;
}): boolean {
  return args.truncated && !args.hitPageCap;
}

export function formatDcAwardRadarGhlTruncatedCaveat(args: {
  hitPageCap: boolean;
}): string {
  if (args.hitPageCap) {
    return "List hit the Load-all page cap — this HighLevel send uses contacts from loaded pages only; more signals may exist beyond the cap.";
  }
  return "List is still truncated — this HighLevel send uses contacts from loaded pages only.";
}
