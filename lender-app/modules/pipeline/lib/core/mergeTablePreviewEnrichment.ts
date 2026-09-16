/**
 * Merge deferred `listTablePreviewEnrichment` into first-paint hub rows.
 * Until enrichment arrives, deferred fields stay unknown (`undefined`) — do not
 * coerce to empty arrays/zeros. Callers that need capital, project clients,
 * graph badges, or note counts must wait for enrichment (or skip those filters/UI).
 *
 * Soft-fail / degraded enrichment may omit `graphLinks` (`undefined`). That is
 * NOT fully enriched: empty published `graphLinks` (intentional `{}` / empty
 * arrays) still counts; missing graph must not force-ready or sticky-persist.
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type { PipelineRowGraphLinks } from "@/convex/pipelineGraphPreviewLinks";
import type { LinkedClientSummary } from "@/lib/pipelineClientRelationships";
import type { ProjectCapitalRollup } from "@/lib/projectCapitalStack";

export type PipelineTablePreviewEnrichmentRow = {
  fileId: Id<"pipeline">;
  /** Omitted when graph soft-fails / is degraded — not the same as empty links. */
  graphLinks?: PipelineRowGraphLinks;
  fileNotesCount: number;
  projectCapitalRollup?: ProjectCapitalRollup;
  projectLinkedClients: LinkedClientSummary[];
};

type EnrichmentSentinelFields = Pick<
  PipelineTablePreviewRow,
  "fileNotesCount" | "graphLinks" | "projectLinkedClients"
>;

/**
 * True when a row carries the deferred fields always set by enrichment merge.
 * `projectCapitalRollup` is optional (absent without a project) — ignore it.
 * `graphLinks === undefined` means not enriched; empty arrays means enriched.
 */
export function isTablePreviewRowFullyEnriched(
  row: EnrichmentSentinelFields,
): boolean {
  return (
    row.fileNotesCount !== undefined &&
    row.graphLinks !== undefined &&
    row.projectLinkedClients !== undefined
  );
}

/** Offline/cached snapshot safe for capital/client filters. Empty → true. */
export function isTablePreviewRowsFullyEnriched(
  rows: ReadonlyArray<EnrichmentSentinelFields>,
): boolean {
  return rows.every(isTablePreviewRowFullyEnriched);
}

/**
 * Enrichment payload is usable for a single file only when graph (and other
 * always-present sentinels) are defined. Soft-fail may omit `graphLinks`.
 */
export function isEnrichmentPayloadComplete(
  extra: Pick<
    PipelineTablePreviewEnrichmentRow,
    "graphLinks" | "fileNotesCount" | "projectLinkedClients"
  >,
): boolean {
  return (
    extra.fileNotesCount !== undefined &&
    extra.graphLinks !== undefined &&
    extra.projectLinkedClients !== undefined
  );
}

/**
 * Live ready: enrichment covers every current core file id with a *complete*
 * payload — not merely `enrichment !== undefined`. Convex can retain a prior
 * enrichment array while core advances; sticky "defined" would let filters
 * false-negative on new ids. Soft-fail omitting `graphLinks` is not ready.
 *
 * - enrichment undefined → false (still loading)
 * - core empty → true once enrichment is defined (incl. [])
 * - enrichment empty while core non-empty → false (merge leaves deferred unknown)
 * - enrichment row missing graphLinks → false (degraded / soft-fail)
 */
export function isTablePreviewEnrichmentAligned(
  coreRows: ReadonlyArray<{ _id: string }>,
  enrichment: PipelineTablePreviewEnrichmentRow[] | undefined,
): boolean {
  if (enrichment === undefined) return false;
  if (coreRows.length === 0) return true;
  if (enrichment.length === 0) return false;
  const byId = new Map(enrichment.map((e) => [String(e.fileId), e]));
  return coreRows.every((r) => {
    const extra = byId.get(String(r._id));
    return extra !== undefined && isEnrichmentPayloadComplete(extra);
  });
}

export function mergeTablePreviewEnrichment(
  rows: PipelineTablePreviewRow[],
  enrichment: PipelineTablePreviewEnrichmentRow[] | undefined,
): PipelineTablePreviewRow[] {
  if (!enrichment || enrichment.length === 0) return rows;
  const byId = new Map(enrichment.map((e) => [String(e.fileId), e]));
  return rows.map((row) => {
    const extra = byId.get(String(row._id));
    if (!extra) return row;
    // Do not publish undefined graphLinks onto the row — leave deferred unknown
    // so fully-enriched / offline gates stay false until graph is present.
    const next: PipelineTablePreviewRow = {
      ...row,
      fileNotesCount: extra.fileNotesCount,
      projectCapitalRollup: extra.projectCapitalRollup,
      projectLinkedClients: extra.projectLinkedClients,
      searchText: [
        row.searchText,
        extra.projectCapitalRollup?.searchBlob ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
    if (extra.graphLinks !== undefined) {
      next.graphLinks = extra.graphLinks;
    }
    return next;
  });
}
