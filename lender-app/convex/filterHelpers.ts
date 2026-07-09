import type { Doc } from "./_generated/dataModel";
import { parseManualMinFico } from "./scenario";
import {
  flattenProgramList,
  lenderFundingMaxRaw,
  lenderFundingMinRaw,
} from "./lenderSearchText";

/** Same rules as in scenario.ts; duplicated here to avoid a circular import. */
function parseMoney(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = String(value).replace(/[,\s]/g, "");
  const m = text.match(/\$?(\d+(?:\.\d+)?)\s*(m|mm|mil|million|k|thousand)?/i);
  if (!m) return undefined;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return undefined;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix.startsWith("m") || suffix.startsWith("mil")) return num * 1_000_000;
  if (suffix === "k" || suffix === "thousand") return num * 1_000;
  return num;
}

/**
 * A single deal amount (e.g. 500_000) fits what the lender publishes for
 * min/max loan size, when at least one bound is known. Unknown bounds = lenient.
 */
export function dealFitsLender(
  l: Doc<"lenders">,
  dealAmount: number
): boolean {
  const min = parseMoney(lenderFundingMinRaw(l));
  const max = parseMoney(lenderFundingMaxRaw(l));
  if (min === undefined && max === undefined) return true;
  if (min !== undefined && dealAmount < min) return false;
  if (max !== undefined && dealAmount > max) return false;
  return true;
}

/**
 * Lender can fund a deal of at least `n` (their max is ≥ n, or max unknown).
 */
export function lenderMaxAtLeast(l: Doc<"lenders">, n: number): boolean {
  const max = parseMoney(l.fundingAmountMax);
  if (max === undefined) return true;
  return max >= n;
}

/**
 * Lender's published minimum is at most `n` (small-balance friendly) or min unknown.
 */
export function lenderMinAtMost(l: Doc<"lenders">, n: number): boolean {
  const min = parseMoney(lenderFundingMinRaw(l));
  if (min === undefined) return true;
  return min <= n;
}

function programAndListBlob(l: Doc<"lenders">): string {
  return `${l.programs ?? ""} ${flattenProgramList(l)} ${l.primaryNiche ?? ""}`.toLowerCase();
}

/**
 * All tokens must appear in programs + programList + primaryNiche.
 */
export function rowMatchesProgramKeywords(
  l: Doc<"lenders">,
  tokens: string[]
): boolean {
  if (tokens.length === 0) return true;
  const blob = programAndListBlob(l);
  return tokens.every((t) => blob.includes(t));
}

const STATE_ALIASES: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

/**
 * "FL", "fl", "Florida" all match `statesServed` text.
 */
export function stateMatchesLender(
  l: Doc<"lenders">,
  userInput: string
): boolean {
  const raw = userInput.trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  const s = l.statesServed;
  if (!s || !s.trim()) return true;
  const area = s.toLowerCase();
  if (/\bnationwide|all 50|50 states|nation wide\b/.test(area)) {
    return true;
  }
  if (raw.length === 2) {
    const code = raw.toUpperCase();
    return area.includes(code.toLowerCase());
  }
  const full = STATE_ALIASES[raw.toUpperCase().replace(/\s+/g, " ")];
  if (full) return area.includes(full.toLowerCase());
  return area.includes(lower);
}

function effectiveLenderFicoMin(l: Doc<"lenders">): number | undefined {
  const a = parseManualMinFico(l.minFico);
  if (a != null) return a === 0 ? undefined : a;
  if (!Array.isArray(l.programList)) return undefined;
  for (const p of l.programList) {
    const n = parseManualMinFico(p.minFico);
    if (n != null && n > 0) return n;
  }
  return undefined;
}

/**
 * Borrower with `borrowerFico` clears the lender's stated FICO floor (or unknown).
 */
export function borrowerFicoClearedLender(
  l: Doc<"lenders">,
  borrowerFico: number
): boolean {
  const m = effectiveLenderFicoMin(l);
  if (m == null) return true;
  return borrowerFico >= m;
}

export function rowMatchesPropertyType(
  l: Doc<"lenders">,
  needle: string
): boolean {
  const t = needle.trim().toLowerCase();
  if (!t) return true;
  return `${l.propertyTypes ?? ""} ${l.primaryNiche ?? ""} ${l.programs ?? ""}`
    .toLowerCase()
    .includes(t);
}

export function rowMatchesOwnerInvestor(
  l: Doc<"lenders">,
  value: string
): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return (l.ownerOrInvestor ?? "").toLowerCase().includes(v);
}
