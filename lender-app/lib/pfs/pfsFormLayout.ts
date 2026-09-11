/**
 * Shared PFS form layout tokens — contrast, ledger column widths, table grids.
 * Keep visual rhythm consistent across header, assets/liabilities, and schedules.
 */

/** Ledger money value column (right-aligned amounts). */
export const PFS_MONEY_COL = "7.5rem";
/** Optional installment monthly column on liability ledger rows. */
export const PFS_MONTHLY_COL = "5.5rem";

export const PFS_LABEL_CLASS =
  "text-[11px] font-medium leading-tight text-foreground/90";

export const PFS_SECTION_TITLE_CLASS =
  "border-b-2 border-foreground/30 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground";

export const PFS_SECTION_SHELL_CLASS =
  "space-y-0 rounded-dlc-md border-2 border-foreground/20 bg-dlc-surface p-2.5";

export const PFS_LEDGER_ROW_CLASS =
  "grid min-h-9 items-center gap-x-3 border-b border-foreground/20 py-1 last:border-b-0";

/** Static full class — Tailwind JIT cannot see dynamic template strings. */
export const PFS_LEDGER_GRID =
  "grid-cols-[minmax(0,1fr)_7.5rem]";

export const PFS_LEDGER_GRID_WITH_MONTHLY =
  "grid-cols-[minmax(0,1fr)_7.5rem_5.5rem]";

export const PFS_FIELD_INPUT_CLASS =
  "h-8 w-full min-w-0 rounded-none border-0 border-b-2 border-foreground/40 bg-transparent px-1.5 text-sm text-foreground shadow-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:bg-dlc-surface-high/40 focus-visible:outline-none focus-visible:ring-0";

export const PFS_COMPUTED_VALUE_CLASS =
  "flex h-8 items-center justify-end border-b-2 border-foreground/25 bg-dlc-surface-high/70 px-1.5 text-sm tabular-nums text-foreground";

export const PFS_READONLY_TEXT_CLASS =
  "flex min-h-8 items-center border-b-2 border-foreground/25 px-1.5 text-sm text-foreground";

export const PFS_TABLE_SHELL_CLASS =
  "overflow-x-auto rounded-dlc-md border-2 border-foreground/20";

export const PFS_TABLE_CLASS =
  "w-full border-separate border-spacing-0 text-sm";

export const PFS_TH_CLASS =
  "border-b-2 border-foreground/30 bg-dlc-surface-high px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground";

export const PFS_TD_CLASS =
  "border-b border-foreground/20 px-2 py-1 align-middle";

export const PFS_TEXTAREA_CLASS =
  "min-h-[5rem] w-full rounded-dlc-md border-2 border-foreground/25 bg-dlc-surface px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

export const PFS_TOTAL_ROW_CLASS =
  "flex items-center justify-between border-t-2 border-foreground/30 pt-2.5 text-sm font-semibold text-foreground";

/** Section 2 — Notes payable column percentages (table-fixed). */
export const PFS_NOTES_PAYABLE_COL_WIDTHS = [
  "26%",
  "14%",
  "14%",
  "12%",
  "10%",
  "24%",
] as const;

/** Section 3 — Stocks & bonds column percentages (table-fixed). */
export const PFS_STOCKS_COL_WIDTHS = [
  "10%",
  "28%",
  "14%",
  "16%",
  "12%",
  "20%",
] as const;

/** Section 8 — Life insurance column percentages. */
export const PFS_LIFE_INSURANCE_COL_WIDTHS = [
  "32%",
  "18%",
  "18%",
  "32%",
] as const;

/** Section 4 — sticky field label + property columns. */
export const PFS_REAL_ESTATE_FIELD_COL = "14rem";
export const PFS_REAL_ESTATE_PROP_COL = "9rem";

export function pfsColgroup(widths: readonly string[]) {
  return widths;
}
