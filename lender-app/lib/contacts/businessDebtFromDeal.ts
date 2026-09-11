/** Legacy + extended schedule row — `dealData.weightedInterest[]`. */
export type DealBusinessDebtRow = {
  rowId?: string;
  account?: string;
  balance?: string;
  ratePct?: string;
  monthlyPayment?: string;
  note?: string;
  include?: boolean;
  debtType?: string;
  debtTypeOther?: string;
  originalAmount?: string;
  originationDate?: string;
  maturityDate?: string;
  assignedContactIds?: string[];
};

/** CRM `contactBusinessDebtSchedules` field payload (excluding ids/timestamps). */
export type ContactBusinessDebtShape = {
  sortOrder: number;
  creditor?: string;
  balance?: string;
  monthlyPayment?: string;
  position?: string;
  debtType?: string;
  debtTypeOther?: string;
  originalAmount?: string;
  originationDate?: string;
  ratePct?: string;
  maturityDate?: string;
};

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normKey(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Deterministic dedup key — mirrors backfill `debtFingerprint`. */
export function businessDebtFingerprintFromLegacyRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as DealBusinessDebtRow;
  return `${normKey(rec.account)}|${normKey(rec.balance)}|${normKey(rec.monthlyPayment)}`;
}

export function businessDebtFingerprintFromScheduleShape(
  row: ContactBusinessDebtShape,
): string {
  return `${normKey(row.creditor)}|${normKey(row.balance)}|${normKey(row.monthlyPayment)}`;
}

export function businessDebtFingerprintFromStored(row: {
  creditor?: string;
  balance?: string;
  monthlyPayment?: string;
}): string {
  return `${normKey(row.creditor)}|${normKey(row.balance)}|${normKey(row.monthlyPayment)}`;
}

const SHAPE_STRING_KEYS = [
  "creditor",
  "balance",
  "monthlyPayment",
  "position",
  "debtType",
  "debtTypeOther",
  "originalAmount",
  "originationDate",
  "ratePct",
  "maturityDate",
] as const;

/**
 * Map legacy row → CRM schedule fields.
 * account → creditor, note → position; new schedule fields pass through.
 */
export function businessDebtRowToScheduleShape(
  row: unknown,
  sortOrder: number,
): ContactBusinessDebtShape {
  if (!row || typeof row !== "object") {
    return { sortOrder };
  }
  const rec = row as DealBusinessDebtRow;
  const shape: ContactBusinessDebtShape = { sortOrder };
  const creditor = strField(rec.account);
  if (creditor !== undefined) shape.creditor = creditor;
  const balance = strField(rec.balance);
  if (balance !== undefined) shape.balance = balance;
  const monthlyPayment = strField(rec.monthlyPayment);
  if (monthlyPayment !== undefined) shape.monthlyPayment = monthlyPayment;
  const position = strField(rec.note);
  if (position !== undefined) shape.position = position;
  const debtType = strField(rec.debtType);
  if (debtType !== undefined) shape.debtType = debtType;
  const debtTypeOther = strField(rec.debtTypeOther);
  if (debtTypeOther !== undefined) shape.debtTypeOther = debtTypeOther;
  const originalAmount = strField(rec.originalAmount);
  if (originalAmount !== undefined) shape.originalAmount = originalAmount;
  const originationDate = strField(rec.originationDate);
  if (originationDate !== undefined) shape.originationDate = originationDate;
  const ratePct = strField(rec.ratePct);
  if (ratePct !== undefined) shape.ratePct = ratePct;
  const maturityDate = strField(rec.maturityDate);
  if (maturityDate !== undefined) shape.maturityDate = maturityDate;
  return shape;
}

export function businessDebtRowsToScheduleArray(
  rows: readonly unknown[],
): ContactBusinessDebtShape[] {
  return rows
    .filter((row) => {
      if (!row || typeof row !== "object") return false;
      if ((row as DealBusinessDebtRow).include === false) return false;
      return Boolean(businessDebtFingerprintFromLegacyRow(row).replace(/\|/g, "").trim());
    })
    .map((row, index) => businessDebtRowToScheduleShape(row, index));
}

export function contactBusinessDebtShapeKeys(): typeof SHAPE_STRING_KEYS {
  return SHAPE_STRING_KEYS;
}
