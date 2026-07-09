/** Legacy schedule row — `dealData.weightedInterest[]` (`weightedInterestRow`). */
export type DealBusinessDebtRow = {
  account?: string;
  balance?: string;
  ratePct?: string;
  monthlyPayment?: string;
  note?: string;
  include?: boolean;
};

/** CRM `contactBusinessDebtSchedules` field payload (excluding ids/timestamps). */
export type ContactBusinessDebtShape = {
  sortOrder: number;
  creditor?: string;
  balance?: string;
  monthlyPayment?: string;
  position?: string;
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

/**
 * Map legacy row → CRM schedule fields.
 * account → creditor, note → position; balance and monthlyPayment unchanged.
 */
export function businessDebtRowToScheduleShape(
  row: unknown,
  sortOrder: number,
): ContactBusinessDebtShape {
  if (!row || typeof row !== "object") {
    return { sortOrder };
  }
  const rec = row as DealBusinessDebtRow;
  return {
    sortOrder,
    ...(strField(rec.account) !== undefined
      ? { creditor: strField(rec.account) }
      : {}),
    ...(strField(rec.balance) !== undefined ? { balance: strField(rec.balance) } : {}),
    ...(strField(rec.monthlyPayment) !== undefined
      ? { monthlyPayment: strField(rec.monthlyPayment) }
      : {}),
    ...(strField(rec.note) !== undefined ? { position: strField(rec.note) } : {}),
  };
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
