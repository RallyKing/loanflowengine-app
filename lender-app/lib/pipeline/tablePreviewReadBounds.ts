/**
 * Read bounds for the pipeline hub table subscription (`pipeline:listTablePreview`).
 *
 * The hub is a single long-lived Convex subscription that re-runs on every write
 * touching any joined table. Every read it performs must be index-scoped and
 * capped so the subscription cost stays proportional to the *visible* rows
 * rather than to org (or table) size.
 *
 * These caps are deliberately generous relative to real data — they exist to
 * fail closed against runaway scans, not to truncate normal workspaces. When a
 * cap is reached the reader reports saturation so callers can surface it
 * instead of silently returning partial data.
 */

/**
 * Hard ceiling on pipeline rows pulled into one hub subscription.
 *
 * The hub renders table, board, and the client → project → loan tree from this
 * single row set (`modules/pipeline/lib/core/hubHierarchyTree.ts`), so it cannot
 * be paginated without changing hub semantics. It can, and must, be capped.
 */
export const PIPELINE_TABLE_PREVIEW_MAX_ROWS = 2_000;

/**
 * Per-file cap for junction/edge reads (`fileLenders`, `fileClients`,
 * `fileProjects`, `fileTeamMembers`, `fileTasks`, `contactFileLinks`).
 * A loan file with more than this many edges of one kind is pathological.
 */
export const PIPELINE_FILE_EDGE_SCAN_CAP = 200;

/** Per-file cap for `tasks.by_relatedFile` reads on the hub graph-link path. */
export const PIPELINE_FILE_RELATED_TASK_SCAN_CAP = 200;

/** Per-file cap for `pipelineFileNotes` reads backing the row note badge. */
export const PIPELINE_FILE_NOTE_SCAN_CAP = 500;

/** Absolute ceiling for `contacts:list` when the caller passes no explicit limit. */
export const CONTACTS_LIST_ABSOLUTE_CAP = 5_000;

/** Absolute ceiling for the org task scan behind `taskHighlights:getHubTriageHighlightMap`. */
export const HUB_TRIAGE_TASK_SCAN_CAP = 5_000;

/**
 * True when a bounded read came back exactly at its cap, meaning more rows may
 * exist. Readers take `cap + 1` where they need to distinguish the two.
 */
export function readSaturated(received: number, cap: number): boolean {
  return received > cap;
}
