/**
 * Read bounds for the pipeline hub table subscription (`pipeline:listTablePreview`)
 * and hub triage (`taskHighlights:getHubTriageHighlightMap`).
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
 * Org-scoped ceiling for junction/edge tables on the hub path
 * (`fileLenders`, `fileClients`, `fileProjects`, `fileTeamMembers`, `fileTasks`).
 *
 * One indexed `by_organization` take replaces the PR #38 per-file fan-out
 * (`takeAcrossFiles`), which multiplied query count and docs for orgs that are
 * most of the deployment. Filter to the visible file id set in memory.
 */
export const PIPELINE_ORG_EDGE_SCAN_CAP = 20_000;

/**
 * Per-file cap for junction/edge reads that lack an org index
 * (`contactFileLinks`) or for single-file workspace helpers.
 * A loan file with more than this many edges of one kind is pathological.
 */
export const PIPELINE_FILE_EDGE_SCAN_CAP = 200;

/**
 * Org-scoped ceiling for `tasks.by_organization` when loading related tasks for
 * the hub graph (filter to visible `relatedFileId`s in memory). Replaces
 * per-file `by_relatedFile` fan-out on `listTablePreview`.
 */
export const PIPELINE_ORG_RELATED_TASK_SCAN_CAP = 5_000;

/** Per-file cap for `tasks.by_relatedFile` (triage + single-file helpers). */
export const PIPELINE_FILE_RELATED_TASK_SCAN_CAP = 200;

/**
 * Per-file cap for hub note badge counts via `pipelineFileNotes.by_org_file`.
 * Readers take `cap + 1` and saturate at this value.
 */
export const PIPELINE_FILE_NOTE_SCAN_CAP = 500;

/** Absolute ceiling for `contacts:list` when the caller passes no explicit limit. */
export const CONTACTS_LIST_ABSOLUTE_CAP = 5_000;

/**
 * @deprecated Triage no longer org-scans tasks. Visible hub files are loaded via
 * `PIPELINE_TABLE_PREVIEW_MAX_ROWS`, then tasks via `by_relatedFile` per file
 * (capped by `PIPELINE_FILE_RELATED_TASK_SCAN_CAP`).
 */
export const HUB_TRIAGE_TASK_SCAN_CAP = 5_000;

/**
 * True when a bounded read came back exactly at its cap, meaning more rows may
 * exist. Readers take `cap + 1` where they need to distinguish the two.
 */
export function readSaturated(received: number, cap: number): boolean {
  return received > cap;
}
