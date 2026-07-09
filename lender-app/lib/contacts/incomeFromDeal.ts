/** Intake income row — aligned with `contactStickyIncomeRowV`. */
export type DealIncomeRow = {
  borrower?: string;
  source?: string;
  description?: string;
  monthlyAmount?: string;
  notes?: string;
};

function collapseTag(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map UI borrower tag → `dealData.borrowers` index.
 * Returns null for unrecognized tags (e.g. "Other", empty) — skip relational sync.
 */
export function incomeBorrowerTagToBorrowerIndex(
  tag: string | undefined,
): number | null {
  const t = collapseTag(tag ?? "");
  if (!t || t === "other") return null;
  if (t === "borrower 1" || t === "borrower1") return 0;
  const borrowerMatch = t.match(/^borrower\s*(\d+)$/);
  if (borrowerMatch) {
    const n = parseInt(borrowerMatch[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n - 1 : null;
  }
  const coMatch = t.match(/^co[-\s]?borrower\s*(\d+)$/);
  if (coMatch) {
    const n = parseInt(coMatch[1]!, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function groupIncomeRowsByBorrowerIndex(
  incomeRows: readonly unknown[],
): Map<number, unknown[]> {
  const map = new Map<number, unknown[]>();
  for (const row of incomeRows) {
    const tag =
      row && typeof row === "object"
        ? (row as DealIncomeRow).borrower
        : undefined;
    const idx = incomeBorrowerTagToBorrowerIndex(tag);
    if (idx === null) continue;
    const list = map.get(idx) ?? [];
    list.push(row);
    map.set(idx, list);
  }
  return map;
}

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Normalize intake row → CRM `contactFinancialProfiles.income` element. */
export function incomeRowToProfileShape(row: unknown): DealIncomeRow {
  if (!row || typeof row !== "object") return {};
  const rec = row as DealIncomeRow;
  return {
    ...(strField(rec.borrower) !== undefined
      ? { borrower: strField(rec.borrower) }
      : {}),
    ...(strField(rec.source) !== undefined ? { source: strField(rec.source) } : {}),
    ...(strField(rec.description) !== undefined
      ? { description: strField(rec.description) }
      : {}),
    ...(strField(rec.monthlyAmount) !== undefined
      ? { monthlyAmount: strField(rec.monthlyAmount) }
      : {}),
    ...(strField(rec.notes) !== undefined ? { notes: strField(rec.notes) } : {}),
  };
}

export function incomeRowsToProfileArray(rows: readonly unknown[]): DealIncomeRow[] {
  return rows.map(incomeRowToProfileShape);
}
