/**
 * Unit checks for pipeline row stage resolution / parent stage options.
 * Run: npx tsx scripts/resolve-pipeline-row-stage-tests.ts
 *      npm run test:resolve-pipeline-row-stage
 */
import assert from "node:assert/strict";
import {
  buildParentStageOptions,
  resolvePipelineRowStage,
  type PipelineStageIndex,
} from "../modules/pipeline/lib/core/resolvePipelineRowStage";

type OrgStage = PipelineStageIndex["activeStages"][number];

function stage(
  id: string,
  name: string,
  slug: string,
  order = 10,
  isArchived = false,
): OrgStage {
  return {
    _id: id,
    _creationTime: 0,
    organizationId: "org",
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
  } as OrgStage;
}

function main() {
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

  const resolved = resolvePipelineRowStage(
    { status: "Non Responsive" },
    index,
  );
  assert.equal(resolved.stageId, nonResponsive._id);
  assert.equal(resolved.inferredFromStatus, true);

  const archived = stage("s3", "Old Stage", "old_stage", 99, true);
  const archivedIndex: PipelineStageIndex = {
    ...index,
    stageById: new Map([...index.stageById, [archived._id, archived]]),
  };
  const opts = buildParentStageOptions(archivedIndex, archived);
  assert.ok(opts.some((o) => o.value === String(archived._id)));
  assert.ok(opts[0]?.label.includes("archived"));

  console.log("resolve-pipeline-row-stage-tests: ok");
}

main();
