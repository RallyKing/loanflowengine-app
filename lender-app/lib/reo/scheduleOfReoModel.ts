/**
 * Schedule of Real Estate Owned — formulas mirror
 * `TEMPLATE - Sechdule of Real Estate Owned.xlsx` (sheet REO).
 *
 * Spreadsheet map (row 3 example, shared down the schedule):
 * - Escrow O3      = SUM(L3:N3) = taxes + insurance + HOA
 * - Net rent Q3    = P3 − (L3 + M3 + N3 + J3)
 *                  = grossRent − (taxes + insurance + HOA + mortgagePayment)
 * - Totals G/I/J/L/M/N/P/Q = SUM of each money column
 *
 * Invested total in the blank template is `SUM(S9:S10)` (two rows only) —
 * almost certainly a leftover. DLC sums **all** invested cells.
 *
 * Equity / LTV are derived for underwriting (not printed as Excel inputs):
 * - equity = marketValue − balance
 * - ltv    = balance / marketValue when marketValue > 0
 */
import { formatUSD, toNumber } from "@/lib/intake/finance";
import { newScheduleRowId, normalizeContactIdList } from "@/lib/schedule/contactIds";
import {
  coerceScheduleString,
  normalizeScheduleDateInput,
} from "@/lib/schedule/dateInput";
import { normalizeReoListingUrl } from "@/lib/reo/zillowUrl";

export { normalizeContactIdList } from "@/lib/schedule/contactIds";

export const REO_SCHEDULE_VERSION = 1 as const;

/** Excel D3:D24 list is PRIMARY/RENTAL; DLC keeps 2nd Home + Commercial. */
export const REO_USAGE_OPTIONS = [
  "Primary",
  "Rental",
  "2nd Home",
  "Commercial",
] as const;

/** Excel H3:H24 list: 1st, 2nd, 3rd, HELOC. */
export const REO_POSITION_OPTIONS = ["1st", "2nd", "3rd", "HELOC"] as const;

/** Excel F3:F24 property-type list. */
export const REO_PROPERTY_TYPE_OPTIONS = [
  "SFR",
  "CONDO",
  "MANU",
  "COM",
  "MOBIL",
  "DUPLX",
  "4PLX",
  "6Unit",
  "8Unit",
] as const;

export type DealReoRow = {
  /** Stable client id for copy / selection (optional on legacy rows). */
  rowId?: string;
  purchasedDate?: string;
  state?: string;
  usage?: string;
  address?: string;
  propertyType?: string;
  marketValue?: string;
  /** Zillow / listing URL for this property (next to market value). */
  zillowUrl?: string;
  position?: string;
  balance?: string;
  mortgagePayment?: string;
  rate?: string;
  taxes?: string;
  insurance?: string;
  hoa?: string;
  escrow?: string;
  grossRent?: string;
  netRent?: string;
  apn?: string;
  invested?: string;
  latLong?: string;
  lotSf?: string;
  propSf?: string;
  mostRecent?: string;
  assignedContactIds?: string[];
};

export type ReoBlockMeta = {
  assignedContactIds?: string[];
};

const REO_USAGE_ALIASES: Record<string, string> = {
  investment: "Rental",
  rental: "Rental",
  "2nd home": "2nd Home",
  "second home": "2nd Home",
  "2ndhome": "2nd Home",
  primary: "Primary",
  "primary residence": "Primary",
  commercial: "Commercial",
};

const REO_POSITION_ALIASES: Record<string, string> = {
  first: "1st",
  "1st": "1st",
  second: "2nd",
  "2nd": "2nd",
  third: "3rd",
  "3rd": "3rd",
  heloc: "HELOC",
};

const REO_PROPERTY_TYPE_ALIASES: Record<string, string> = {
  "single family": "SFR",
  sfr: "SFR",
  condo: "CONDO",
  condominium: "CONDO",
  manufactured: "MANU",
  manu: "MANU",
  commercial: "COM",
  com: "COM",
  mobile: "MOBIL",
  mobil: "MOBIL",
  duplex: "DUPLX",
  duplx: "DUPLX",
  "4 plex": "4PLX",
  "4plex": "4PLX",
  "4plx": "4PLX",
  "6 unit": "6Unit",
  "6unit": "6Unit",
  "8 unit": "8Unit",
  "8unit": "8Unit",
};

function normalizeReoChoice(
  value: string,
  options: readonly string[],
  aliases: Record<string, string>,
): string {
  const raw = value.trim();
  if (!raw) return "";
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  if (aliases[lower]) return aliases[lower]!;
  const hit = options.find((opt) => opt.toLowerCase() === lower);
  return hit ?? raw;
}

export type ReoRowComputed = {
  taxes: number;
  insurance: number;
  hoa: number;
  mortgagePayment: number;
  grossRent: number;
  marketValue: number;
  balance: number;
  invested: number;
  /** O = L+M+N */
  escrow: number;
  /** Q = P − (L+M+N+J) */
  netRent: number;
  equity: number;
  ltv: number | null;
};

export type ReoScheduleTotals = {
  marketValue: number;
  balance: number;
  mortgagePayment: number;
  taxes: number;
  insurance: number;
  hoa: number;
  escrow: number;
  grossRent: number;
  netRent: number;
  invested: number;
  equity: number;
};

const REO_STRING_KEYS = [
  "purchasedDate",
  "state",
  "usage",
  "address",
  "propertyType",
  "marketValue",
  "zillowUrl",
  "position",
  "balance",
  "mortgagePayment",
  "rate",
  "taxes",
  "insurance",
  "hoa",
  "escrow",
  "grossRent",
  "netRent",
  "apn",
  "invested",
  "latLong",
  "lotSf",
  "propSf",
  "mostRecent",
] as const;

const REO_DATE_KEYS = ["purchasedDate", "mostRecent"] as const;

/**
 * Strip unknown keys and coerce numbers → strings so `reoRow` Convex
 * validators accept the payload (legacy Excel / CRM imports often send numbers).
 */
export function sanitizeDealReoRow(row: unknown): DealReoRow {
  const rec =
    row && typeof row === "object" && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : {};
  const out: DealReoRow = {};
  const rowId = coerceScheduleString(rec.rowId)?.trim();
  if (rowId) out.rowId = rowId;
  for (const key of REO_STRING_KEYS) {
    let value = coerceScheduleString(rec[key]);
    if (value === undefined) continue;
    if ((REO_DATE_KEYS as readonly string[]).includes(key)) {
      value = normalizeScheduleDateInput(value);
    } else if (key === "usage") {
      value = normalizeReoChoice(value, REO_USAGE_OPTIONS, REO_USAGE_ALIASES);
    } else if (key === "position") {
      value = normalizeReoChoice(value, REO_POSITION_OPTIONS, REO_POSITION_ALIASES);
    } else if (key === "propertyType") {
      value = normalizeReoChoice(
        value,
        REO_PROPERTY_TYPE_OPTIONS,
        REO_PROPERTY_TYPE_ALIASES,
      );
    } else if (key === "zillowUrl") {
      const href = normalizeReoListingUrl(value);
      if (!href) continue;
      value = href;
    }
    out[key] = value;
  }
  const assigned = normalizeContactIdList(rec.assignedContactIds);
  if (assigned.length > 0) out.assignedContactIds = assigned;
  return out;
}

export function sanitizeDealReoRows(
  rows: readonly unknown[] | undefined | null,
): DealReoRow[] {
  return (Array.isArray(rows) ? rows : []).map((row) => sanitizeDealReoRow(row));
}

/** Assign a stable id when persisting — never invent ids during render. */
export function ensureDealReoRowId(row: DealReoRow): DealReoRow {
  const sanitized = sanitizeDealReoRow(row);
  if (sanitized.rowId) return sanitized;
  return { ...sanitized, rowId: newReoRowId() };
}

export function createEmptyReoRow(
  defaults?: Partial<DealReoRow>,
): DealReoRow {
  return sanitizeDealReoRow({
    rowId: newReoRowId(),
    usage: "Rental",
    position: "1st",
    propertyType: "SFR",
    ...defaults,
  });
}

export function newReoRowId(): string {
  return newScheduleRowId("reo");
}

export function computeReoRow(row: DealReoRow | undefined | null): ReoRowComputed {
  const taxes = toNumber(row?.taxes);
  const insurance = toNumber(row?.insurance);
  const hoa = toNumber(row?.hoa);
  const mortgagePayment = toNumber(row?.mortgagePayment);
  const grossRent = toNumber(row?.grossRent);
  const marketValue = toNumber(row?.marketValue);
  const balance = toNumber(row?.balance);
  const invested = toNumber(row?.invested);
  const escrow = taxes + insurance + hoa;
  const netRent = grossRent - (taxes + insurance + hoa + mortgagePayment);
  const equity = marketValue - balance;
  const ltv = marketValue > 0 ? balance / marketValue : null;
  return {
    taxes,
    insurance,
    hoa,
    mortgagePayment,
    grossRent,
    marketValue,
    balance,
    invested,
    escrow,
    netRent,
    equity,
    ltv,
  };
}

export function computeReoScheduleTotals(
  rows: readonly DealReoRow[] | undefined | null,
): ReoScheduleTotals {
  const list = Array.isArray(rows) ? rows : [];
  const totals: ReoScheduleTotals = {
    marketValue: 0,
    balance: 0,
    mortgagePayment: 0,
    taxes: 0,
    insurance: 0,
    hoa: 0,
    escrow: 0,
    grossRent: 0,
    netRent: 0,
    invested: 0,
    equity: 0,
  };
  for (const row of list) {
    const c = computeReoRow(row);
    totals.marketValue += c.marketValue;
    totals.balance += c.balance;
    totals.mortgagePayment += c.mortgagePayment;
    totals.taxes += c.taxes;
    totals.insurance += c.insurance;
    totals.hoa += c.hoa;
    totals.escrow += c.escrow;
    totals.grossRent += c.grossRent;
    totals.netRent += c.netRent;
    totals.invested += c.invested;
    totals.equity += c.equity;
  }
  return totals;
}

/** Persist computed escrow / net rent onto a row (does not mutate input). */
export function withComputedReoFields(row: DealReoRow): DealReoRow {
  const sanitized = sanitizeDealReoRow(row);
  const c = computeReoRow(sanitized);
  return {
    ...sanitized,
    escrow: formatReoMoneyInput(c.escrow),
    netRent: formatReoMoneyInput(c.netRent),
  };
}

export function formatReoMoneyInput(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return String(Math.round(n * 100) / 100);
}

export function formatReoUsd(n: number): string {
  return formatUSD(n);
}

export function formatReoLtv(ltv: number | null): string {
  if (ltv == null || !Number.isFinite(ltv)) return "—";
  return `${(ltv * 100).toFixed(1)}%`;
}

export function reoRowHasIdentity(row: DealReoRow | undefined | null): boolean {
  if (!row) return false;
  return Boolean(
    (row.address ?? "").trim() ||
      (row.apn ?? "").trim() ||
      (row.marketValue ?? "").trim() ||
      (row.latLong ?? "").trim(),
  );
}

export function cloneReoRowForCopy(row: DealReoRow): DealReoRow {
  const assignedContactIds = normalizeContactIdList(row.assignedContactIds);
  return withComputedReoFields({
    ...row,
    rowId: newReoRowId(),
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
  });
}

export function cloneReoBlockForCopy(input: {
  rows: readonly DealReoRow[];
  meta?: ReoBlockMeta | null;
}): { rows: DealReoRow[]; meta: ReoBlockMeta } {
  return {
    rows: input.rows.map(cloneReoRowForCopy),
    meta: {
      assignedContactIds: normalizeContactIdList(input.meta?.assignedContactIds),
    },
  };
}

export function mergeReoIntoTarget(input: {
  targetRows: readonly DealReoRow[] | undefined | null;
  targetMeta?: ReoBlockMeta | null;
  incomingRows: readonly DealReoRow[];
  incomingMeta?: ReoBlockMeta | null;
  copyBlockAssignees: boolean;
}): { rows: DealReoRow[]; meta: ReoBlockMeta } {
  const existing = Array.isArray(input.targetRows) ? [...input.targetRows] : [];
  const kept = existing.filter(reoRowHasIdentity);
  const incoming = input.incomingRows.map(cloneReoRowForCopy);
  const targetIds = normalizeContactIdList(input.targetMeta?.assignedContactIds);
  const incomingIds = normalizeContactIdList(input.incomingMeta?.assignedContactIds);
  const assignedContactIds = input.copyBlockAssignees
    ? normalizeContactIdList([...targetIds, ...incomingIds])
    : targetIds;
  return {
    rows: [...kept, ...incoming],
    meta: { assignedContactIds },
  };
}

export function selectReoRowsByIndex(
  rows: readonly DealReoRow[] | undefined | null,
  indexes: readonly number[],
): DealReoRow[] {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set<number>();
  const out: DealReoRow[] = [];
  for (const raw of indexes) {
    const i = Math.trunc(raw);
    if (!Number.isFinite(i) || i < 0 || i >= list.length || seen.has(i)) continue;
    seen.add(i);
    const row = list[i];
    if (row) out.push(row);
  }
  return out;
}
