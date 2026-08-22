/**
 * Track Record workbook formulas + copy-to-file merge.
 * Run: npx tsx scripts/track-record-calc-tests.ts
 */
import assert from "node:assert/strict";
import {
  applyTrackRecordCopyPlan,
  planTrackRecordCopy,
} from "../lib/trackRecord/trackRecordCopy";
import {
  computeTrackRecordExperience,
  computeTrackRecordScheduleTotals,
  createEmptyTrackRecordRow,
  rowHasNewConstructionExperience,
  rowHasRehabExperience,
  trackRecordRowHasIdentity,
  type DealTrackRecordRow,
} from "../lib/trackRecord/trackRecordModel";

function testRehabAndNewConstructionFlags() {
  const rehab: DealTrackRecordRow = {
    ...createEmptyTrackRecordRow(),
    projectType: "Rehab",
    ownedByGuarantor1: "Yes",
    ownedByGuarantor2: "No",
  };
  const extensive: DealTrackRecordRow = {
    ...createEmptyTrackRecordRow(),
    projectType: "Extensive Rehab",
    ownedByGuarantor2: "Yes",
  };
  const neu: DealTrackRecordRow = {
    ...createEmptyTrackRecordRow(),
    projectType: "New Construction",
    ownedByGuarantor1: "Yes",
    ownedByGuarantor3: "Yes",
  };
  assert.equal(rowHasRehabExperience(rehab, 0), true);
  assert.equal(rowHasRehabExperience(rehab, 1), false);
  assert.equal(rowHasNewConstructionExperience(rehab, 0), false);
  assert.equal(rowHasRehabExperience(extensive, 1), true);
  assert.equal(rowHasNewConstructionExperience(neu, 0), true);
  assert.equal(rowHasNewConstructionExperience(neu, 2), true);
  assert.equal(rowHasRehabExperience(neu, 0), false);
}

function testExperienceCountsAndQualifyingMax() {
  const rows: DealTrackRecordRow[] = [
    {
      ...createEmptyTrackRecordRow(),
      address: "1 Rehab Ave",
      projectType: "Rehab",
      ownedByGuarantor1: "Yes",
    },
    {
      ...createEmptyTrackRecordRow(),
      address: "2 Rehab Blvd",
      projectType: "Extensive Rehab",
      ownedByGuarantor1: "Yes",
      ownedByGuarantor2: "Yes",
    },
    {
      ...createEmptyTrackRecordRow(),
      address: "3 New St",
      projectType: "New Construction",
      ownedByGuarantor2: "Yes",
    },
    {
      ...createEmptyTrackRecordRow(),
      address: "4 New Ct",
      projectType: "New Construction",
      ownedByGuarantor2: "Yes",
    },
  ];
  const exp = computeTrackRecordExperience(rows, {
    guarantors: [
      { name: "Alex" },
      { name: "Blair" },
      { name: "Casey" },
      { name: "Dana" },
    ],
  });
  assert.equal(exp.guarantors[0]!.rehabCount, 2);
  assert.equal(exp.guarantors[0]!.newConstructionCount, 0);
  assert.equal(exp.guarantors[0]!.total, 2);
  assert.equal(exp.guarantors[1]!.rehabCount, 1);
  assert.equal(exp.guarantors[1]!.newConstructionCount, 2);
  assert.equal(exp.guarantors[1]!.total, 3);
  assert.equal(exp.qualifyingRehab, 2);
  assert.equal(exp.qualifyingNewConstruction, 2);
  assert.equal(exp.qualifyingTotal, 3);
}

function testMoneyTotalsIgnoreEmptyRows() {
  const rows: DealTrackRecordRow[] = [
    createEmptyTrackRecordRow(),
    {
      ...createEmptyTrackRecordRow(),
      address: "10 Main",
      acquisitionPrice: "100000",
      rehabOrConstructionAmount: "25000",
      salePriceOrRentAmount: "180000",
    },
    {
      ...createEmptyTrackRecordRow(),
      address: "20 Oak",
      acquisitionPrice: "200000",
      rehabOrConstructionAmount: "50000",
      salePriceOrRentAmount: "300000",
    },
  ];
  const totals = computeTrackRecordScheduleTotals(rows);
  assert.equal(totals.propertyCount, 2);
  assert.equal(totals.acquisitionPrice, 300000);
  assert.equal(totals.rehabOrConstructionAmount, 75000);
  assert.equal(totals.salePriceOrRentAmount, 480000);
}

function testCopyRowsPreservesAssigneesWithoutBlockMeta() {
  const source: DealTrackRecordRow[] = [
    {
      ...createEmptyTrackRecordRow(),
      address: "A",
      assignedContactIds: ["c1"],
    },
    {
      ...createEmptyTrackRecordRow(),
      address: "B",
      assignedContactIds: ["c2"],
    },
  ];
  const plan = planTrackRecordCopy({
    mode: "rows",
    sourceRows: source,
    sourceMeta: { assignedContactIds: ["block"] },
    rowIndexes: [1],
  });
  assert.equal(plan.rows.length, 1);
  assert.deepEqual(plan.rows[0]!.assignedContactIds, ["c2"]);
  assert.notEqual(plan.rows[0]!.rowId, source[1]!.rowId);
  assert.deepEqual(plan.meta.assignedContactIds, []);
  const merged = applyTrackRecordCopyPlan({
    targetRows: [
      { ...createEmptyTrackRecordRow(), address: "Existing" },
    ],
    targetMeta: { assignedContactIds: ["keep"] },
    plan,
  });
  assert.equal(merged.rows.length, 2);
  assert.equal(merged.rows[1]!.address, "B");
  assert.deepEqual(merged.meta.assignedContactIds, ["keep"]);
}

function testCopyBlockMergesAssigneesAndGuarantors() {
  const plan = planTrackRecordCopy({
    mode: "block",
    sourceRows: [
      { ...createEmptyTrackRecordRow(), address: "C" },
    ],
    sourceMeta: {
      assignedContactIds: ["src"],
      guarantors: [{ name: "Pat" }, {}, {}, {}],
    },
  });
  const merged = applyTrackRecordCopyPlan({
    targetRows: [],
    targetMeta: { assignedContactIds: ["dst"] },
    plan,
  });
  assert.deepEqual(merged.meta.assignedContactIds, ["dst", "src"]);
  assert.equal(merged.meta.guarantors?.[0]?.name, "Pat");
  assert.equal(trackRecordRowHasIdentity(merged.rows[0]!), true);
}

testRehabAndNewConstructionFlags();
testExperienceCountsAndQualifyingMax();
testMoneyTotalsIgnoreEmptyRows();
testCopyRowsPreservesAssigneesWithoutBlockMeta();
testCopyBlockMergesAssigneesAndGuarantors();
console.log("5 track-record calc/copy tests passed.");
