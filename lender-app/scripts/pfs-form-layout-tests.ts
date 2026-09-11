/**
 * PFS form layout token invariants (contrast / column alignment).
 * Run: npx tsx scripts/pfs-form-layout-tests.ts
 */
import assert from "node:assert/strict";
import {
  PFS_LIFE_INSURANCE_COL_WIDTHS,
  PFS_MONEY_COL,
  PFS_MONTHLY_COL,
  PFS_NOTES_PAYABLE_COL_WIDTHS,
  PFS_SECTION_SHELL_CLASS,
  PFS_SECTION_TITLE_CLASS,
  PFS_STOCKS_COL_WIDTHS,
  PFS_TH_CLASS,
  PFS_FIELD_INPUT_CLASS,
  PFS_LEDGER_GRID,
  PFS_LEDGER_GRID_WITH_MONTHLY,
  pfsColgroup,
} from "../lib/pfs/pfsFormLayout";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

function sumPercents(widths: readonly string[]): number {
  return widths.reduce((acc, w) => {
    assert.match(w, /^\d+%$/);
    return acc + Number.parseInt(w, 10);
  }, 0);
}

test("section 2 notes payable columns are fixed six-way and sum to 100%", () => {
  assert.equal(PFS_NOTES_PAYABLE_COL_WIDTHS.length, 6);
  assert.equal(sumPercents(PFS_NOTES_PAYABLE_COL_WIDTHS), 100);
  assert.deepEqual(pfsColgroup(PFS_NOTES_PAYABLE_COL_WIDTHS), [
    ...PFS_NOTES_PAYABLE_COL_WIDTHS,
  ]);
});

test("section 3 stocks columns are fixed six-way and sum to 100%", () => {
  assert.equal(PFS_STOCKS_COL_WIDTHS.length, 6);
  assert.equal(sumPercents(PFS_STOCKS_COL_WIDTHS), 100);
});

test("section 8 life insurance columns sum to 100%", () => {
  assert.equal(PFS_LIFE_INSURANCE_COL_WIDTHS.length, 4);
  assert.equal(sumPercents(PFS_LIFE_INSURANCE_COL_WIDTHS), 100);
});

test("ledger grids use static Tailwind-safe class strings with money columns", () => {
  assert.match(PFS_LEDGER_GRID, /7\.5rem/);
  assert.match(PFS_LEDGER_GRID_WITH_MONTHLY, /7\.5rem/);
  assert.match(PFS_LEDGER_GRID_WITH_MONTHLY, /5\.5rem/);
  assert.equal(PFS_MONEY_COL, "7.5rem");
  assert.equal(PFS_MONTHLY_COL, "5.5rem");
});

test("contrast tokens prefer foreground borders over washed border/60", () => {
  assert.match(PFS_SECTION_SHELL_CLASS, /border-foreground/);
  assert.match(PFS_SECTION_TITLE_CLASS, /border-foreground/);
  assert.match(PFS_SECTION_TITLE_CLASS, /text-foreground/);
  assert.match(PFS_TH_CLASS, /border-foreground/);
  assert.match(PFS_FIELD_INPUT_CLASS, /border-foreground/);
  assert.doesNotMatch(PFS_SECTION_SHELL_CLASS, /border-border\/60/);
});

console.log("\nAll pfs-form-layout tests passed.");
