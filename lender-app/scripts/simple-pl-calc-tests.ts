/**
 * Unit checks for Simple P&L CSV formulas + multi-timeframe copy.
 * Run: npx tsx scripts/simple-pl-calc-tests.ts
 */
import assert from "node:assert/strict";
import {
  computeSimplePl,
  createEmptySimplePlStatement,
  formatSimplePlMoney,
  normalizeSimplePlStatement,
  parseSimplePlMoney,
} from "../lib/simplePl/simplePlModel";
import {
  applySimplePlCopyPlan,
  cloneSimplePlInstanceForCopy,
  createEmptySimplePlInstance,
  findSimplePlInstance,
  findSimplePlInstanceByVaultTask,
  normalizeSimplePlInstances,
  planSimplePlCopy,
  removeSimplePlInstance,
  replaceSimplePlInstanceData,
  simplePlDealPatchFromInstances,
  simplePlInstanceDisplayName,
} from "../lib/simplePl/simplePlInstances";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("CSV sample totals: revenue, CoGS, gross, expenses, operating, other, net", () => {
  const s = createEmptySimplePlStatement();
  s.revenue.salesRevenue = "100000.00";
  s.revenue.otherRevenue = "4737.00";
  s.revenue.salesDiscounts = "-3160.00";
  s.revenue.salesReturnsAllowances = "-3288.00";
  s.cogs.costOfRawMaterials = "6064.00";
  s.cogs.costOfPartsUsed = "7549.00";
  s.cogs.directLaborCosts = "4964.00";
  s.cogs.overheadCosts = "3428.00";
  s.expenses.automobile = "4640.00";
  s.expenses.rentedEquipment = "2082.00";
  s.expenses.insurance = "3893.00";
  s.expenses.jobExpenses = "3104.00";
  s.expenses.legalAndProfessionalFees = "1018.00";
  s.expenses.maintenanceAndRepair = "2580.00";
  s.expenses.meals = "1943.00";
  s.expenses.officeExpenses = "1761.00";
  s.expenses.rentOrLease = "3744.00";
  s.expenses.utilities = "1402.00";
  s.otherExpenses.vehicleExpenses = "3563.00";
  s.otherExpenses.miscellaneousExpenses = "1294.00";

  const c = computeSimplePl(s);
  assert.equal(c.totalRevenue, 98289);
  assert.equal(c.totalCogs, 22005);
  assert.equal(c.grossProfitLoss, 76284);
  assert.equal(c.totalExpenses, 26167);
  assert.equal(c.netOperatingProfitLoss, 50117);
  assert.equal(c.totalOtherExpenses, 4857);
  assert.equal(c.netProfitLoss, 45260);
  assert.equal(formatSimplePlMoney(c.netProfitLoss), "$45,260.00");
});

test("parseSimplePlMoney keeps signed discounts", () => {
  assert.equal(parseSimplePlMoney("-$3,160.00"), -3160);
  assert.equal(parseSimplePlMoney("n/a"), 0);
});

test("normalize accepts flat legacy keys", () => {
  const n = normalizeSimplePlStatement({
    companyName: "Acme LLC",
    salesRevenue: "10",
    automobile: "2",
  });
  assert.equal(n.header.companyName, "Acme LLC");
  assert.equal(n.revenue.salesRevenue, "10");
  assert.equal(n.expenses.automobile, "2");
});

test("legacy simplePl seeds a single YTD instance", () => {
  const list = normalizeSimplePlInstances({
    simplePl: {
      v: 1,
      header: { companyName: "Acme", periodEnded: "12/31/2025" },
      revenue: { salesRevenue: "1000" },
    },
  });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.data.header.companyName, "Acme");
  assert.equal(list[0]!.data.revenue.salesRevenue, "1000");
});

test("simplePlInstances stay first-class and do not overwrite each other", () => {
  const ytd = createEmptySimplePlInstance({
    name: "Year-to-date",
    periodKind: "year_to_date",
  });
  ytd.data.revenue.salesRevenue = "100";
  const prior = createEmptySimplePlInstance({
    name: "2024",
    periodKind: "prior_year",
  });
  prior.data.revenue.salesRevenue = "200";
  const next = replaceSimplePlInstanceData([ytd, prior], prior.id, {
    ...prior.data,
    header: { ...prior.data.header, periodEnded: "12/31/2024" },
  });
  assert.equal(findSimplePlInstance(next, ytd.id)?.data.revenue.salesRevenue, "100");
  assert.equal(
    findSimplePlInstance(next, prior.id)?.data.header.periodEnded,
    "12/31/2024",
  );
  const patch = simplePlDealPatchFromInstances(next);
  assert.equal(patch.simplePl.revenue.salesRevenue, "100");
  assert.equal(patch.simplePlInstances.length, 2);
});

test("copy clones selected P&L with new ids and assigned contacts", () => {
  const source = [
    {
      ...createEmptySimplePlInstance({
        name: "YTD",
        periodKind: "year_to_date",
        assignedContactIds: ["c1", "c2"],
      }),
      vaultFileTaskId: "task-old",
    },
    createEmptySimplePlInstance({ name: "2024", periodKind: "prior_year" }),
  ];
  const plan = planSimplePlCopy({
    mode: "rows",
    sourceInstances: source,
    instanceIndexes: [0],
  });
  assert.equal(plan.rows.length, 1);
  assert.notEqual(plan.rows[0]!.id, source[0]!.id);
  assert.equal(plan.rows[0]!.name, "YTD");
  assert.deepEqual(plan.rows[0]!.assignedContactIds, ["c1", "c2"]);
  assert.equal(plan.rows[0]!.vaultFileTaskId, undefined);
  const merged = applySimplePlCopyPlan({
    targetInstances: [createEmptySimplePlInstance({ name: "Existing" })],
    plan,
  });
  assert.equal(merged.length, 2);
  assert.equal(simplePlInstanceDisplayName(merged[1]!), "YTD");
});

test("cloneSimplePlInstanceForCopy drops vault task id", () => {
  const cloned = cloneSimplePlInstanceForCopy({
    id: "old",
    name: "Keep label",
    vaultFileTaskId: "vault-1",
    assignedContactIds: ["c9"],
    data: createEmptySimplePlStatement(),
  });
  assert.notEqual(cloned.id, "old");
  assert.equal(cloned.vaultFileTaskId, undefined);
  assert.deepEqual(cloned.assignedContactIds, ["c9"]);
});

test("remove last P&L leaves an empty instance", () => {
  const only = createEmptySimplePlInstance({ name: "Only" });
  const next = removeSimplePlInstance([only], only.id);
  assert.equal(next.length, 1);
  assert.notEqual(next[0]!.id, only.id);
});

test("portal snapshot can find instance by vault task", () => {
  const a = createEmptySimplePlInstance({ name: "YTD" });
  const b = createEmptySimplePlInstance({ name: "2024", periodKind: "prior_year" });
  b.vaultFileTaskId = "task-b";
  assert.equal(findSimplePlInstanceByVaultTask([a, b], "task-b")?.id, b.id);
});

console.log("simple-pl calc + instance tests passed.");
