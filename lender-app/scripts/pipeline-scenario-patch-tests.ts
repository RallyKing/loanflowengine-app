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

async function testSuccessPassthrough() {
  let calls = 0;
  const patch = async (args: {
    id: string;
    expectedUpdatedAt?: number;
  }): Promise<PatchPipelineResult> => {
    calls += 1;
    return { ok: true, id: args.id };
  };
  const res = await runPipelinePatchHandlingConflict(patch, {
    id: "file1",
    expectedUpdatedAt: 1,
  });
  assert.equal(res.ok, true);
  assert.equal(calls, 1);
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
      runPipelinePatchHandlingConflict(patch, { expectedUpdatedAt: 1 }, () => {
        notified += 1;
      }),
    /File changed elsewhere/,
  );
  assert.equal(calls, 1);
  assert.equal(notified, 1);
}

async function main() {
  testQuietNotify();
  testClamp();
  testConflictGuard();
  await testSuccessPassthrough();
  await testConflictNoRetry();
  console.log("pipeline-scenario-patch-tests: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
