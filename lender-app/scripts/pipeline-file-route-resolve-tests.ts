/**
 * Unit checks for pipeline file-route id soft-normalize helpers (no Convex runtime).
 * Run: npx tsx scripts/pipeline-file-route-resolve-tests.ts
 */
import assert from "node:assert/strict";
import { isLikelyConvexTableId } from "../lib/pipeline/hubHierarchyKeys";

function testLikelyIdGate() {
  assert.equal(isLikelyConvexTableId("ks7edeymahk24nexcp30cx6xz98ehrzm"), true);
  assert.equal(isLikelyConvexTableId("jx7aer8a2g8na0s1c8wt26cd398ehj91"), true);
  assert.equal(isLikelyConvexTableId("short"), false);
  assert.equal(isLikelyConvexTableId("legacy-client:foo"), false);
  assert.equal(isLikelyConvexTableId(""), false);
}

testLikelyIdGate();
console.log("pipeline-file-route-resolve-tests: ok");
