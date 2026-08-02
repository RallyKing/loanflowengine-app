import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  buildParentStageOptions,
  resolvePipelineRowStage,
  type PipelineStageIndex,
} from "@/lib/pipeline/resolvePipelineRowStage";

function stage(
  id: string,
  name: string,
  slug: string,
  order = 10,
  isArchived = false,
): Doc<"organizationPipelineStages"> {
  return {
    _id: id as Id<"organizationPipelineStages">,
    _creationTime: 0,
    organizationId: "org" as Id<"organizations">,
    name,
    slug,
    color: "#F59E0B",
    icon: "circle",
    order,
    isDefault: false,
    isArchived,
    createdBy: "test",
    updatedBy: "test",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("resolvePipelineRowStage", () => {
  const nonResponsive = stage("s1", "Non Responsive", "non_responsive", 50);
  const confirm = stage("s2", "Confirm Interest", "confirm_interest", 10);

  const index: PipelineStageIndex = {
    stageById: new Map([
      [nonResponsive._id, nonResponsive],
      [confirm._id, confirm],
    ]),
    subById: new Map(),
    activeStages: [confirm, nonResponsive],
    tree: [
      { stage: confirm, subStages: [] },
      { stage: nonResponsive, subStages: [] },
    ],
  };

  it("resolves custom status label without stageId", () => {
    const resolved = resolvePipelineRowStage(
      { status: "Non Responsive" },
      index,
    );
    expect(resolved.stageId).toBe(nonResponsive._id);
    expect(resolved.inferredFromStatus).toBe(true);
  });

  it("includes archived current stage in parent options", () => {
    const archived = stage("s3", "Old Stage", "old_stage", 99, true);
    const archivedIndex: PipelineStageIndex = {
      ...index,
      stageById: new Map([...index.stageById, [archived._id, archived]]),
    };
    const opts = buildParentStageOptions(archivedIndex, archived);
    expect(opts.some((o) => o.value === String(archived._id))).toBe(true);
    expect(opts[0]?.label).toContain("archived");
  });
});
