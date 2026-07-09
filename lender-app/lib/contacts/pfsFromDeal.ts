/** Intake PFS asset row — aligned with `contactStickyAssetRowV`. */
export type DealAssetRow = {
  description?: string;
  estimatedValue?: string;
  notes?: string;
};

/** Intake PFS liability row — aligned with `contactStickyLiabilityRowV`. */
export type DealLiabilityRow = {
  description?: string;
  monthlyPayment?: string;
  balance?: string;
  notes?: string;
};

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function assetRowToProfileShape(row: unknown): DealAssetRow {
  if (!row || typeof row !== "object") return {};
  const rec = row as DealAssetRow;
  return {
    ...(strField(rec.description) !== undefined
      ? { description: strField(rec.description) }
      : {}),
    ...(strField(rec.estimatedValue) !== undefined
      ? { estimatedValue: strField(rec.estimatedValue) }
      : {}),
    ...(strField(rec.notes) !== undefined ? { notes: strField(rec.notes) } : {}),
  };
}

export function liabilityRowToProfileShape(row: unknown): DealLiabilityRow {
  if (!row || typeof row !== "object") return {};
  const rec = row as DealLiabilityRow;
  return {
    ...(strField(rec.description) !== undefined
      ? { description: strField(rec.description) }
      : {}),
    ...(strField(rec.monthlyPayment) !== undefined
      ? { monthlyPayment: strField(rec.monthlyPayment) }
      : {}),
    ...(strField(rec.balance) !== undefined ? { balance: strField(rec.balance) } : {}),
    ...(strField(rec.notes) !== undefined ? { notes: strField(rec.notes) } : {}),
  };
}

export function assetsToProfileArray(rows: readonly unknown[]): DealAssetRow[] {
  return rows.map(assetRowToProfileShape);
}

export function liabilitiesToProfileArray(
  rows: readonly unknown[],
): DealLiabilityRow[] {
  return rows.map(liabilityRowToProfileShape);
}
