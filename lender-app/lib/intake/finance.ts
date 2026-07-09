/**
 * Core money parsing and mortgage math (`toNumber`, `parseRate`, `monthlyPayment`, …).
 * Higher-level tools compose these: **`dtiCompute`**, **`comparisonLoanSide`**,
 * **`weightedInterestBlend`**, **`moneyAggregates`** — prefer those for UI totals
 * so formulas stay consistent.
 */
export function toNumber(v: string | number | undefined | null): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatUSD(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPct(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Convert a rate string like "6.25%" or "0.0625" to a decimal (0.0625). */
export function parseRate(v: string | number | undefined | null): number {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  const stripped = raw.replace(/[^0-9.\-]/g, "");
  const n = Number(stripped);
  if (!Number.isFinite(n)) return 0;
  // If the original had %, or the value is >= 1 (e.g. "6.25"), treat as percent.
  if (raw.includes("%") || n >= 1) return n / 100;
  return n;
}

/** Monthly mortgage payment (P&I). */
export function monthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Total interest paid over the loan life at the scheduled payment. */
export function totalInterest(
  principal: number,
  annualRate: number,
  months: number,
): number {
  const pmt = monthlyPayment(principal, annualRate, months);
  return pmt * months - principal;
}

export interface AmortRow {
  idx: number;
  date: string; // ISO yyyy-mm-dd
  beginningBalance: number;
  scheduledPayment: number;
  extraPayment: number;
  totalPayment: number;
  principal: number;
  interest: number;
  endingBalance: number;
}

export function buildAmortization(opts: {
  fundingAmount: number;
  annualRate: number;
  periodYears: number;
  startDate?: string;
  extraPayment?: number;
  maxRows?: number;
}): { rows: AmortRow[]; scheduledPayment: number; monthsOffLoan: number; totalInterest: number } {
  const { fundingAmount, annualRate, periodYears } = opts;
  const months = Math.round(periodYears * 12);
  const scheduled = monthlyPayment(fundingAmount, annualRate, months);
  const r = annualRate / 12;
  const start = opts.startDate ? new Date(opts.startDate) : new Date();
  const rows: AmortRow[] = [];
  let balance = fundingAmount;
  let totalInt = 0;
  const maxRows = opts.maxRows ?? months;
  for (let i = 0; i < maxRows; i += 1) {
    if (balance <= 0.0001) break;
    const interest = balance * r;
    const extra = opts.extraPayment ?? 0;
    let principal = scheduled - interest + extra;
    if (principal > balance) principal = balance;
    const totalPayment = principal + interest;
    const ending = Math.max(0, balance - principal);
    const dt = new Date(start);
    dt.setMonth(start.getMonth() + i);
    rows.push({
      idx: i + 1,
      date: dt.toISOString().slice(0, 10),
      beginningBalance: balance,
      scheduledPayment: scheduled,
      extraPayment: extra,
      totalPayment,
      principal,
      interest,
      endingBalance: ending,
    });
    totalInt += interest;
    balance = ending;
  }
  return {
    rows,
    scheduledPayment: scheduled,
    monthsOffLoan: months - rows.length,
    totalInterest: totalInt,
  };
}

export function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const d1 = new Date(a);
  const d2 = new Date(b);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
  const ms = d2.getTime() - d1.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
