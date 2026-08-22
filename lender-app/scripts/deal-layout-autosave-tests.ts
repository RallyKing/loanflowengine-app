/**
 * Unit tests for deal layout autosave helpers (no-op filter + retry backoff).
 * Run: npx tsx scripts/deal-layout-autosave-tests.ts
 */
import assert from "node:assert/strict";
import {
  filterNoOpDealChanges,
  LAYOUT_PATCH_DEBOUNCE_MS,
  PATCH_DEAL_MAX_RETRY_DELAY_MS,
  patchDealRetryDelayMs,
} from "../lib/file/dealLayoutAutosave";

function testFilterNoOp() {
  const sheet: Record<string, unknown> = {
    fileName: "A",
    cover: { loNmls: "123" },
    dealWorkspaceLayout: { v: 1, order: ["cover"], hidden: [], expanded: {} },
  };
  const filtered = filterNoOpDealChanges(
    {
      fileName: "A",
      cover: { loNmls: "123" },
      fundingType: "Bridge",
    },
    sheet,
  );
  assert.deepEqual(Object.keys(filtered).sort(), ["fundingType"]);
  assert.equal(filtered.fundingType, "Bridge");

  const allNoop = filterNoOpDealChanges(
    { fileName: "A", cover: { loNmls: "123" } },
    sheet,
  );
  assert.equal(Object.keys(allNoop).length, 0);
}

function testRetryBackoff() {
  assert.equal(patchDealRetryDelayMs(0), LAYOUT_PATCH_DEBOUNCE_MS);
  assert.equal(patchDealRetryDelayMs(1), LAYOUT_PATCH_DEBOUNCE_MS * 2);
  assert.equal(patchDealRetryDelayMs(2), LAYOUT_PATCH_DEBOUNCE_MS * 4);
  assert.equal(patchDealRetryDelayMs(20), PATCH_DEAL_MAX_RETRY_DELAY_MS);
}

testFilterNoOp();
testRetryBackoff();
console.log("deal-layout-autosave-tests: ok");
