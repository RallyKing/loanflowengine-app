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
import { runPipelinePatchWithConflictRetry } from "../lib/pipeline/runPipelinePatchWithConflictRetry";
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

async function testRetry() {
  let calls = 0;
  const patch = async (args: {
    id: string;
    expectedUpdatedAt?: number;
  }): Promise<PatchPipelineResult> => {
    calls += 1;
    if (calls === 1) {
      assert.equal(args.expectedUpdatedAt, 1);
      return {
        ok: false,
        code: PATCH_PIPELINE_CONFLICT_CODE,
        serverUpdatedAt: 99,
      };
    }
    assert.equal(args.expectedUpdatedAt, 99);
    return { ok: true, id: args.id };
  };
  const res = await runPipelinePatchWithConflictRetry(patch, {
    id: "file1",
    expectedUpdatedAt: 1,
  });
  assert.equal(res.ok, true);
  assert.equal(calls, 2);
}

async function testRetryExhausted() {
  let exhausted = 0;
  const patch = async (): Promise<PatchPipelineResult> => ({
    ok: false,
    code: PATCH_PIPELINE_CONFLICT_CODE,
    serverUpdatedAt: 7,
  });
  await assert.rejects(
    () =>
      runPipelinePatchWithConflictRetry(patch, { expectedUpdatedAt: 1 }, () => {
        exhausted += 1;
      }),
    /File changed elsewhere/,
  );
  assert.equal(exhausted, 1);
}

async function main() {
  testQuietNotify();
  testClamp();
  testConflictGuard();
  await testRetry();
  await testRetryExhausted();
  console.log("pipeline-scenario-patch-tests: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
