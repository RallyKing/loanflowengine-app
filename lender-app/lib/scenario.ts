/**
 * Scenario matching: types + constants shared between the browser form and
 * the Convex scoring query.
 */

export interface Scenario {
  /** Amount of funding the borrower is seeking, in dollars. */
  fundingAmount?: number;
  /** Funding / product type (e.g. "SBA Loan", "Bridge", "DSCR"). */
  fundingType?: string;
  /** Property type for real-estate scenarios ("Multifamily", "SFR", etc.). */
  propertyType?: string;
  /** Two-letter state code (e.g. "FL") where the borrower or property is located. */
  state?: string;
  /** Nature of the transaction (Purchase, Refi, Cash-Out, Working Capital, etc.). */
  transactionType?: string;
  /** Minimum borrower FICO score. */
  ficoScore?: number;
  /** Annual gross revenue for business-purpose loans, in dollars. */
  annualRevenue?: number;
  /** Months in business (for working capital / SBA qualifications). */
  timeInBusinessMonths?: number;
  /** Desired LTV as a percent (e.g. 75 = 75% LTV). */
  ltv?: number;
  /** Whether the property is owner-occupied, investor, or either. */
  ownerOccupied?: "Owner" | "Investor" | "Either";
  /** Preferred lender entity type (Bank, Private, SBA, Hard Money, ...). */
  entityTypePreference?: string;
  /** Borrower industry (used to check lender exclusions). */
  industry?: string;
  /** Free-text for anything the dropdowns don't cover. */
  freeText?: string;
}

/** Common funding / product options shown in the dropdown. */
export const FUNDING_TYPE_OPTIONS: Array<{
  label: string;
  /** Keywords used for matching against lender programs/niche/notes. */
  keywords: string[];
}> = [
  { label: "SBA 7(a) / 504", keywords: ["sba", "7(a)", "504", "usda"] },
  {
    label: "Conventional Term Loan",
    keywords: ["term loan", "term & loc", "business loan", "conventional"],
  },
  {
    label: "Line of Credit",
    keywords: ["line of credit", "loc", "revolving", "loc"],
  },
  {
    label: "Working Capital",
    keywords: ["working capital", "wc", "cash advance", "operating"],
  },
  {
    label: "Equipment Financing",
    keywords: ["equipment", "leasing", "machinery"],
  },
  {
    label: "Factoring / A/R Financing",
    keywords: ["factor", "factoring", "a/r", "accounts receivable", "invoice"],
  },
  {
    label: "MCA (Merchant Cash Advance)",
    keywords: ["mca", "merchant cash", "credit card receivable", "rcv advance"],
  },
  {
    label: "Franchise Finance",
    keywords: ["franchise"],
  },
  {
    label: "DSCR (Investment Property)",
    keywords: ["dscr", "rental", "investment property", "debt service coverage"],
  },
  {
    label: "Fix & Flip",
    keywords: ["fix & flip", "fix and flip", "flip", "rehab"],
  },
  {
    label: "Ground-Up Construction",
    keywords: ["ground up", "ground-up", "construction", "new construction"],
  },
  {
    label: "Bridge Loan",
    keywords: ["bridge", "short term", "short-term bridge"],
  },
  {
    label: "Hard Money",
    keywords: ["hard money", "private money", "asset based"],
  },
  {
    label: "Commercial Real Estate (Permanent)",
    keywords: ["commercial", "cre", "permanent", "cmbs", "perm"],
  },
  {
    label: "Multifamily / Agency",
    keywords: ["multifamily", "multi-family", "fannie", "freddie", "agency", "fha", "hud"],
  },
  {
    label: "Non-QM Residential",
    keywords: ["non-qm", "non qm", "nonqm", "niva", "alt-a"],
  },
  {
    label: "Church Lending",
    keywords: ["church", "ministry", "christian"],
  },
  {
    label: "Farm / Agricultural",
    keywords: ["farm", "agricultural", "ag ", "usda", "land loan"],
  },
  {
    label: "Debt Consolidation",
    keywords: ["consolidation", "mca payoff", "debt restructuring", "refinance debt"],
  },
  {
    label: "Land Loan",
    keywords: ["land", "raw land", "unimproved"],
  },
];

/** Shared property type options used for the dropdown and for matching. */
export const PROPERTY_TYPE_OPTIONS: Array<{
  label: string;
  keywords: string[];
}> = [
  { label: "Single-Family (SFR)", keywords: ["sfr", "single family", "single-family", "1-4"] },
  { label: "2-4 Unit Residential", keywords: ["2-4", "duplex", "triplex", "fourplex", "1-4 unit"] },
  { label: "Multifamily (5+ units)", keywords: ["multifamily", "multi-family", "apartment", "5+"] },
  { label: "Mixed-Use", keywords: ["mixed use", "mixed-use"] },
  { label: "Retail / Strip Center", keywords: ["retail", "strip center", "shopping"] },
  { label: "Office", keywords: ["office"] },
  { label: "Industrial / Warehouse", keywords: ["industrial", "warehouse", "flex"] },
  { label: "Hospitality (Hotel/Motel)", keywords: ["hotel", "motel", "hospitality"] },
  { label: "Self-Storage", keywords: ["self storage", "self-storage", "storage"] },
  { label: "Mobile Home Park", keywords: ["mobile home", "manufactured", "mhp"] },
  { label: "Healthcare / Senior Living", keywords: ["healthcare", "senior", "assisted living", "nursing"] },
  { label: "Church / Religious", keywords: ["church", "ministry", "religious"] },
  { label: "Farm / Agricultural Land", keywords: ["farm", "agricultural", "ranch"] },
  { label: "Raw Land", keywords: ["raw land", "land loan", "unimproved"] },
  { label: "Business (No Real Estate)", keywords: ["business", "wc", "equipment"] },
];

export const TRANSACTION_TYPE_OPTIONS = [
  "Purchase",
  "Refinance (Rate/Term)",
  "Cash-Out Refinance",
  "Construction",
  "Acquisition",
  "Working Capital",
  "Debt Consolidation",
  "Equipment Purchase",
  "Other",
] as const;

export const ENTITY_TYPE_PREFERENCE_OPTIONS = [
  "No preference",
  "Bank / Commercial Lender",
  "Credit Union",
  "SBA / USDA Lender",
  "Hard Money / Bridge Lender",
  "Private / Hedge Fund",
  "Factoring / A/R",
  "Multifamily / Agency Lender",
  "Merchant / MCA / CC Financing",
  "Equipment / Leasing",
  "Broker / Correspondent",
] as const;

/** Full list of US state postal codes for the state dropdown. */
export const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const STATE_NAME_TO_CODE: Record<string, string> = US_STATES.reduce(
  (acc, s) => {
    acc[s.name.toLowerCase()] = s.code;
    return acc;
  },
  {} as Record<string, string>
);

/** Parse a loan-amount cell ("$1M", "$250,000", "$250k") into a number of dollars. */
export function parseMoney(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  // First $ number in the string.
  const text = String(value).replace(/[,\s]/g, "");
  const re = /\$?(\d+(?:\.\d+)?)\s*(m|mm|mil|million|k|thousand)?/i;
  const m = text.match(re);
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return undefined;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix.startsWith("m") || suffix.startsWith("mil")) return num * 1_000_000;
  if (suffix === "k" || suffix === "thousand") return num * 1_000;
  // Bare numbers under 1000 are ambiguous; assume they were already in dollars
  // unless they're obviously truncated small numbers.
  return num;
}

/** Does the lender serve the given two-letter state code? */
export type StateMatch = "yes" | "no" | "unknown";

export function stateMatches(stateServedField: string, code: string): StateMatch {
  if (!stateServedField) return "unknown";
  if (!code) return "unknown";
  const upper = code.toUpperCase();
  const text = stateServedField;
  const lower = text.toLowerCase();
  const nationwidePatterns = [
    "all 50",
    "all states",
    "all 48",
    "nationwide",
    "all us",
    "all u.s",
    "entire us",
    "anywhere in the us",
    "united states",
    "continental us",
    "all continental",
  ];
  const nationwide = nationwidePatterns.some((p) => lower.includes(p));

  // Pull out an "EXCEPT" / "excluding" / "not in" / "no states" list if any.
  const exceptMatch =
    /(?:except|excluding|excl\.?|not in|no states?|no (?:state|service))[:\s-]+([\s\S]{1,220})/i.exec(
      text
    );
  const exceptList = exceptMatch ? exceptMatch[1] : "";
  if (exceptList && listContainsState(exceptList, upper)) return "no";

  if (nationwide && !(exceptList && listContainsState(exceptList, upper))) {
    return "yes";
  }
  if (nationwide === false && exceptList) {
    // Text mentions exclusions but no nationwide qualifier -> treat the rest
    // as allow-list prior to the except.
    const allowPortion = text.slice(0, exceptMatch!.index);
    if (listContainsState(allowPortion, upper)) return "yes";
  }
  if (listContainsState(text, upper)) return "yes";
  return "unknown";
}

function listContainsState(blob: string, upperCode: string): boolean {
  const upperBlob = blob.toUpperCase();
  // Postal code as a whole word.
  const re = new RegExp(`\\b${upperCode}\\b`);
  if (re.test(upperBlob)) return true;
  // Check full state name.
  for (const s of US_STATES) {
    if (s.code === upperCode) {
      if (upperBlob.includes(s.name.toUpperCase())) return true;
    }
  }
  // Two-word state names that might be in the blob.
  const lower = blob.toLowerCase();
  const name = US_STATES.find((s) => s.code === upperCode)?.name.toLowerCase();
  if (name && lower.includes(name)) return true;
  const codeByName = STATE_NAME_TO_CODE[name ?? ""];
  void codeByName;
  return false;
}

export function normalizeWhitespace(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Extract a FICO minimum from a blob of lender notes. Handles many phrasings
 * found in the dataset (kept in sync with `convex/scenario.ts`).
 * Returns 0 when the notes explicitly say "no minimum FICO" / "no credit".
 */
export function extractMinFico(blob: string): number | undefined {
  if (!blob) return undefined;
  const text = blob.toLowerCase();

  if (/no\s+(?:min(?:imum)?\s+)?(?:fico|credit)/.test(text)) return 0;
  if (/minimum\s*fico\s*:\s*none/.test(text)) return 0;

  const patterns: RegExp[] = [
    /min(?:imum)?\s+fico[^\d]{0,15}(\d{3})/,
    /fico\s*(?:score)?\s*min(?:imum)?[^\d]{0,15}(\d{3})/,
    /min(?:imum)?\s+credit\s*(?:score)?[^\d]{0,15}(\d{3})/,
    /credit\s*score\s*min(?:imum)?[^\d]{0,15}(\d{3})/,
    /fico\s*(?:of|=|:|>=|>|at least|of at least)?[^\d]{0,15}(\d{3})/,
    /credit\s*(?:score|:|>=|>|of)[^\d]{0,15}(\d{3})/,
    /(\d{3})\s*\+?\s*(?:fico|credit\s*score|credit)/,
    /(?:over|above)\s+(\d{3})\s*(?:fico|credit|score)/,
    /personal\s+credit\s*:?\s*(\d{3})/,
    /(\d{3})\s*\+?\s*score/,
  ];
  let best: number | undefined;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 400 && n <= 900) {
        if (best === undefined || n > best) best = n;
      }
    }
  }
  return best;
}
