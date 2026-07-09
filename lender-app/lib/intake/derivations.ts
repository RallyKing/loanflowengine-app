import type { Doc } from "../../convex/_generated/dataModel";
import { toNumber } from "./finance";

type Sheet = Doc<"intakeSheets">;

export type DerivedIntake = ReturnType<typeof deriveIntake>;

export function joinAddress(p?: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string {
  if (!p) return "";
  const line1 = (p.address ?? "").trim();
  const cityState = [p.city, p.state].filter(Boolean).join(", ").trim();
  const tail = [cityState, p.zip].filter(Boolean).join(" ").trim();
  return [line1, tail].filter(Boolean).join(", ");
}

export function borrowerFullName(b?: {
  firstName?: string;
  middleName?: string;
  lastName?: string;
}): string {
  if (!b) return "";
  return [b.firstName, b.middleName, b.lastName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function sum<T>(arr: T[] | undefined, pick: (t: T) => string | undefined | null): number {
  return (arr ?? []).reduce((s, x) => s + toNumber(pick(x) ?? ""), 0);
}

function normalizeAddress(a?: string): string {
  return (a ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function deriveIntake(sheet: Sheet) {
  const subject = sheet.subjectProperty ?? {};
  const primary = sheet.primaryProperty ?? {};
  const subjectAddress = joinAddress(subject);
  const primaryAddress = joinAddress(primary);
  const subjectIsPrimary =
    (sheet.occupancy ?? "").toLowerCase() === "primary" ||
    normalizeAddress(subjectAddress) === normalizeAddress(primaryAddress);

  // --- Borrowers ---
  const borrowers = sheet.borrowers ?? [];
  const names = borrowers.map(borrowerFullName).filter(Boolean);
  const borrowersJoined = names.join(" & ");
  const primaryBorrower = borrowers[0];
  const borrowerPhone = primaryBorrower?.mobile || primaryBorrower?.homePhone || "";
  const borrowerEmail = primaryBorrower?.email || "";

  // --- Income ---
  const incomeRows = sheet.incomeRows ?? [];
  const incomeByBorrower: Record<string, number> = {};
  for (const r of incomeRows) {
    const key = r.borrower || "Other";
    incomeByBorrower[key] = (incomeByBorrower[key] ?? 0) + toNumber(r.monthlyAmount);
  }
  const totalIncome = Object.values(incomeByBorrower).reduce((a, b) => a + b, 0);
  const income1 = incomeByBorrower["Borrower 1"] ?? 0;
  const income2 = incomeByBorrower["Borrower 2"] ?? 0;

  // --- Loans ---
  const loans = sheet.loans ?? [];
  const firstLoan = loans.find((l) => l.position === "1st") ?? loans[0];
  const secondLoan = loans.find((l) => l.position === "2nd");
  const oldPI = sum(loans, (l) => l.currentPI);
  const oldPITIA = sum(loans, (l) => l.pitia);
  const loansTaxes = sum(loans, (l) => l.taxes);
  const loansInsurance = sum(loans, (l) => l.insurance);
  const loansHoa = sum(loans, (l) => l.hoa);
  const loansBalance = sum(loans, (l) => l.currentBalance);

  // --- Liabilities ---
  const liabilities = sheet.liabilities ?? [];
  const liabilitiesMonthly = sum(liabilities, (l) => l.monthlyPayment);

  // --- REO ---
  const reo = sheet.reo ?? [];
  const reoCounts = {
    total: reo.length,
    primary: reo.filter((r) => r.usage === "Primary").length,
    secondHome: reo.filter((r) => r.usage === "2nd Home").length,
    rental: reo.filter((r) => r.usage === "Rental").length,
    commercial: reo.filter((r) => r.usage === "Commercial").length,
  };

  function reoMatchesAddress(addr: string): boolean {
    const n = normalizeAddress(addr);
    if (!n) return false;
    return reo.some((r) => normalizeAddress(r.address ?? "").includes(n) || n.includes(normalizeAddress(r.address ?? "")));
  }

  const subjectInReo = subjectAddress ? reoMatchesAddress(subjectAddress) : false;
  const primaryInReo = primaryAddress && !subjectIsPrimary ? reoMatchesAddress(primaryAddress) : true;

  // --- Subject property ---
  const subjectValue = subject.estimatedValue ?? "";
  const subjectBalance = subject.estCurrentMortgageBalance ?? "";

  // --- Proposed loan (scenario) ---
  const proposedLoanAmount = sheet.scenario?.proposedLoanAmount ?? "";

  return {
    subject,
    primary,
    subjectAddress,
    primaryAddress,
    subjectIsPrimary,
    subjectValue,
    subjectBalance,

    borrowers,
    borrowersJoined,
    primaryBorrower,
    borrowerPhone,
    borrowerEmail,

    incomeByBorrower,
    income1: income1 ? String(income1) : "",
    income2: income2 ? String(income2) : "",
    totalIncome,

    loans,
    firstLoan,
    secondLoan,
    firstLoanBalance: firstLoan?.currentBalance ?? "",
    secondLoanBalance: secondLoan?.currentBalance ?? "",
    oldPI: oldPI ? String(Math.round(oldPI * 100) / 100) : "",
    oldPITIA: oldPITIA ? String(Math.round(oldPITIA * 100) / 100) : "",
    loansTaxes: loansTaxes ? String(Math.round(loansTaxes * 100) / 100) : "",
    loansInsurance: loansInsurance ? String(Math.round(loansInsurance * 100) / 100) : "",
    loansHoa: loansHoa ? String(Math.round(loansHoa * 100) / 100) : "",
    loansBalance,

    liabilities,
    liabilitiesMonthly,

    reo,
    reoCounts,
    subjectInReo,
    primaryInReo,
    reoMatchesAddress,

    proposedLoanAmount,
  };
}

/** Compares two values and treats numeric equivalents as equal (e.g. "300000" vs "300000.0"). */
export function valuesDiffer(override: string | undefined | null, linked: string | undefined | null): boolean {
  const o = (override ?? "").trim();
  const l = (linked ?? "").trim();
  if (!o || !l) return false;
  if (o === l) return false;
  const on = toNumber(o);
  const ln = toNumber(l);
  if (on === 0 && ln === 0) return o.toLowerCase() !== l.toLowerCase();
  return Math.abs(on - ln) > 0.009;
}
