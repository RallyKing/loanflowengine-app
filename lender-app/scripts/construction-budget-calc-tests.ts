/**
 * Unit checks for Construction Budget spreadsheet formulas & dropdowns.
 * Run: npx tsx scripts/construction-budget-calc-tests.ts
 */
import assert from "node:assert/strict";
import {
  CONSTRUCTION_BUDGET_CATALOG_BY_KEY,
  CONSTRUCTION_BUDGET_PROJECT_TYPES,
  CONSTRUCTION_BUDGET_REPAIR_REPLACE,
  CONSTRUCTION_BUDGET_SECTIONS,
  CONSTRUCTION_BUDGET_UNITS,
  computeConstructionBudget,
  createEmptyConstructionBudgetWorkbook,
  formatConstructionBudgetMoney,
  isValidCompletionTimeframeMonths,
  mapPersistedLinesToWorkbook,
  parseConstructionBudgetMoney,
} from "../lib/constructionBudget/constructionBudgetModel";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("catalog covers every Excel section + line count", () => {
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS.length, 6);
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[0]?.title, "PLANS - PERMITS - CLOSING");
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[1]?.title, "SITEWORK");
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[2]?.title, "BUILDING");
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[3]?.title, "MECHANICAL");
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[4]?.title, "INTERIOR");
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[5]?.title, "CONTRACTOR FEES");
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[0]?.lines.length, 5);
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[1]?.lines.length, 32);
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[2]?.lines.length, 20);
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[3]?.lines.length, 12);
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[4]?.lines.length, 26);
  assert.equal(CONSTRUCTION_BUDGET_SECTIONS[5]?.lines.length, 2);
  assert.equal(CONSTRUCTION_BUDGET_CATALOG_BY_KEY.size, 5 + 32 + 20 + 12 + 26 + 2);
});

test("dropdown lists match Excel data validation exactly", () => {
  assert.deepEqual([...CONSTRUCTION_BUDGET_PROJECT_TYPES], [
    "Rehab",
    "New Construction",
  ]);
  assert.deepEqual([...CONSTRUCTION_BUDGET_REPAIR_REPLACE], ["Repair", "Replace"]);
  assert.deepEqual([...CONSTRUCTION_BUDGET_UNITS], [
    "square feet",
    "linear feet",
    "cubic yards",
    "squares",
    "tons",
    "pounds",
    "each",
    "gallons",
  ]);
});

test("completion timeframe accepts 1–12 only", () => {
  assert.equal(isValidCompletionTimeframeMonths(""), true);
  assert.equal(isValidCompletionTimeframeMonths("1"), true);
  assert.equal(isValidCompletionTimeframeMonths("12"), true);
  assert.equal(isValidCompletionTimeframeMonths("6.5"), true);
  assert.equal(isValidCompletionTimeframeMonths("0.9"), false);
  assert.equal(isValidCompletionTimeframeMonths("12.1"), false);
});

test("subtotals + project subtotal + total project costs match Excel SUMs", () => {
  const wb = createEmptyConstructionBudgetWorkbook();
  wb.lines["plans.architect"] = { budgetAmount: "1000" };
  wb.lines["plans.permits"] = { budgetAmount: "500" };
  wb.lines["sitework.framing"] = { budgetAmount: "999" }; // wrong key — ignored
  wb.lines["sitework.erosionControl"] = { budgetAmount: "2000" };
  wb.lines["building.framing"] = { budgetAmount: "3000" };
  wb.lines["mechanical.roughPlumbing"] = { budgetAmount: "400" };
  wb.lines["interior.insulation"] = { budgetAmount: "150" };
  wb.lines["contractorFees.builderGcFee"] = { budgetAmount: "800" };
  wb.lines["contractorFees.contingency"] = { budgetAmount: "200" };

  const c = computeConstructionBudget(wb);
  assert.equal(c.plansSubtotal, 1500);
  assert.equal(c.siteworkSubtotal, 2000);
  assert.equal(c.buildingSubtotal, 3000);
  assert.equal(c.mechanicalSubtotal, 400);
  assert.equal(c.interiorSubtotal, 150);
  assert.equal(c.contractorFeesSubtotal, 1000);
  assert.equal(c.projectSubtotal, 1500 + 2000 + 3000 + 400 + 150);
  assert.equal(c.totalProjectCosts, c.projectSubtotal + 1000);
  assert.equal(c.filledLineCount, 8);
});

test("legacy rows migrate by category label into template keys", () => {
  const mapped = mapPersistedLinesToWorkbook([
    { _id: "a", category: "Framing", budgetAmount: "12000" },
    { _id: "b", category: "Permits (Invoices Required)", budgetAmount: "900" },
    { _id: "c", category: "Mystery line", budgetAmount: "50", spentAmount: "10" },
  ]);
  assert.equal(mapped.lines["building.framing"]?.budgetAmount, "12000");
  assert.equal(mapped.lines["plans.permits"]?.budgetAmount, "900");
  assert.equal(mapped.customLines.length, 1);
  assert.equal(mapped.customLines[0]?.category, "Mystery line");
  assert.deepEqual(mapped.matchedLegacyIds.sort(), ["a", "b"]);
  const c = computeConstructionBudget({
    header: {},
    lines: mapped.lines,
    customLines: mapped.customLines,
  });
  assert.equal(c.buildingSubtotal, 12000);
  assert.equal(c.plansSubtotal, 900);
  assert.equal(c.customBudgetTotal, 50);
  assert.equal(c.customSpentTotal, 10);
});

test("money parse/format round-trip dollars", () => {
  assert.equal(parseConstructionBudgetMoney("$1,234.50"), 1234.5);
  assert.equal(formatConstructionBudgetMoney(1234.5), "$1,234.50");
});

console.log("construction-budget-calc-tests: all passed");
