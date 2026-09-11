/**
 * Smoke tests for exclusive block-assignment matching logic (pure helpers).
 * Run: npx tsx scripts/block-client-assign-tests.ts
 */
import assert from "node:assert/strict";
import {
  isClientPortalAssignableBlock,
  clientPortalBlockLabel,
  sanitizeAssignedBlockEntries,
} from "../lib/documentVaultClientBlocks";
import { persistAssignedBlocksPatch } from "../convex/documentVaultTaskTypes";
import {
  clientBlockAssignmentAllowsEdit,
  clientBlockAssignmentPhase,
  clientBlockFormFieldsReadOnly,
} from "../lib/clientPortalBlockAssignmentStatus";
import {
  COLLAPSIBLE_SECTION_TO_ATOMIC_ASSIGN,
  PIPELINE_BLOCK_TO_ATOMIC_ASSIGN,
  resolveClientAssignAtomicBlockId,
} from "../lib/pipelineBlockClientAssign";
import { MODULAR_BLOCK_SECTION_IDS } from "../lib/pipeline/fileWorkspaceTabRouting";
import { PIPELINE_BLOCK_IDS } from "../lib/pipelineBlockRegistry";

function testPfsIsAssignable() {
  assert.equal(isClientPortalAssignableBlock("pfs_statement"), true);
  assert.equal(isClientPortalAssignableBlock("pfs"), true);
  assert.equal(
    clientPortalBlockLabel("pfs_statement"),
    "Personal financial statement",
  );
  assert.equal(isClientPortalAssignableBlock("track_record"), true);
  assert.equal(isClientPortalAssignableBlock("trackRecord"), true);
  assert.equal(clientPortalBlockLabel("track_record"), "Track record");
  assert.equal(isClientPortalAssignableBlock("simple_pl"), true);
  assert.equal(isClientPortalAssignableBlock("simplePl"), true);
  assert.equal(clientPortalBlockLabel("simple_pl"), "Simple P&L");
}

function testExclusiveSanitize() {
  const patch = persistAssignedBlocksPatch([
    { blockId: "pfs", sortOrder: 1000 },
  ]);
  assert.ok(patch.assignedBlockEntries);
  assert.equal(patch.assignedBlockEntries!.length, 1);
  assert.equal(patch.assignedBlockEntries![0]!.blockId, "pfs_statement");
  assert.deepEqual(patch.assignedBlocks, ["pfs_statement"]);
}

function testRejectUnknownBlock() {
  const entries = sanitizeAssignedBlockEntries([
    { blockId: "not_a_real_block", sortOrder: 1 },
  ]);
  assert.equal(entries.length, 0);
}

function testDraftSubmittedCompletePhases() {
  assert.equal(clientBlockAssignmentPhase("incomplete"), "draft");
  assert.equal(clientBlockAssignmentPhase("pending_review"), "submitted");
  assert.equal(clientBlockAssignmentPhase("complete"), "complete");

  assert.equal(clientBlockAssignmentAllowsEdit("incomplete"), true);
  assert.equal(clientBlockAssignmentAllowsEdit("pending_review"), true);
  assert.equal(clientBlockAssignmentAllowsEdit("complete"), false);

  assert.equal(
    clientBlockFormFieldsReadOnly({
      taskStatus: "incomplete",
      revising: false,
    }),
    false,
  );
  assert.equal(
    clientBlockFormFieldsReadOnly({
      taskStatus: "pending_review",
      revising: false,
    }),
    true,
  );
  assert.equal(
    clientBlockFormFieldsReadOnly({
      taskStatus: "pending_review",
      revising: true,
    }),
    false,
  );
  assert.equal(
    clientBlockFormFieldsReadOnly({
      taskStatus: "complete",
      revising: true,
    }),
    true,
  );
}

function testGlobalAssignMap() {
  assert.equal(
    resolveClientAssignAtomicBlockId({
      sectionId: MODULAR_BLOCK_SECTION_IDS.pfs,
    }),
    "pfs_statement",
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      pipelineBlockId: "constructionBudget",
    }),
    "construction_budget",
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      sectionId: MODULAR_BLOCK_SECTION_IDS.trackRecord,
    }),
    "track_record",
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      pipelineBlockId: "trackRecord",
    }),
    "track_record",
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      sectionId: MODULAR_BLOCK_SECTION_IDS.simplePl,
    }),
    "simple_pl",
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      pipelineBlockId: "simplePl",
    }),
    "simple_pl",
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      sectionId: "pipeline-documents-vault",
    }),
    null,
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({
      sectionId: MODULAR_BLOCK_SECTION_IDS.pfs,
      explicit: false,
    }),
    null,
  );
  assert.equal(
    resolveClientAssignAtomicBlockId({ explicit: "tasks" }),
    "file_tasks",
  );

  for (const id of PIPELINE_BLOCK_IDS) {
    if (
      id === "dealWorkspace" ||
      id === "people" ||
      id === "archive" ||
      id === "dangerZone"
    ) {
      assert.equal(
        PIPELINE_BLOCK_TO_ATOMIC_ASSIGN[id],
        undefined,
        `${id} should not be globally assignable`,
      );
      continue;
    }
    assert.ok(
      PIPELINE_BLOCK_TO_ATOMIC_ASSIGN[id],
      `${id} should map to an atomic portal block`,
    );
  }

  assert.ok(
    Object.keys(COLLAPSIBLE_SECTION_TO_ATOMIC_ASSIGN).length >= 20,
    "section map should cover deal info + workspace + modular blocks",
  );
}

testPfsIsAssignable();
testExclusiveSanitize();
testRejectUnknownBlock();
testDraftSubmittedCompletePhases();
testGlobalAssignMap();
console.log("5 block-client-assign tests passed.");
