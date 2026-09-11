/**
 * Schedule of Business Debt — extends deal `weightedInterest[]`
 * (corporate liabilities / MCA stacking) without a parallel data store.
 */
import { formatUSD, toNumber } from "@/lib/intake/finance";
import {
  newScheduleRowId,
  normalizeContactIdList,
  type ScheduleBlockMeta,
} from "@/lib/schedule/contactIds";
import {
  coerceScheduleString,
  normalizeScheduleDateInput,
} from "@/lib/schedule/dateInput";

export const BUSINESS_DEBT_SCHEDULE_VERSION = 1 as const;

export const BUSINESS_DEBT_TYPE_OPTIONS = [
  "MCA",
  "Term Loan",
  "Vendor",
  "SBA",
  "Line of Credit",
  "Mortgage",
  "Equipment Loan",
  "Credit Card",
  "Other",
] as const;

export type BusinessDebtType = (typeof BUSINESS_DEBT_TYPE_OPTIONS)[number];

/** Deal row — `dealData.weightedInterest[]` (legacy + new schedule fields). */
export type DealBusinessDebtRow = {
  /** Stable client id for copy / selection (optional on legacy rows). */
  rowId?: string;
  /** Creditor (legacy field name `account`). */
  account?: string;
  /** Present balance (legacy). */
  balance?: string;
  /** Current interest rate or factor rate (legacy). */
  ratePct?: string;
  monthlyPayment?: string;
  /** Position / note (legacy). */
  note?: string;
  include?: boolean;
  debtType?: string;
  /** Fill-in when debtType is Other. */
  debtTypeOther?: string;
  originalAmount?: string;
  originationDate?: string;
  maturityDate?: string;
  assignedContactIds?: string[];
};

export type BusinessDebtBlockMeta = ScheduleBlockMeta;

export type BusinessDebtScheduleTotals = {
  originalAmount: number;
  presentBalance: number;
  monthlyPayment: number;
};

export function newBusinessDebtRowId(): string {
  return newScheduleRowId("bd");
}

const BUSINESS_DEBT_STRING_KEYS = [
  "account",
  "balance",
  "ratePct",
  "monthlyPayment",
  "note",
  "debtType",
  "debtTypeOther",
  "originalAmount",
  "originationDate",
  "maturityDate",
] as const;

const BUSINESS_DEBT_DATE_KEYS = ["originationDate", "maturityDate"] as const;

/**
 * Strip unknown keys and coerce numbers → strings so `weightedInterestRow`
 * Convex validators accept the payload.
 */
export function sanitizeDealBusinessDebtRow(row: unknown): DealBusinessDebtRow {
  const rec =
    row && typeof row === "object" && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : {};
  const out: DealBusinessDebtRow = {};
  const rowId = coerceScheduleString(rec.rowId)?.trim();
  if (rowId) out.rowId = rowId;
  for (const key of BUSINESS_DEBT_STRING_KEYS) {
    let value = coerceScheduleString(rec[key]);
    if (value === undefined) continue;
    if ((BUSINESS_DEBT_DATE_KEYS as readonly string[]).includes(key)) {
      value = normalizeScheduleDateInput(value);
    } else if (key === "debtType") {
      value = normalizeBusinessDebtType(value);
    }
    out[key] = value;
  }
  if (typeof rec.include === "boolean") {
    out.include = rec.include;
  } else if (rec.include === "false" || rec.include === 0) {
    out.include = false;
  } else if (rec.include === "true" || rec.include === 1) {
    out.include = true;
  }
  const assigned = normalizeContactIdList(rec.assignedContactIds);
  if (assigned.length > 0) out.assignedContactIds = assigned;
  return out;
}

export function sanitizeDealBusinessDebtRows(
  rows: readonly unknown[] | undefined | null,
): DealBusinessDebtRow[] {
  return (Array.isArray(rows) ? rows : []).map((row) =>
    sanitizeDealBusinessDebtRow(row),
  );
}

/** Assign a stable id when persisting — never invent ids during render. */
export function ensureDealBusinessDebtRowId(
  row: DealBusinessDebtRow,
): DealBusinessDebtRow {
  const sanitized = sanitizeDealBusinessDebtRow(row);
  if (sanitized.rowId) return sanitized;
  return { ...sanitized, rowId: newBusinessDebtRowId() };
}

export function createEmptyBusinessDebtRow(
  defaults?: Partial<DealBusinessDebtRow>,
): DealBusinessDebtRow {
  return sanitizeDealBusinessDebtRow({
    rowId: newBusinessDebtRowId(),
    include: true,
    ...defaults,
  });
}

export function isBusinessDebtType(value: string | undefined | null): value is BusinessDebtType {
  return Boolean(
    value &&
      (BUSINESS_DEBT_TYPE_OPTIONS as readonly string[]).includes(value),
  );
}

const BUSINESS_DEBT_TYPE_ALIASES: Record<string, string> = {
  mca: "MCA",
  "term loan": "Term Loan",
  term: "Term Loan",
  vendor: "Vendor",
  sba: "SBA",
  loc: "Line of Credit",
  "line of credit": "Line of Credit",
  mortgage: "Mortgage",
  "equipment loan": "Equipment Loan",
  equipment: "Equipment Loan",
  "credit card": "Credit Card",
  cc: "Credit Card",
  other: "Other",
};

/** Canonicalize known debt types (case / aliases) without dropping custom labels. */
export function normalizeBusinessDebtType(value: string | undefined | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  if (BUSINESS_DEBT_TYPE_ALIASES[lower]) return BUSINESS_DEBT_TYPE_ALIASES[lower]!;
  const hit = BUSINESS_DEBT_TYPE_OPTIONS.find((opt) => opt.toLowerCase() === lower);
  return hit ?? raw;
}

export function formatBusinessDebtTypeLabel(
  row: Pick<DealBusinessDebtRow, "debtType" | "debtTypeOther"> | undefined | null,
): string {
  const type = (row?.debtType ?? "").trim();
  if (!type) return "";
  if (type === "Other") {
    const other = (row?.debtTypeOther ?? "").trim();
    return other ? `Other — ${other}` : "Other";
  }
  return type;
}

export function computeBusinessDebtScheduleTotals(
  rows: readonly DealBusinessDebtRow[] | undefined | null,
): BusinessDebtScheduleTotals {
  const list = Array.isArray(rows) ? rows : [];
  const active = list.filter((r) => r.include !== false);
  return {
    originalAmount: active.reduce((s, r) => s + toNumber(r.originalAmount), 0),
    presentBalance: active.reduce((s, r) => s + toNumber(r.balance), 0),
    monthlyPayment: active.reduce((s, r) => s + toNumber(r.monthlyPayment), 0),
  };
}

export function formatBusinessDebtUsd(n: number): string {
  return formatUSD(n);
}

export function businessDebtRowHasIdentity(
  row: DealBusinessDebtRow | undefined | null,
): boolean {
  if (!row) return false;
  if (row.include === false) return false;
  return Boolean(
    (row.account ?? "").trim() ||
      (row.originalAmount ?? "").trim() ||
      (row.balance ?? "").trim() ||
      (row.monthlyPayment ?? "").trim() ||
      (row.debtType ?? "").trim() ||
      (row.originationDate ?? "").trim() ||
      (row.maturityDate ?? "").trim(),
  );
}

export function cloneBusinessDebtRowForCopy(
  row: DealBusinessDebtRow,
): DealBusinessDebtRow {
  const sanitized = sanitizeDealBusinessDebtRow(row);
  const assignedContactIds = normalizeContactIdList(sanitized.assignedContactIds);
  return {
    ...sanitized,
    rowId: newBusinessDebtRowId(),
    include: sanitized.include !== false,
    ...(assignedContactIds.length > 0 ? { assignedContactIds } : {}),
  };
}

export function businessDebtRowIsComplete(
  row: DealBusinessDebtRow | undefined | null,
): boolean {
  if (!row || row.include === false) return false;
  const type = (row.debtType ?? "").trim();
  const otherOk = type !== "Other" || Boolean((row.debtTypeOther ?? "").trim());
  return Boolean(
    (row.account ?? "").trim() &&
      type &&
      otherOk &&
      (row.originalAmount ?? "").trim() &&
      (row.originationDate ?? "").trim() &&
      (row.balance ?? "").trim() &&
      (row.ratePct ?? "").trim() &&
      (row.maturityDate ?? "").trim() &&
      (row.monthlyPayment ?? "").trim(),
  );
}
