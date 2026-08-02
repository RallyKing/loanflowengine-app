import type { Doc, Id } from "@/convex/_generated/dataModel";
import { slugifyStageName } from "@/lib/pipeline/legacyStageSeed";
import { normalizeStatusKey } from "@/lib/pipelineStatus";

export type PipelineStageDisplay = {
  stage: Doc<"organizationPipelineStages">;
  subStages: Doc<"organizationPipelineSubStages">[];
};

export type PipelineStageIndex = {
  stageById: Map<
    Id<"organizationPipelineStages">,
    Doc<"organizationPipelineStages">
  >;
  subById: Map<
    Id<"organizationPipelineSubStages">,
    Doc<"organizationPipelineSubStages">
  >;
  activeStages: Doc<"organizationPipelineStages">[];
  tree: PipelineStageDisplay[];
};

export type ResolvedPipelineRowStage = {
  stage?: Doc<"organizationPipelineStages">;
  subStage?: Doc<"organizationPipelineSubStages">;
  stageId?: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
  /** True when stage was inferred from legacy `status` rather than stored ids. */
  inferredFromStatus?: boolean;
};

function matchSubStage(
  index: PipelineStageIndex,
  parentStageId: Id<"organizationPipelineStages">,
  subSlug: string,
): Doc<"organizationPipelineSubStages"> | undefined {
  const key = normalizeStatusKey(subSlug);
  const node = index.tree.find((t) => t.stage._id === parentStageId);
  const fromTree = node?.subStages.find(
    (s) => s.slug === key || slugifyStageName(s.name) === key,
  );
  if (fromTree) return fromTree;
  for (const sub of index.subById.values()) {
    if (
      sub.parentStageId === parentStageId &&
      (sub.slug === key || slugifyStageName(sub.name) === key)
    ) {
      return sub;
    }
  }
  return undefined;
}

function matchStageByStatus(
  index: PipelineStageIndex,
  rawStatus: string,
): ResolvedPipelineRowStage | null {
  const trimmed = rawStatus.trim();
  if (!trimmed) return null;

  const [parentRaw, subRaw] = trimmed.split("::");
  const parentKey = normalizeStatusKey(parentRaw ?? trimmed);

  for (const stage of index.stageById.values()) {
    if (
      stage.slug === parentKey ||
      slugifyStageName(stage.name) === parentKey ||
      stage.name.trim().toLowerCase() === (parentRaw ?? trimmed).trim().toLowerCase()
    ) {
      const subStage = subRaw?.trim()
        ? matchSubStage(index, stage._id, subRaw)
        : undefined;
      return {
        stage,
        subStage,
        stageId: stage._id,
        subStageId: subStage?._id,
        inferredFromStatus: true,
      };
    }
  }

  const byActive = index.activeStages.find((s) => s.slug === parentKey);
  if (byActive) {
    return {
      stage: byActive,
      stageId: byActive._id,
      inferredFromStatus: true,
    };
  }

  return null;
}

/**
 * Resolve the effective pipeline stage for a file row.
 * Falls back to matching org stages from legacy/free-form `status` strings
 * (e.g. "Non Responsive" → slug `non_responsive`).
 */
export function resolvePipelineRowStage(
  row: {
    stageId?: Id<"organizationPipelineStages">;
    subStageId?: Id<"organizationPipelineSubStages">;
    status?: string;
  },
  index: PipelineStageIndex,
): ResolvedPipelineRowStage {
  if (row.stageId) {
    const stage = index.stageById.get(row.stageId);
    if (stage) {
      const subStage = row.subStageId
        ? index.subById.get(row.subStageId)
        : undefined;
      return {
        stage,
        subStage,
        stageId: row.stageId,
        subStageId: row.subStageId,
      };
    }
  }

  const fromStatus = matchStageByStatus(index, row.status ?? "");
  if (fromStatus) return fromStatus;

  return {};
}

export function buildParentStageOptions(
  index: PipelineStageIndex,
  currentStage?: Doc<"organizationPipelineStages">,
) {
  const opts = index.tree.map(({ stage }) => ({
    value: String(stage._id),
    label: stage.name,
    badgeStyle: {
      backgroundColor: `${stage.color}22`,
      borderColor: stage.color,
      color: "#111827",
    },
  }));

  if (
    currentStage &&
    !opts.some((o) => o.value === String(currentStage._id))
  ) {
    opts.unshift({
      value: String(currentStage._id),
      label: currentStage.isArchived
        ? `${currentStage.name} (archived)`
        : currentStage.name,
      badgeStyle: {
        backgroundColor: `${currentStage.color}22`,
        borderColor: currentStage.color,
        color: "#111827",
      },
    });
  }

  return opts;
}
