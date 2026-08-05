/**
 * Unit tests for internal workflow parse / id / template helpers.
 * Run: npx tsx scripts/internal-workflow-tests.ts
 */
import assert from "node:assert/strict";
import {
  BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID,
  defaultInternalWorkflowItems,
  ensureInternalWorkflowItemIds,
  internalWorkflowProgress,
  legacyInternalWorkflowStepId,
  parseInternalWorkflowItems,
  serializeInternalWorkflowItems,
  templateStepsFromWorkflowItems,
  workflowItemsFromTemplateSteps,
} from "../lib/pipeline/internalWorkflow";

const legacy = parseInternalWorkflowItems([
  { label: "Intro Email", done: true, date: "2026-01-01" },
  { label: "EDU Emails", done: false },
]);
assert.equal(legacy.length, 2);
assert.equal(legacy[0]?.id, legacyInternalWorkflowStepId("Intro Email", 0));
assert.equal(legacy[0]?.done, true);
assert.equal(legacy[1]?.done, false);

const withIds = parseInternalWorkflowItems([
  { id: "iwf_a", label: "A", done: false },
  { id: "iwf_a", label: "B", done: true },
]);
assert.equal(withIds[0]?.id, "iwf_a");
assert.notEqual(withIds[1]?.id, "iwf_a");

const progress = internalWorkflowProgress(legacy);
assert.equal(progress.completed, 1);
assert.equal(progress.total, 2);

const defaults = defaultInternalWorkflowItems();
assert.equal(defaults.length, 13);
assert.ok(defaults.every((d) => d.id.startsWith("iwf_")));

const fromTemplate = workflowItemsFromTemplateSteps(
  templateStepsFromWorkflowItems(defaults),
);
assert.equal(fromTemplate.length, 13);
assert.ok(fromTemplate.every((d) => d.done === false));

const serialized = serializeInternalWorkflowItems(
  ensureInternalWorkflowItemIds(legacy),
);
assert.ok(serialized[0]?.id);
assert.equal(serialized[0]?.label, "Intro Email");

assert.equal(
  BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID,
  "builtin:default-broker",
);

console.log("internal-workflow-tests: ok");
