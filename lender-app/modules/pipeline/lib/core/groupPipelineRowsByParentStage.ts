import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import type { buildPipelineStageIndex } from "@/hooks/useOrganizationPipelineStages";

export type PipelineStageIndex = ReturnType<typeof buildPipelineStageIndex>;

export type PipelineHubParentStageGroup = {
  parentStageId: Id<"organizationPipelineStages">;
  parentStage: Doc<"organizationPipelineStages">;
  rows: PipelineTablePreviewRow[];
};

/** Phase 27.2 — grouped flat file list for hub Loans projection. */
export type PipelineHubStageGroupedFileList = {
  groups: PipelineHubParentStageGroup[];
  unassigned: PipelineTablePreviewRow[] | null;
};

/**
 * Resolve top-level parent stage for a pipeline file row (sub-stages roll up).
 */
export function resolveParentStageId(
  row: {
    stageId?: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
    status: string;
  },
  index: PipelineStageIndex,
): Id<"organizationPipelineStages"> | null {
  if (row.stageId && index.stageById.has(row.stageId)) {
    return row.stageId;
  }
  if (row.subStageId) {
    const sub = index.subById.get(row.subStageId);
    if (sub && index.stageById.has(sub.parentStageId)) {
      return sub.parentStageId;
    }
  }
  const slug = row.status.split("::")[0] ?? row.status;
  const match = index.activeStages.find((s) => s.slug === slug);
  return match?._id ?? null;
}

/**
 * Partition a flat, pre-sorted file list into parent-stage sections (funnel order).
 * Empty parent stages are omitted. Rows without a resolvable active parent go to
 * `unassigned` (rendered last).
 */
export function groupPipelineRowsByParentStage(
  rows: PipelineTablePreviewRow[],
  index: PipelineStageIndex,
): PipelineHubStageGroupedFileList {
  const buckets = new Map<
    Id<"organizationPipelineStages">,
    PipelineTablePreviewRow[]
  >();
  const unassigned: PipelineTablePreviewRow[] = [];
  const activeIds = new Set(index.activeStages.map((s) => s._id));

  for (const row of rows) {
    const parentId = resolveParentStageId(row, index);
    if (!parentId || !activeIds.has(parentId)) {
      unassigned.push(row);
      continue;
    }
    const list = buckets.get(parentId) ?? [];
    list.push(row);
    buckets.set(parentId, list);
  }

  const groups: PipelineHubParentStageGroup[] = [];
  for (const stage of index.activeStages) {
    const stageRows = buckets.get(stage._id);
    if (!stageRows?.length) continue;
    groups.push({
      parentStageId: stage._id,
      parentStage: stage,
      rows: stageRows,
    });
  }

  return {
    groups,
    unassigned: unassigned.length > 0 ? unassigned : null,
  };
}
