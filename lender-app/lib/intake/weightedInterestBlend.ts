import { parseRate, toNumber } from "./finance";

type WeightedRow = {
  balance?: string | null;
  ratePct?: string | null;
  monthlyPayment?: string | null;
  include?: boolean | null;
};

function includedRows<T extends WeightedRow>(rows: ReadonlyArray<T>): T[] {
  return rows.filter((r) => r.include !== false);
}

/**
 * Balance-weighted average rate for the weighted-interest analysis tool.
 */
export function computeWeightedAverageRateByBalance(
  rows: ReadonlyArray<WeightedRow>,
): number {
  const active = includedRows(rows);
  const totalBalance = active.reduce((s, r) => s + toNumber(r.balance), 0);
  if (totalBalance <= 0) return 0;
  return (
    active.reduce((s, r) => s + toNumber(r.balance) * parseRate(r.ratePct), 0) /
    totalBalance
  );
}

export function sumWeightedInterestMonthlyPayments(
  rows: ReadonlyArray<WeightedRow>,
): number {
  return includedRows(rows).reduce((s, r) => s + toNumber(r.monthlyPayment), 0);
}
