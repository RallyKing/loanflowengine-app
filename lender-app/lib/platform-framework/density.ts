import type { TableDensityMode } from "@/lib/userSettingsStorage";

/**
 * Platform density — superset of table density for future “dense” ledger / analytics.
 * Map user settings → `PlatformDensity` at the app shell when wiring `DensityRoot`.
 */

export type PlatformDensity = TableDensityMode | "dense";

export const DENSITY_DATA_ATTR = "data-dlc-density" as const;

export function densityDocumentProps(density: PlatformDensity): {
  [K in typeof DENSITY_DATA_ATTR]: PlatformDensity;
} {
  return { [DENSITY_DATA_ATTR]: density };
}

/** Row vertical padding scale (px) — virtualizers should derive `estimateSize` from this. */
/** Phase 26.5 — taller rows for permanent 3-line file hierarchy stack. */
export function densityRowHeightPx(density: PlatformDensity): number {
  switch (density) {
    case "compact":
      return 60;
    case "dense":
      return 52;
    case "analyst":
      return 52;
    case "comfortable":
    default:
      return 72;
  }
}

export function densityTableCellPaddingClass(density: PlatformDensity): string {
  switch (density) {
    case "dense":
      return "px-2 py-1 text-xs";
    case "analyst":
      return "px-2 py-0.5 text-[11px] leading-tight";
    case "compact":
      return "px-2 py-1.5 text-xs";
    case "comfortable":
    default:
      return "px-3 py-2.5 text-sm";
  }
}
