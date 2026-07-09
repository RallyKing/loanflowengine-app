import { cn } from "@/lib/cn";
import type { TableDensityMode } from "@/lib/userSettingsStorage";

/**
 * Shared classes for large data grids (Browse, Pipeline table, Ledger).
 * Compact density tightens cell padding for more rows above the fold.
 */
export function dataTableClassNames(
  density: TableDensityMode,
  ...extras: (string | false | undefined)[]
): string {
  return cn(
    "dlc-data-table",
    ...extras,
    density === "analyst" &&
      "[&_td]:!py-0.5 [&_th]:!py-0.5 [&_td]:!px-2 [&_th]:!px-2 [&_td]:align-top [&_td]:!text-[11px] [&_th]:!text-[11px]",
    density === "compact" &&
      "[&_td]:!py-1 [&_th]:!py-1 [&_td]:!px-2 [&_th]:!px-2 [&_td]:align-top"
  );
}
