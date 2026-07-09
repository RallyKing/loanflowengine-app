import { monthlyPayment, parseRate, toNumber } from "./finance";

/** One side of the loan comparison tool (current vs proposed). */
export type ComparisonLoanSideInput = {
  fundingAmount?: string | null;
  ratePct?: string | null;
  termMonths?: string | null;
  escrowMonthly?: string | null;
};

/**
 * P&I, first-month split, escrow, and naive life-of-loan total for one comparison side.
 * Centralizes logic used by `ComparisonSectionCore` so it cannot drift from other P&I math.
 */
export function computeComparisonLoanSideMetrics(side: ComparisonLoanSideInput) {
  const loan = toNumber(side.fundingAmount);
  const rate = parseRate(side.ratePct);
  const months = toNumber(side.termMonths) || 360;
  const pi = monthlyPayment(loan, rate, months);
  const interest = loan * (rate / 12);
  const principal = Math.max(0, pi - interest);
  const escrow = toNumber(side.escrowMonthly);
  const total = pi + escrow;
  const lifeTotal = pi * months;
  return { loan, rate, months, pi, interest, principal, escrow, total, lifeTotal };
}
