/**
 * Merge deferred `listTablePreviewEnrichment` into first-paint hub rows.
 * Until enrichment arrives, deferred fields stay unknown (`undefined`) — do not
 * coerce to empty arrays/zeros. Callers that need capital, project clients,
 * graph badges, or note counts must wait for enrichment (or skip those filters/UI).
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type { PipelineRowGraphLinks } from "@/convex/pipelineGraphPreviewLinks";
import type { LinkedClientSummary } from "@/lib/pipelineClientRelationships";
import type { ProjectCapitalRollup } from "@/lib/projectCapitalStack";

export type PipelineTablePreviewEnrichmentRow = {
  fileId: Id<"pipeline">;
  graphLinks: PipelineRowGraphLinks;
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
 * Live ready: enrichment covers every current core file id — not merely
 * `enrichment !== undefined`. Convex can retain a prior enrichment array while
 * core advances; sticky "defined" would let filters false-negative on new ids.
 *
 * - enrichment undefined → false (still loading)
 * - core empty → true once enrichment is defined (incl. [])
 * - enrichment empty while core non-empty → false (merge leaves deferred unknown)
 */
export function isTablePreviewEnrichmentAligned(
  coreRows: ReadonlyArray<{ _id: string }>,
  enrichment: PipelineTablePreviewEnrichmentRow[] | undefined,
): boolean {
  if (enrichment === undefined) return false;
  if (coreRows.length === 0) return true;
  if (enrichment.length === 0) return false;
  const ids = new Set(enrichment.map((e) => String(e.fileId)));
  return coreRows.every((r) => ids.has(String(r._id)));
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
    return {
      ...row,
      graphLinks: extra.graphLinks,
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
  });
}
