import { toNumber } from "./finance";

/** Sum a currency-ish string column across intake rows (income, assets, liabilities). */
export function sumIncomeRowsMonthly(
  rows: ReadonlyArray<{ monthlyAmount?: string | null }>,
): number {
  return rows.reduce((s, r) => s + toNumber(r.monthlyAmount), 0);
}

export function sumAssetsEstimatedValue(
  rows: ReadonlyArray<{ estimatedValue?: string | null }>,
): number {
  return rows.reduce((s, r) => s + toNumber(r.estimatedValue), 0);
}

export function sumLiabilitiesMonthlyPayments(
  rows: ReadonlyArray<{ monthlyPayment?: string | null }>,
): number {
  return rows.reduce((s, r) => s + toNumber(r.monthlyPayment), 0);
}

export function sumLiabilitiesBalances(
  rows: ReadonlyArray<{ balance?: string | null }>,
): number {
  return rows.reduce((s, r) => s + toNumber(r.balance), 0);
}
