/**
 * Full-filter lead-count scan for DC award radar.
 *
 * Convex `leadStats` uses one indexed `.take(SCAN_CAP + 1)` — never
 * `.collect()`, never a scheduler pump. If the index page hits the cap,
 * `partial` is true and the UI says so (fail-closed).
 *
 * Contact-channel uniqueness matches `summarizeDcAwardRadarLeads` on the
 * scanned set, so page-2 phones still count when page 1 is the only list
 * page in memory.
 */

import {
  DC_AWARD_CONTACT_FILTER_IDS,
  filterSignalsByContactFilters,
  type DcAwardRadarContactFilterId,
  type DcAwardRadarContactFilterSet,
} from "./dcAwardRadarContacts";
import { dcAwardCampusGroupKey } from "./dcAwardRadarCampus";
import type { DcAwardRadarCategory } from "./dcAwardRadar";
import {
  formatDcAwardRadarLoadedStatsNote,
} from "./dcAwardRadarPagination";
import {
  summarizeDcAwardRadarLeads,
  type DcAwardRadarLeadStatRow,
  type DcAwardRadarLeadStats,
} from "./dcAwardRadarStats";

/** Hard safety cap — above list page size (200), under Convex read budget. */
export const DC_AWARD_RADAR_LEAD_STATS_SCAN_CAP = 4_000;

export type DcAwardRadarListCategoryFilter =
  | DcAwardRadarCategory
  | "data_center_or_blank";

export type DcAwardRadarListFilterArgs = {
  market?: string;
  confidence?: "high" | "med" | "low";
  category?: DcAwardRadarListCategoryFilter;
};

export type DcAwardRadarLeadStatsScanRow = DcAwardRadarLeadStatRow & {
  _id?: string;
  projectOrCampus?: string;
  campusKey?: string;
  campusName?: string;
  market?: string;
};

export type DcAwardRadarLeadStatsScanResult = DcAwardRadarLeadStats & {
  scannedCount: number;
  matchedCount: number;
  partial: boolean;
  scanCap: number;
};

export type DcAwardRadarLeadStatsDisplay = {
  stats: DcAwardRadarLeadStats;
  source: "server" | "loaded";
  partial: boolean;
  statsLoading: boolean;
  note: string | null;
  scanCap?: number;
};

const EMPTY_SCAN: DcAwardRadarLeadStats = {
  signalCount: 0,
  campusGroupCount: 0,
  uniqueContactCount: 0,
  contactsWithPhone: 0,
  contactsWithEmail: 0,
  contactsWithLinkedIn: 0,
  contactsWithCell: 0,
  highConfidenceSignalCount: 0,
};

export function isDcAwardRadarContactFilterId(
  value: string,
): value is DcAwardRadarContactFilterId {
  return (DC_AWARD_CONTACT_FILTER_IDS as readonly string[]).includes(value);
}

export function dcAwardSignalMatchesListFilters(
  row: {
    market: string;
    confidence: "high" | "med" | "low";
    category?: DcAwardRadarCategory;
  },
  filters: DcAwardRadarListFilterArgs,
): boolean {
  if (filters.confidence && row.confidence !== filters.confidence) return false;
  if (filters.market && row.market !== filters.market) return false;
  if (
    filters.category &&
    filters.category !== "data_center_or_blank" &&
    row.category !== filters.category
  ) {
    return false;
  }
  if (filters.category === "data_center_or_blank") {
    return row.category === undefined || row.category === "data_center";
  }
  return true;
}

export function countDcAwardRadarCampusGroups(
  rows: readonly Pick<
    DcAwardRadarLeadStatsScanRow,
    "campusKey" | "campusName" | "company" | "projectOrCampus"
  >[],
): number {
  const keys = new Set<string>();
  for (const row of rows) {
    keys.add(
      dcAwardCampusGroupKey({
        campusKey: row.campusKey,
        campusName: row.campusName,
        company: row.company,
        projectOrCampus: row.projectOrCampus ?? "",
      }),
    );
  }
  return keys.size;
}

export function summarizeDcAwardRadarLeadStatsScan(args: {
  scannedRows: readonly DcAwardRadarLeadStatsScanRow[];
  scanCap: number;
  contactFilters: DcAwardRadarContactFilterSet;
  /** True when the indexed `.take(cap+1)` saw more rows than the cap. */
  indexOverflow?: boolean;
}): DcAwardRadarLeadStatsScanResult {
  const { scanCap, contactFilters } = args;
  const overflow =
    Boolean(args.indexOverflow) || args.scannedRows.length > scanCap;
  const bounded =
    args.scannedRows.length > scanCap
      ? args.scannedRows.slice(0, scanCap)
      : args.scannedRows;
  if (bounded.length === 0) {
    return {
      ...EMPTY_SCAN,
      scannedCount: 0,
      matchedCount: 0,
      partial: overflow,
      scanCap,
    };
  }
  const filtered = filterSignalsByContactFilters(bounded, contactFilters);
  const stats = summarizeDcAwardRadarLeads(
    filtered,
    countDcAwardRadarCampusGroups(filtered),
  );
  return {
    ...stats,
    scannedCount: bounded.length,
    matchedCount: filtered.length,
    partial: overflow,
    scanCap,
  };
}

export function formatDcAwardRadarLeadStatsNote(args: {
  source: "server" | "loaded";
  partial: boolean;
  scanCap?: number;
  truncated?: boolean;
  hitPageCap?: boolean;
  statsLoading?: boolean;
}): string | null {
  if (args.statsLoading) {
    return "loading full-filter totals…";
  }
  if (args.source === "server") {
    if (!args.partial) return null;
    const cap = args.scanCap ?? DC_AWARD_RADAR_LEAD_STATS_SCAN_CAP;
    return `from full-filter scan (scan cap ${cap} reached — more may exist)`;
  }
  return formatDcAwardRadarLoadedStatsNote({
    truncated: Boolean(args.truncated),
    hitPageCap: args.hitPageCap,
  });
}

/**
 * Prefer a complete server scan over loaded pages. If the server scan is
 * partial but the client has already loaded more (and exhausted the list),
 * use loaded totals.
 */
export function resolveDcAwardRadarLeadStatsDisplay(args: {
  server: DcAwardRadarLeadStatsScanResult | undefined;
  loaded: DcAwardRadarLeadStats;
  listTruncated: boolean;
  hitPageCap?: boolean;
}): DcAwardRadarLeadStatsDisplay {
  const { server, loaded, listTruncated } = args;
  const hitPageCap = Boolean(args.hitPageCap);

  if (!server) {
    return {
      stats: loaded,
      source: "loaded",
      partial: listTruncated || hitPageCap,
      statsLoading: true,
      note: formatDcAwardRadarLeadStatsNote({
        source: "loaded",
        partial: true,
        statsLoading: true,
      }),
    };
  }

  if (!server.partial) {
    return {
      stats: server,
      source: "server",
      partial: false,
      statsLoading: false,
      note: null,
      scanCap: server.scanCap,
    };
  }

  if (loaded.signalCount > server.signalCount) {
    const stillPartial = listTruncated || hitPageCap;
    return {
      stats: loaded,
      source: "loaded",
      partial: stillPartial,
      statsLoading: false,
      note: formatDcAwardRadarLeadStatsNote({
        source: "loaded",
        partial: stillPartial,
        truncated: listTruncated,
        hitPageCap,
      }),
      scanCap: server.scanCap,
    };
  }

  return {
    stats: server,
    source: "server",
    partial: true,
    statsLoading: false,
    note: formatDcAwardRadarLeadStatsNote({
      source: "server",
      partial: true,
      scanCap: server.scanCap,
    }),
    scanCap: server.scanCap,
  };
}
