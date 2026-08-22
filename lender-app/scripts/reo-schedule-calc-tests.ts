/**
 * Unit checks for Schedule of REO spreadsheet formulas + copy merge.
 * Run: npx tsx scripts/reo-schedule-calc-tests.ts
 */
import assert from "node:assert/strict";
import {
  applyReoCopyPlan,
  collectReoCopyAssigneeIds,
  planReoCopy,
} from "../lib/reo/reoCopy";
import { reoRowToProfileShape } from "../lib/contacts/reoFromDeal";
import { reoProfileShapeToDealRow } from "../lib/contacts/contactProfileToDeal";
import { toHtmlDateInputValue } from "../lib/schedule/dateInput";
import { buildReoBlockPdfSpec } from "../lib/blockPdfExport/blocks/reoBlockPdf";
import {
  normalizeReoListingUrl,
  reoListingUrlError,
} from "../lib/reo/zillowUrl";
import {
  computeReoRow,
  computeReoScheduleTotals,
  ensureDealReoRowId,
  formatReoLtv,
  mergeReoIntoTarget,
  sanitizeDealReoRow,
  withComputedReoFields,
  type DealReoRow,
} from "../lib/reo/scheduleOfReoModel";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("escrow O = taxes + insurance + HOA (Excel SUM(L:N))", () => {
  const c = computeReoRow({
    taxes: "100",
    insurance: "50",
    hoa: "25",
  });
  assert.equal(c.escrow, 175);
});

test("net rent Q = gross − (taxes + insurance + HOA + mort pmt)", () => {
  const c = computeReoRow({
    grossRent: "3000",
    taxes: "200",
    insurance: "100",
    hoa: "50",
    mortgagePayment: "1500",
  });
  assert.equal(c.netRent, 1150);
});

test("equity = market − balance; LTV = balance / market", () => {
  const c = computeReoRow({
    marketValue: "400000",
    balance: "280000",
  });
  assert.equal(c.equity, 120000);
  assert.equal(c.ltv, 0.7);
  assert.equal(formatReoLtv(c.ltv), "70.0%");
});

test("LTV is null when market value is 0", () => {
  const c = computeReoRow({ marketValue: "0", balance: "100" });
  assert.equal(c.ltv, null);
  assert.equal(formatReoLtv(c.ltv), "—");
});

test("schedule totals sum all money columns including derived escrow/net/equity", () => {
  const rows: DealReoRow[] = [
    {
      marketValue: "200000",
      balance: "80000",
      mortgagePayment: "900",
      taxes: "100",
      insurance: "40",
      hoa: "10",
      grossRent: "2000",
      invested: "50000",
    },
    {
      marketValue: "100000",
      balance: "20000",
      mortgagePayment: "300",
      taxes: "50",
      insurance: "20",
      hoa: "5",
      grossRent: "1200",
      invested: "10000",
    },
  ];
  const t = computeReoScheduleTotals(rows);
  assert.equal(t.marketValue, 300000);
  assert.equal(t.balance, 100000);
  assert.equal(t.mortgagePayment, 1200);
  assert.equal(t.taxes, 150);
  assert.equal(t.insurance, 60);
  assert.equal(t.hoa, 15);
  assert.equal(t.escrow, 225);
  assert.equal(t.grossRent, 3200);
  assert.equal(t.netRent, 3200 - 225 - 1200);
  assert.equal(t.invested, 60000);
  assert.equal(t.equity, 200000);
});

test("withComputedReoFields writes escrow + net rent strings", () => {
  const next = withComputedReoFields({
    taxes: "12.5",
    insurance: "7.5",
    hoa: "5",
    mortgagePayment: "100",
    grossRent: "200",
  });
  assert.equal(next.escrow, "25");
  assert.equal(next.netRent, "75");
});

test("copy selected rows does not merge block assignees", () => {
  const source: DealReoRow[] = [
    { address: "1 Main", assignedContactIds: ["c1"] },
    { address: "2 Oak", assignedContactIds: ["c2"] },
  ];
  const plan = planReoCopy({
    mode: "rows",
    sourceRows: source,
    sourceMeta: { assignedContactIds: ["blockA"] },
    rowIndexes: [1],
  });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0]?.address, "2 Oak");
  assert.deepEqual(plan.rows[0]?.assignedContactIds, ["c2"]);
  assert.equal(plan.copyBlockAssignees, false);

  const merged = applyReoCopyPlan({
    targetRows: [{ address: "Existing" }],
    targetMeta: { assignedContactIds: ["targetA"] },
    plan,
  });
  assert.equal(merged.rows.length, 2);
  assert.deepEqual(merged.meta.assignedContactIds, ["targetA"]);
});

test("copy entire block appends rows and unions block assignees", () => {
  const plan = planReoCopy({
    mode: "block",
    sourceRows: [
      { address: "10 Pine" },
      { address: "20 Elm", assignedContactIds: ["rowC"] },
    ],
    sourceMeta: { assignedContactIds: ["spouse", "entity"] },
  });
  assert.equal(plan.copyBlockAssignees, true);
  const merged = mergeReoIntoTarget({
    targetRows: [{ address: "Keep me" }],
    targetMeta: { assignedContactIds: ["client"] },
    incomingRows: plan.rows,
    incomingMeta: plan.meta,
    copyBlockAssignees: true,
  });
  assert.equal(merged.rows.length, 3);
  assert.deepEqual(merged.meta.assignedContactIds, [
    "client",
    "spouse",
    "entity",
  ]);
});

test("collectReoCopyAssigneeIds unions block + row contacts", () => {
  const blockPlan = planReoCopy({
    mode: "block",
    sourceRows: [
      { address: "1 A", assignedContactIds: ["row1"] },
      { address: "2 B", assignedContactIds: ["row2"] },
    ],
    sourceMeta: { assignedContactIds: ["blockA", "row1"] },
  });
  assert.deepEqual(collectReoCopyAssigneeIds(blockPlan).sort(), [
    "blockA",
    "row1",
    "row2",
  ]);

  const rowPlan = planReoCopy({
    mode: "rows",
    sourceRows: [
      { address: "1 A", assignedContactIds: ["row1"] },
      { address: "2 B", assignedContactIds: ["row2"] },
    ],
    sourceMeta: { assignedContactIds: ["blockA"] },
    rowIndexes: [1],
  });
  assert.deepEqual(collectReoCopyAssigneeIds(rowPlan), ["row2"]);
});

test("sanitizeDealReoRow keeps every schedule field and drops extras", () => {
  const row = sanitizeDealReoRow({
    rowId: "reo-1",
    purchasedDate: "03/15/2020",
    state: "PA",
    usage: "investment",
    address: "10 Main St",
    propertyType: "duplex",
    marketValue: 425000,
    position: "first",
    balance: "280000",
    mortgagePayment: "2100",
    rate: "6.25",
    taxes: "200",
    insurance: "100",
    hoa: "50",
    grossRent: "3200",
    apn: "12-34-56",
    invested: "90000",
    latLong: "40.1, -75.2",
    lotSf: "5000",
    propSf: "1800",
    mostRecent: "2024-06-01T12:00:00Z",
    zillowUrl: "zillow.com/homedetails/10-Main-St/123_zpid/",
    assignedContactIds: ["c1", "c1", "c2"],
    excelCol: "drop-me",
  });
  assert.equal(row.purchasedDate, "2020-03-15");
  assert.equal(row.state, "PA");
  assert.equal(row.usage, "Rental");
  assert.equal(row.address, "10 Main St");
  assert.equal(row.propertyType, "DUPLX");
  assert.equal(row.marketValue, "425000");
  assert.equal(row.position, "1st");
  assert.equal(row.balance, "280000");
  assert.equal(row.mortgagePayment, "2100");
  assert.equal(row.rate, "6.25");
  assert.equal(row.taxes, "200");
  assert.equal(row.insurance, "100");
  assert.equal(row.hoa, "50");
  assert.equal(row.grossRent, "3200");
  assert.equal(row.apn, "12-34-56");
  assert.equal(row.invested, "90000");
  assert.equal(row.latLong, "40.1, -75.2");
  assert.equal(row.lotSf, "5000");
  assert.equal(row.propSf, "1800");
  assert.equal(row.mostRecent, "2024-06-01");
  assert.equal(
    row.zillowUrl,
    "https://zillow.com/homedetails/10-Main-St/123_zpid/",
  );
  assert.deepEqual(row.assignedContactIds, ["c1", "c2"]);
  assert.equal((row as { excelCol?: string }).excelCol, undefined);
});

test("date inputs accept US slash dates and reject junk", () => {
  assert.equal(toHtmlDateInputValue("12/1/24"), "2024-12-01");
  assert.equal(toHtmlDateInputValue("2020-07-04"), "2020-07-04");
  assert.equal(toHtmlDateInputValue(""), "");
  assert.equal(toHtmlDateInputValue("not-a-date"), "");
});

test("ensureDealReoRowId is stable when id already exists", () => {
  const a = ensureDealReoRowId({ address: "1 Oak", rowId: "reo-keep" });
  const b = ensureDealReoRowId(a);
  assert.equal(a.rowId, "reo-keep");
  assert.equal(b.rowId, "reo-keep");
});

test("REO CRM round-trip preserves money, dates, and type fields", () => {
  const deal = sanitizeDealReoRow({
    address: "99 Lake",
    purchasedDate: "1/2/2018",
    state: "NJ",
    usage: "Commercial",
    propertyType: "COM",
    marketValue: "900000",
    position: "HELOC",
    balance: "100000",
    mortgagePayment: "800",
    rate: "8.1",
    taxes: "300",
    insurance: "90",
    hoa: "0",
    grossRent: "5000",
    apn: "APN-1",
    invested: "200000",
    latLong: "1,2",
    lotSf: "10000",
    propSf: "4000",
    mostRecent: "05/06/2025",
    zillowUrl: "https://www.zillow.com/homedetails/99-Lake/456_zpid/",
  });
  const computed = withComputedReoFields(deal);
  const shape = reoRowToProfileShape(computed, 0);
  const back = reoProfileShapeToDealRow(shape);
  assert.equal(back.address, "99 Lake");
  assert.equal(back.purchasedDate, "2018-01-02");
  assert.equal(back.mostRecent, "2025-05-06");
  assert.equal(back.marketValue, "900000");
  assert.equal(back.balance, "100000");
  assert.equal(back.mortgagePayment, "800");
  assert.equal(back.usage, "Commercial");
  assert.equal(back.propertyType, "COM");
  assert.equal(back.position, "HELOC");
  assert.equal(back.taxes, "300");
  assert.equal(back.insurance, "90");
  assert.equal(back.grossRent, "5000");
  assert.equal(back.apn, "APN-1");
  assert.equal(back.invested, "200000");
  assert.equal(
    back.zillowUrl,
    "https://www.zillow.com/homedetails/99-Lake/456_zpid/",
  );
  assert.equal(computed.escrow, "390");
});

test("Zillow listing URL accepts short/full http(s) and rejects junk", () => {
  assert.equal(
    normalizeReoListingUrl("https://zill.ws/abc"),
    "https://zill.ws/abc",
  );
  assert.equal(
    normalizeReoListingUrl("www.zillow.com/homes/123/"),
    "https://www.zillow.com/homes/123/",
  );
  assert.equal(normalizeReoListingUrl("javascript:alert(1)"), undefined);
  assert.equal(normalizeReoListingUrl("not a url"), undefined);
  assert.equal(reoListingUrlError(""), null);
  assert.equal(reoListingUrlError("https://zillow.com/h/1"), null);
  assert.match(reoListingUrlError("ftp://zillow.com/x") ?? "", /valid/i);
});

test("copy selected rows keeps zillowUrl", () => {
  const plan = planReoCopy({
    mode: "rows",
    sourceRows: [
      {
        address: "1 Main",
        zillowUrl: "https://www.zillow.com/homedetails/1-Main/1_zpid/",
      },
    ],
    rowIndexes: [0],
  });
  assert.equal(
    plan.rows[0]?.zillowUrl,
    "https://www.zillow.com/homedetails/1-Main/1_zpid/",
  );
});

test("REO fillable PDF includes listing URL next to market value", () => {
  const spec = buildReoBlockPdfSpec([
    {
      address: "10 Main",
      marketValue: "250000",
      zillowUrl: "https://www.zillow.com/homedetails/10-Main/9_zpid/",
    },
  ]);
  const schedule = spec.sections.find((s) => s.id === "schedule");
  const colIds = (schedule?.columns ?? []).map((c) => c.id);
  const marketIdx = colIds.indexOf("market");
  const zillowIdx = colIds.indexOf("zillowUrl");
  assert.ok(marketIdx >= 0);
  assert.equal(zillowIdx, marketIdx + 1);
  assert.equal(
    schedule?.rows?.[0]?.zillowUrl,
    "https://www.zillow.com/homedetails/10-Main/9_zpid/",
  );
});

test("empty placeholder target rows are replaced when copying", () => {
  const merged = mergeReoIntoTarget({
    targetRows: [{ usage: "Rental", position: "1st" }],
    incomingRows: [{ address: "99 Lake St", marketValue: "250000" }],
    copyBlockAssignees: false,
  });
  assert.equal(merged.rows.length, 1);
  assert.equal(merged.rows[0]?.address, "99 Lake St");
});

console.log("All REO schedule tests passed.");
