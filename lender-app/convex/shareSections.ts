/**
 * Maps each shareable section to the top-level keys it is allowed to write
 * back onto the intake document, plus a human-readable label.
 *
 * Shared between server (mutation validation) and client (UI selectors).
 */

export const SECTION_KEYS = {
  cover: ["cover", "dealType"],
  scenario: ["scenario"],
  overview: [
    "leadId",
    "fileName",
    "sourceType",
    "fundingType",
    "accountExecutive",
    "ownerName",
    "startDate",
    "fundedDate",
    "occupancy",
    "occupancyOther",
    "propertiesOwned",
    "citizenship",
    "defaultJudgments",
    "bkHistory",
    "bkDate",
    "latePaymentsLast12",
  ],
  borrowers: ["borrowers"],
  guarantors: ["guarantors"],
  business: ["business"],
  property: [
    "subjectProperty",
    "primaryProperty",
    "occupancy",
    "occupancyOther",
    "propertiesOwned",
  ],
  commercial: ["commercial"],
  hardmoney: ["hardMoney"],
  loans: ["loans"],
  income: ["incomeRows"],
  assets: ["assets", "liabilities"],
  household: ["dependentsCount", "dependentsAges"],
  workflow: ["workflow"],
  notes: ["primaryObjective", "additionalNotes"],
  dti: ["dti", "dtiInstances"],
  reo: ["reo"],
  trackRecord: ["trackRecord", "trackRecordMeta"],
  comparison: ["comparison", "comparisonInstances"],
  weighted: ["weightedInterest", "weightedInterestInstances", "businessDebtMeta"],
  payoff: ["payoff", "payoffInstances"],
  daycounter: ["dayCounter", "dayCounterInstances"],
  fees: ["fees"],
} as const satisfies Record<string, readonly string[]>;

export type ShareSectionId = keyof typeof SECTION_KEYS;

export const SECTION_LABELS: Record<ShareSectionId, string> = {
  cover: "Cover",
  scenario: "Scenario",
  overview: "Overview",
  borrowers: "Borrowers",
  guarantors: "Guarantors",
  business: "Business / Entity",
  property: "Property",
  commercial: "Commercial / DSCR",
  hardmoney: "Hard Money",
  loans: "Loans",
  income: "Income",
  assets: "Assets & Liabilities",
  household: "Household",
  workflow: "Workflow",
  notes: "Notes",
  dti: "DTI",
  reo: "Schedule of REO",
  trackRecord: "Track Record",
  comparison: "Comparison",
  weighted: "Weighted Interest",
  payoff: "Payoff Calculator",
  daycounter: "Day Counter",
  fees: "Fees & Closing",
};

export const SECTION_DESCRIPTIONS: Record<ShareSectionId, string> = {
  cover: "Loan completion coversheet — the file summary and deal type.",
  scenario: "Deal snapshot used for quick pricing and overview.",
  overview: "Pipeline details like lead ID, source, and dates.",
  borrowers: "Borrower identity, contact, and employment information.",
  guarantors: "Guarantors and sponsors (PG, liquidity, net worth).",
  business: "Business entity, financials, and funding request.",
  property: "Subject and primary property information.",
  commercial: "Commercial property class, rent roll, and DSCR math.",
  hardmoney: "Purchase, rehab, ARV, and exit strategy for bridge / flip loans.",
  loans: "Existing / current liens on the subject property.",
  income: "Monthly income by borrower.",
  assets: "Assets and liabilities schedule.",
  household: "Household & dependents.",
  workflow: "Internal workflow checklist.",
  notes: "Primary objective and additional notes.",
  dti: "Debt-to-income calculator.",
  reo: "Schedule of Real Estate Owned.",
  trackRecord: "Investment property track record (rehab / new construction).",
  comparison: "Current vs proposed loan comparison.",
  weighted: "Weighted interest / debt blend.",
  payoff: "Payoff calculator with extra-payment scenarios.",
  daycounter: "Date math utility.",
  fees: "Broker, lender, third-party fees and prepaids.",
};

export function isShareSection(s: string): s is ShareSectionId {
  return Object.prototype.hasOwnProperty.call(SECTION_KEYS, s);
}
