/** Intake REO row — aligned with `reoRow` in `intakeSchemaPart`. */
export type DealReoRow = {
  purchasedDate?: string;
  state?: string;
  usage?: string;
  address?: string;
  propertyType?: string;
  marketValue?: string;
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
};

/** CRM `contactReoProperties` field payload (excluding ids/timestamps). */
export type ContactReoPropertyShape = {
  sortOrder: number;
  propertyAddress?: string;
  propertyType?: string;
  usage?: string;
  state?: string;
  purchasedDate?: string;
  marketValue?: string;
  mortgageBalance?: string;
  monthlyPayment?: string;
  rate?: string;
  position?: string;
  taxes?: string;
  insurance?: string;
  hoa?: string;
  escrow?: string;
  grossRent?: string;
  netRent?: string;
  apn?: string;
  invested?: string;
  latLong?: string;
};

function strField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function normKey(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Deterministic dedup key — mirrors backfill `reoFingerprint`. */
export function reoFingerprintFromLegacyRow(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const rec = row as DealReoRow;
  return `${normKey(rec.address)}|${normKey(rec.apn)}|${normKey(rec.state)}`;
}

export function reoFingerprintFromProfileShape(
  row: ContactReoPropertyShape,
): string {
  return `${normKey(row.propertyAddress)}|${normKey(row.apn)}|${normKey(row.state)}`;
}

export function reoFingerprintFromStoredProperty(row: {
  propertyAddress?: string;
  apn?: string;
  state?: string;
}): string {
  return `${normKey(row.propertyAddress)}|${normKey(row.apn)}|${normKey(row.state)}`;
}

/**
 * Map legacy intake row → CRM `contactReoProperties` fields.
 * Explicit renames: address → propertyAddress, balance → mortgageBalance,
 * mortgagePayment → monthlyPayment.
 */
export function reoRowToProfileShape(
  row: unknown,
  sortOrder: number,
): ContactReoPropertyShape {
  if (!row || typeof row !== "object") {
    return { sortOrder };
  }
  const rec = row as DealReoRow;
  return {
    sortOrder,
    ...(strField(rec.address) !== undefined
      ? { propertyAddress: strField(rec.address) }
      : {}),
    ...(strField(rec.propertyType) !== undefined
      ? { propertyType: strField(rec.propertyType) }
      : {}),
    ...(strField(rec.usage) !== undefined ? { usage: strField(rec.usage) } : {}),
    ...(strField(rec.state) !== undefined ? { state: strField(rec.state) } : {}),
    ...(strField(rec.purchasedDate) !== undefined
      ? { purchasedDate: strField(rec.purchasedDate) }
      : {}),
    ...(strField(rec.marketValue) !== undefined
      ? { marketValue: strField(rec.marketValue) }
      : {}),
    ...(strField(rec.balance) !== undefined
      ? { mortgageBalance: strField(rec.balance) }
      : {}),
    ...(strField(rec.mortgagePayment) !== undefined
      ? { monthlyPayment: strField(rec.mortgagePayment) }
      : {}),
    ...(strField(rec.rate) !== undefined ? { rate: strField(rec.rate) } : {}),
    ...(strField(rec.position) !== undefined
      ? { position: strField(rec.position) }
      : {}),
    ...(strField(rec.taxes) !== undefined ? { taxes: strField(rec.taxes) } : {}),
    ...(strField(rec.insurance) !== undefined
      ? { insurance: strField(rec.insurance) }
      : {}),
    ...(strField(rec.hoa) !== undefined ? { hoa: strField(rec.hoa) } : {}),
    ...(strField(rec.escrow) !== undefined ? { escrow: strField(rec.escrow) } : {}),
    ...(strField(rec.grossRent) !== undefined
      ? { grossRent: strField(rec.grossRent) }
      : {}),
    ...(strField(rec.netRent) !== undefined ? { netRent: strField(rec.netRent) } : {}),
    ...(strField(rec.apn) !== undefined ? { apn: strField(rec.apn) } : {}),
    ...(strField(rec.invested) !== undefined
      ? { invested: strField(rec.invested) }
      : {}),
    ...(strField(rec.latLong) !== undefined
      ? { latLong: strField(rec.latLong) }
      : {}),
  };
}

export function reoRowsToProfileArray(
  rows: readonly unknown[],
): ContactReoPropertyShape[] {
  return rows.map((row, index) => reoRowToProfileShape(row, index));
}
