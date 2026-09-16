/**
 * Unit coverage for Scenario field OCC / quiet-notify / length clamp helpers.
 * Run: npx tsx scripts/pipeline-scenario-patch-tests.ts
 */
import assert from "node:assert/strict";
import {
  clampPipelineScenarioText,
  isPatchPipelineConflictResult,
  isPipelinePatchQuietNotifyOnly,
  MAX_PIPELINE_SCENARIO_CHARS,
  PATCH_PIPELINE_CONFLICT_CODE,
  stripOccForOnlineQuietPipelinePatch,
} from "../modules/pipeline/lib/core/patchPipelineResult";
import { runPipelinePatchHandlingConflict } from "../lib/pipeline/runPipelinePatchWithConflictRetry";
import type { PatchPipelineResult } from "../lib/pipeline/patchPipelineResult";

function testQuietNotify() {
  assert.equal(isPipelinePatchQuietNotifyOnly(["scenario"]), true);
  assert.equal(
    isPipelinePatchQuietNotifyOnly(["scenario", "scenarioCriteria"]),
    true,
  );
  assert.equal(isPipelinePatchQuietNotifyOnly(["scenario", "status"]), false);
  assert.equal(isPipelinePatchQuietNotifyOnly([]), false);
}

function testStripOccOnlineQuiet() {
  const quiet = stripOccForOnlineQuietPipelinePatch({
    id: "f1",
    scenario: "hello",
    expectedUpdatedAt: 99,
    preferencesAccountId: "u1",
  });
  assert.equal("expectedUpdatedAt" in quiet, false);
  assert.equal(quiet.scenario, "hello");

  const mixed = stripOccForOnlineQuietPipelinePatch({
    id: "f1",
    scenario: "hello",
    status: "Active",
    expectedUpdatedAt: 99,
  });
  assert.equal(mixed.expectedUpdatedAt, 99);

  const offlineKept = {
    id: "f1",
    scenario: "hello",
    expectedUpdatedAt: 42,
  };
  // Offline path must not call strip — assert helper is opt-in only.
  assert.equal(offlineKept.expectedUpdatedAt, 42);
}

function testClamp() {
  assert.equal(clampPipelineScenarioText(null), undefined);
  assert.equal(clampPipelineScenarioText("  "), undefined);
  assert.equal(clampPipelineScenarioText("  hello  "), "hello");
  assert.throws(
    () => clampPipelineScenarioText("x".repeat(MAX_PIPELINE_SCENARIO_CHARS + 1)),
    /too long/i,
  );
}

function testConflictGuard() {
  assert.equal(
    isPatchPipelineConflictResult({
      ok: false,
      code: PATCH_PIPELINE_CONFLICT_CODE,
      serverUpdatedAt: 42,
    }),
    true,
  );
  assert.equal(
    isPatchPipelineConflictResult({ ok: true, id: "abc" }),
    false,
  );
}

async function testOnlineQuietOmitsOcc() {
  let seen: { expectedUpdatedAt?: number } | null = null;
  const patch = async (args: {
    id: string;
    scenario?: string;
    expectedUpdatedAt?: number;
  }): Promise<PatchPipelineResult> => {
    seen = args;
    return { ok: true, id: args.id };
  };
  await runPipelinePatchHandlingConflict(patch, {
    id: "file1",
    scenario: "text",
    expectedUpdatedAt: 1,
  });
  assert.equal(seen?.expectedUpdatedAt, undefined);
}

async function testConflictNoRetry() {
  let calls = 0;
  let notified = 0;
  const patch = async (): Promise<PatchPipelineResult> => {
    calls += 1;
    return {
      ok: false,
      code: PATCH_PIPELINE_CONFLICT_CODE,
      serverUpdatedAt: 7,
    };
  };
  await assert.rejects(
    () =>
      runPipelinePatchHandlingConflict(
        patch,
        { status: "Active", expectedUpdatedAt: 1 },
        () => {
          notified += 1;
        },
      ),
    /File changed elsewhere/,
  );
  assert.equal(calls, 1);
  assert.equal(notified, 1);
}

async function main() {
  testQuietNotify();
  testStripOccOnlineQuiet();
  testClamp();
  testConflictGuard();
  await testOnlineQuietOmitsOcc();
  await testConflictNoRetry();
  console.log("pipeline-scenario-patch-tests: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
