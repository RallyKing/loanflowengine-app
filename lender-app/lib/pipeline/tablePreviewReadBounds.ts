/**
 * Read bounds for the pipeline hub table subscription (`pipeline:listTablePreview`
 * + deferred `pipeline:listTablePreviewEnrichment`) and hub triage
 * (`taskHighlights:getHubTriageHighlightMap`).
 *
 * The hub paints from `listTablePreview` (ACL, hierarchy, deal columns) then
 * merges enrichment (graph / capital / notes / project linked clients). Both
 * queries re-run on writes touching joined tables. Every read must be
 * index-scoped and capped so cost stays proportional to the *visible* rows
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
 * Per-file cap for junction/edge reads on the hub path
 * (`fileLenders`, `fileClients`, `fileProjects`, `fileTeamMembers`, `fileTasks`,
 * `loanClients`, `contactFileLinks`).
 *
 * Hub joins use visible-scoped `by_file` / `by_pipeline` takes so document cost
 * tracks the visible file set — not org-wide junction cardinality (org
 * take-then-filter over-read archived/snoozed edges after #38/#39).
 */
export const PIPELINE_FILE_EDGE_SCAN_CAP = 200;

/**
 * @deprecated Hub joins no longer org-scan junction tables. Kept so older
 * proofs/docs that mention the constant still resolve; do not use on the hub path.
 */
export const PIPELINE_ORG_EDGE_SCAN_CAP = 20_000;

/**
 * @deprecated Hub graph related-tasks use `by_relatedFile` (same as triage).
 * Kept for reference only — do not use on the hub path.
 */
export const PIPELINE_ORG_RELATED_TASK_SCAN_CAP = 5_000;

/** Per-file cap for `tasks.by_relatedFile` (triage + hub graph). */
export const PIPELINE_FILE_RELATED_TASK_SCAN_CAP = 200;

/**
 * Per-file cap for hub note badge counts via `pipelineFileNotes.by_org_file`.
 * Readers take `cap + 1` and saturate at this value.
 */
export const PIPELINE_FILE_NOTE_SCAN_CAP = 500;

/** Absolute ceiling for `contacts:list` when the caller passes no explicit limit. */
export const CONTACTS_LIST_ABSOLUTE_CAP = 5_000;

/**
 * Cap for hub ACL owned-client / owned-project reads via `by_org_owner`.
 * Replaces org-wide `clients`/`projects` `by_organization` collects.
 */
export const PIPELINE_HUB_ACL_OWNER_SCAN_CAP = 2_000;

/**
 * Cap for hub ACL share-index reads (`resourceShares` / legacy `pipelineFileShares`).
 */
export const PIPELINE_HUB_ACL_SHARE_SCAN_CAP = 5_000;

/**
 * Per-project cap for `projectClients.by_project` on the hub path
 * (`resolveProjectLinkedClients` → `listProjectClientLinks`).
 */
export const PIPELINE_PROJECT_CLIENT_LINKS_SCAN_CAP = 200;

/**
 * Per-project cap for capital-stack `by_project` reads on the hub path
 * (requirements + sources used by `batchCapitalRollupsForProjects`).
 */
export const PIPELINE_PROJECT_CAPITAL_SCAN_CAP = 200;

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
