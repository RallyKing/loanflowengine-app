/**
 * Unit tests for server-side deal patch no-op detection.
 * Run: npx tsx scripts/deal-patch-noop-tests.ts
 */
import assert from "node:assert/strict";
import { dealPatchIsNoOp } from "../convex/dealDataMerge";

function testNoOp() {
  const deal = {
    fileName: "File",
    cover: { loNmls: "1", brokerNmls: "2" },
    updatedAt: 100,
  };
  assert.equal(
    dealPatchIsNoOp(deal, {
      fileName: "File",
      cover: { loNmls: "1", brokerNmls: "2" },
    }),
    true,
  );
  assert.equal(
    dealPatchIsNoOp(deal, {
      fileName: "File",
      cover: { loNmls: "9", brokerNmls: "2" },
    }),
    false,
  );
  assert.equal(
    dealPatchIsNoOp(deal, { updatedAt: 999 }),
    true,
    "updatedAt-only cleaned keys are no-ops",
  );
}

testNoOp();
console.log("deal-patch-noop-tests: ok");
