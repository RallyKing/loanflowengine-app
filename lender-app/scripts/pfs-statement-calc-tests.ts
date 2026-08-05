/**
 * Unit checks for Personal Financial Statement spreadsheet formulas.
 * Run: npx tsx scripts/pfs-statement-calc-tests.ts
 */
import assert from "node:assert/strict";
import {
  buildPfsDealPatchFromPortalSubmission,
  computePersonalFinancialStatement,
  computeStockBondRowTotal,
  createEmptyPersonalFinancialStatement,
  normalizePersonalFinancialStatement,
  scrubPfsDealDocument,
  seedPfsFromLegacyAssetLiabilityRows,
} from "../lib/pfs/personalFinancialStatementModel";
import { extractFormDataForAtomicBlock } from "../lib/clientPortalFormExtract";
import type { DealWorkspaceSheet } from "../lib/file/dealSectionTypes";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("stock row total = shares × market (G6=A6*E6)", () => {
  assert.equal(
    computeStockBondRowTotal({
      numberOfShares: "100",
      marketValueQuotation: "25.50",
    }),
    2550,
  );
});

test("roll-ups match spreadsheet: stocks, life CSV, RE, notes, mortgages A–D", () => {
  const s = createEmptyPersonalFinancialStatement();
  s.stocksAndBonds[0] = {
    numberOfShares: "10",
    marketValueQuotation: "100",
  };
  s.stocksAndBonds[1] = {
    numberOfShares: "2",
    marketValueQuotation: "50",
  };
  s.lifeInsurance[0] = { cashValue: "1000" };
  s.lifeInsurance[1] = { cashValue: "500" };
  s.realEstateOwned[0] = {
    key: "A",
    presentMarketValue: "200000",
    mortgageBalance: "80000",
  };
  s.realEstateOwned[4] = {
    key: "E",
    presentMarketValue: "50000",
    mortgageBalance: "10000",
  };
  s.notesPayable[0] = { currentBalance: "3000" };
  s.notesPayable[1] = { currentBalance: "2000" };
  s.assets.cashOnHandAndBanks = "1500";

  const c = computePersonalFinancialStatement(s);
  assert.equal(c.stocksBondsTotal, 1100);
  assert.equal(c.lifeInsuranceCashTotal, 1500);
  assert.equal(c.realEstateMarketTotal, 250000);
  // Spreadsheet L25 only sums Page 2 C24:G24 (A–D), not Section 4 continued.
  assert.equal(c.mortgagesOnReTotal, 80000);
  assert.equal(c.notesPayableCurrentTotal, 5000);
  assert.equal(c.assetColumn.stocksAndBonds, 1100);
  assert.equal(c.assetColumn.lifeInsuranceCashSurrender, 1500);
  assert.equal(c.assetColumn.realEstate, 250000);
  assert.equal(c.liabilityColumn.notesPayableToBanksAndOthers, 5000);
  assert.equal(c.liabilityColumn.mortgagesOnRealEstate, 80000);
  assert.equal(c.totalAssets, 1500 + 1100 + 1500 + 250000);
  assert.equal(c.totalLiabilities, 5000 + 80000);
  assert.equal(c.netWorth, c.totalAssets - c.totalLiabilities);
  assert.equal(c.liabilitiesSideTotal, c.totalAssets);
});

test("manual asset override wins over schedule roll-up", () => {
  const s = createEmptyPersonalFinancialStatement();
  s.stocksAndBonds[0] = { numberOfShares: "10", marketValueQuotation: "100" };
  s.assets.stocksAndBonds = "999";
  const c = computePersonalFinancialStatement(s);
  assert.equal(c.stocksBondsTotal, 1000);
  assert.equal(c.assetColumn.stocksAndBonds, 999);
});

test("legacy seed only when structured statement empty", () => {
  const empty = createEmptyPersonalFinancialStatement();
  const seeded = seedPfsFromLegacyAssetLiabilityRows(
    empty,
    [{ description: "Brokerage", estimatedValue: "12000" }],
    [{ description: "Card", balance: "400", monthlyPayment: "50" }],
  );
  assert.equal(seeded.assets.otherAssets, "12000");
  assert.equal(seeded.liabilities.otherLiabilities, "400");

  const filled = createEmptyPersonalFinancialStatement();
  filled.assets.cashOnHandAndBanks = "50";
  const noSeed = seedPfsFromLegacyAssetLiabilityRows(
    filled,
    [{ description: "X", estimatedValue: "99999" }],
    [],
  );
  assert.equal(noSeed.assets.cashOnHandAndBanks, "50");
  assert.equal(noSeed.assets.otherAssets, undefined);
});

test("normalize accepts legacy portal summary shape", () => {
  const n = normalizePersonalFinancialStatement({
    liquidAssets: "2000",
    annualIncome: "90000",
    notes: "portal",
  });
  assert.equal(n.v, 1);
  assert.equal(n.assets.cashOnHandAndBanks, "2000");
  assert.equal(n.income.salary, "90000");
  assert.equal(n.notes, "portal");
});

test("normalize accepts flat header phone/address fallbacks", () => {
  const n = normalizePersonalFinancialStatement({
    names: "Brain Nubi",
    residencePhone: "9492781365",
    businessPhone: "5551112222",
    residenceAddress: "123 Main St",
    city: "Irvine",
    state: "CA",
    zip: "92618",
  });
  assert.equal(n.header.names, "Brain Nubi");
  assert.equal(n.header.residencePhone, "9492781365");
  assert.equal(n.header.businessPhone, "5551112222");
  assert.equal(n.header.residenceAddress, "123 Main St");
  assert.equal(n.header.city, "Irvine");
  assert.equal(n.header.state, "CA");
  assert.equal(n.header.zip, "92618");
});

test("scrub removes nested legacy asset/liability arrays under pfs", () => {
  const scrubbed = scrubPfsDealDocument({
    header: { names: "A" },
    assets: [{ description: "Cash", estimatedValue: "1" }],
    liabilities: [{ description: "Card", balance: "2" }],
    totalAssets: "1",
  });
  assert.equal(scrubbed.header && (scrubbed.header as { names: string }).names, "A");
  assert.equal(scrubbed.assets, undefined);
  assert.equal(scrubbed.liabilities, undefined);
  assert.equal(scrubbed.totalAssets, "1");
});

test("portal PFS merge keeps residencePhone and structured cash", () => {
  const prior = {
    v: 1 as const,
    header: { names: "Prior Name", residencePhone: "" },
    assets: { cashOnHandAndBanks: "100" },
  };
  const statement = createEmptyPersonalFinancialStatement();
  statement.header = {
    names: "Brain Nubi",
    statementDate: "2026-08-04",
    residenceAddress: "123 Main St",
    residencePhone: "9492781365",
    city: "Irvine",
    state: "CA",
    zip: "92618",
    businessPhone: "9495550000",
    businessName: "Nubi LLC",
  };
  statement.assets.cashOnHandAndBanks = "250000";

  const patch = buildPfsDealPatchFromPortalSubmission(prior, {
    pfs: {
      ...statement,
      totalAssets: "250000",
      totalLiabilities: "0",
      netWorth: "250000",
    },
    assets: [
      { description: "Cash on hands & in Banks", estimatedValue: "250000" },
    ],
    liabilities: [],
  });

  assert.ok(patch);
  const header = normalizePersonalFinancialStatement(patch!.pfs).header;
  assert.equal(header.names, "Brain Nubi");
  assert.equal(header.residencePhone, "9492781365");
  assert.equal(header.businessPhone, "9495550000");
  assert.equal(header.residenceAddress, "123 Main St");
  assert.equal(header.city, "Irvine");
  assert.equal(header.state, "CA");
  assert.equal(header.zip, "92618");
  assert.equal(
    normalizePersonalFinancialStatement(patch!.pfs).assets.cashOnHandAndBanks,
    "250000",
  );
  assert.equal(patch!.pfs.totalAssets, "250000");
  assert.ok(Array.isArray(patch!.assets));
  assert.equal((patch!.assets as unknown[]).length, 1);
  // Must not nest legacy row arrays under pfs.assets
  assert.ok(!Array.isArray(patch!.pfs.assets));
});

test("portal extract includes structured pfs for pfs_statement", () => {
  const sheet = {
    assets: [{ description: "Cash", estimatedValue: "10" }],
    liabilities: [],
    pfs: {
      v: 1,
      header: { residencePhone: "9492781365", names: "Brain Nubi" },
      assets: { cashOnHandAndBanks: "250000" },
    },
  } as unknown as DealWorkspaceSheet;
  const form = extractFormDataForAtomicBlock("pfs_statement", sheet);
  assert.ok(form.pfs);
  assert.equal(
    (form.pfs as { header: { residencePhone: string } }).header.residencePhone,
    "9492781365",
  );
  assert.ok(Array.isArray(form.assets));
});

test("legacy-only portal summary still merges without wiping prior header", () => {
  const prior = {
    v: 1 as const,
    header: { names: "Keep Me", residencePhone: "111" },
  };
  const patch = buildPfsDealPatchFromPortalSubmission(prior, {
    totalAssets: "5000",
    notes: "summary only",
  });
  assert.ok(patch);
  const n = normalizePersonalFinancialStatement(patch!.pfs);
  assert.equal(n.header.names, "Keep Me");
  assert.equal(n.header.residencePhone, "111");
  assert.equal(patch!.pfs.totalAssets, "5000");
  assert.equal(patch!.pfs.notes, "summary only");
});

console.log("\nAll PFS calc tests passed.");
