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
