import { type QueryCtx, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  buildLenderSearchBlob,
  lenderFundingMaxRaw,
  lenderFundingMinRaw,
} from "./lenderSearchText";

/* -------------------------------------------------------------------------- */
/* Shared parsing helpers (kept in sync with lib/scenario.ts on the client)   */
/* -------------------------------------------------------------------------- */

const US_STATES = [
  ["AL", "alabama"], ["AK", "alaska"], ["AZ", "arizona"], ["AR", "arkansas"],
  ["CA", "california"], ["CO", "colorado"], ["CT", "connecticut"], ["DE", "delaware"],
  ["DC", "district of columbia"], ["FL", "florida"], ["GA", "georgia"], ["HI", "hawaii"],
  ["ID", "idaho"], ["IL", "illinois"], ["IN", "indiana"], ["IA", "iowa"],
  ["KS", "kansas"], ["KY", "kentucky"], ["LA", "louisiana"], ["ME", "maine"],
  ["MD", "maryland"], ["MA", "massachusetts"], ["MI", "michigan"], ["MN", "minnesota"],
  ["MS", "mississippi"], ["MO", "missouri"], ["MT", "montana"], ["NE", "nebraska"],
  ["NV", "nevada"], ["NH", "new hampshire"], ["NJ", "new jersey"], ["NM", "new mexico"],
  ["NY", "new york"], ["NC", "north carolina"], ["ND", "north dakota"], ["OH", "ohio"],
  ["OK", "oklahoma"], ["OR", "oregon"], ["PA", "pennsylvania"], ["RI", "rhode island"],
  ["SC", "south carolina"], ["SD", "south dakota"], ["TN", "tennessee"], ["TX", "texas"],
  ["UT", "utah"], ["VT", "vermont"], ["VA", "virginia"], ["WA", "washington"],
  ["WV", "west virginia"], ["WI", "wisconsin"], ["WY", "wyoming"],
] as const;

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
 * Extract an explicit minimum FICO from a blob of lender notes. Handles many
 * phrasings found in the dataset:
 *   "min fico 680", "minimum fico: 680", "fico min 680", "fico score min: 625"
 *   "680 min fico", "680 fico", "680+ credit", "credit score 650", "650 credit"
 *   "fico of 680", "fico >= 680", "fico >700", "over 650 credit"
 *   "personal credit: 700+", "700+ fico"
 */
/**
 * Parses the broker-entered `minFico` override on a lender record.
 *   - "" / undefined  -> undefined (use auto-detection)
 *   - "0" / "none"    -> 0 (confirmed: no minimum)
 *   - "680"           -> 680
 *   - any non-numeric garbage -> undefined (fail safe)
 */
export function parseManualMinFico(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const t = String(raw).trim().toLowerCase();
  if (!t) return undefined;
  if (t === "none" || t === "no min" || t === "no minimum" || t === "n/a") return 0;
  const m = t.match(/\d{3}/);
  if (!m) return undefined;
  const n = parseInt(m[0], 10);
  if (Number.isNaN(n)) return undefined;
  if (n < 300 || n > 900) return undefined;
  return n;
}

export function extractMinFico(blob: string): number | undefined {
  if (!blob) return undefined;
  const text = blob.toLowerCase();

  // Candidates in priority order - each returns the captured 3-digit number.
  const patterns: RegExp[] = [
    // explicit "min" / "minimum" wording
    /min(?:imum)?\s+fico[^\d]{0,15}(\d{3})/,
    /fico\s*(?:score)?\s*min(?:imum)?[^\d]{0,15}(\d{3})/,
    /min(?:imum)?\s+credit\s*(?:score)?[^\d]{0,15}(\d{3})/,
    /credit\s*score\s*min(?:imum)?[^\d]{0,15}(\d{3})/,
    // "fico of X" / "fico: X" / "fico >= X"
    /fico\s*(?:of|=|:|>=|>|at least|of at least)?[^\d]{0,15}(\d{3})/,
    // "credit score of X" / "credit: X"
    /credit\s*(?:score|:|>=|>|of)[^\d]{0,15}(\d{3})/,
    // "X FICO", "X+ FICO", "X credit", "X+ credit"
    /(\d{3})\s*\+?\s*(?:fico|credit\s*score|credit)/,
    // "over X FICO", "above X credit"
    /(?:over|above)\s+(\d{3})\s*(?:fico|credit|score)/,
    // "personal credit: X+"
    /personal\s+credit\s*:?\s*(\d{3})/,
    // "X+ score"
    /(\d{3})\s*\+?\s*score/,
  ];

  let best: number | undefined;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 400 && n <= 900) {
        // Take the strictest (highest) credible minimum we find - this is safer
        // than grabbing the first one, since notes sometimes say "min 600 / 680
        // preferred".
        if (best === undefined || n > best) best = n;
      }
    }
  }

  // Explicit "no FICO / no credit / no minimum credit" wording
  if (/no\s+(?:min(?:imum)?\s+)?(?:fico|credit)/.test(text)) {
    // If they explicitly say no minimum, ignore any number we matched.
    return 0;
  }
  if (/minimum\s*fico\s*:\s*none/.test(text)) return 0;

  return best;
}

/**
 * When a lender's notes don't state a FICO minimum, infer one from the entity
 * type OR the company name. These defaults reflect what underwriters actually
 * require in the real world for each category, regardless of whether the
 * lender wrote it down.
 *
 * Returns undefined for categories where FICO is genuinely flexible or not the
 * primary qualifier (collateral-based, factoring, MCA, etc.) - we do NOT want
 * to kill otherwise-great matches for those.
 *
 * `companyName` is used as a fallback because the dataset contains records
 * where the Entity Type column says generic things like "Direct" or
 * "Commercial Finance" but the company is actually a bank (e.g. "AXOS Bank"
 * listed as "Direct", "Wells Fargo" listed as "Commercial Finance").
 */
function typeBasedMinFico(
  entityType: string,
  companyName: string = ""
): number | undefined {
  const t = (entityType ?? "").toLowerCase();
  const name = (companyName ?? "").toLowerCase();

  // Flexible / collateral-based - checked FIRST so they override name inference
  // (a "Hard Money" lender whose company name happens to contain "bank" still
  // shouldn't get a bank-level floor).
  if (t.includes("hard money") || t.includes("bridge")) return undefined;
  if (t.includes("private") || t.includes("hedge")) return undefined;
  if (t.includes("factoring") || t.includes("a/r")) return undefined;
  if (t.includes("merchant") || t.includes("mca") || t.includes("cc financ"))
    return undefined;
  if (t.includes("equipment") || t.includes("leasing")) return undefined;
  if (t.includes("auction") || t.includes("asset disposition")) return undefined;

  // High-FICO-required categories (underwriting-heavy, banks, agency, etc.)
  if (t.includes("sba") || t.includes("usda")) return 660;
  if (t.includes("bank") && !t.includes("investment bank")) return 650;
  if (t.includes("credit union")) return 640;
  if (t.includes("cmbs") || t.includes("conduit")) return 660;
  if (t.includes("life company") || t.includes("life co")) return 680;
  if (t.includes("multifamily") || t.includes("agency")) return 660;
  if (t.includes("franchise")) return 660;
  if (t.includes("church")) return 650;
  if (t.includes("farm") || t.includes("agricultural")) return 650;
  if (t.includes("non-qm") || t.includes("non qm")) return 620;
  if (t.includes("securities") || t.includes("ira lender")) return 650;

  // Name-based fallback - catches banks and SBA lenders mis-categorized as
  // generic "Direct" / "Commercial Finance".
  //   Use word boundaries to avoid false positives like "burbank".
  if (/\bbank\b/.test(name)) return 650;
  if (/\bcredit union\b/.test(name)) return 640;
  if (/\bsba\b/.test(name)) return 660;
  if (/\bfannie\b|\bfreddie\b|\bagency\b|\bmultifamily\b/.test(name))
    return 660;
  if (/\blife (insurance|co)\b/.test(name)) return 680;

  // Generic "Commercial Finance" / "Direct" is too broad to infer - leave it
  // undefined. We'd rather show a few extra maybes than hide a real match.
  return undefined;
}

/**
 * Entity types that are NOT actually lenders - they should never appear in
 * scenario-match results.
 */
function isNonLenderEntity(entityType: string): boolean {
  if (!entityType) return false;
  const t = entityType.toLowerCase();

  // Split by semicolons and check - if ANY of the listed types is a lender,
  // keep the record.
  const parts = entityType.split(/[;,]/).map((s) => s.trim().toLowerCase());
  const hasLenderType = parts.some((p) => {
    if (!p) return false;
    if (p.includes("law firm")) return false;
    if (p.includes("consulting") || p.includes("advisory")) return false;
    if (p.includes("cost seg")) return false;
    if (p.includes("tax service")) return false;
    if (p.includes("restructuring") || p.includes("turnaround")) return false;
    if (p.includes("auction") || p.includes("asset disposition")) return false;
    if (p.includes("broker") || p.includes("correspondent")) return false;
    if (p.includes("re investor")) return false;
    return true; // It's something lender-ish
  });
  return !hasLenderType || t === "";
}

type StateMatch = "yes" | "no" | "unknown";

function stateMatches(stateServed: string, upperCode: string): StateMatch {
  if (!stateServed || !upperCode) return "unknown";
  const text = stateServed;
  const lower = text.toLowerCase();
  const upper = upperCode.toUpperCase();
  const nationwide =
    lower.includes("all 50") ||
    lower.includes("all states") ||
    lower.includes("all 48") ||
    lower.includes("nationwide") ||
    lower.includes("anywhere in the us") ||
    lower.includes("united states") ||
    lower.includes("continental us") ||
    lower.includes("all continental") ||
    /^\s*all\s*$/i.test(text);

  const exceptMatch =
    /(?:except|excluding|excl\.?|not in|no states?|no (?:state|service))[:\s-]+([\s\S]{1,220})/i.exec(
      text
    );
  const exceptList = exceptMatch ? exceptMatch[1] : "";
  if (exceptList && listContainsState(exceptList, upper)) return "no";
  if (nationwide) return "yes";
  if (exceptMatch) {
    const allow = text.slice(0, exceptMatch.index);
    if (listContainsState(allow, upper)) return "yes";
  }
  if (listContainsState(text, upper)) return "yes";
  return "unknown";
}

function listContainsState(blob: string, upperCode: string): boolean {
  const upperBlob = blob.toUpperCase();
  const re = new RegExp(`\\b${upperCode}\\b`);
  if (re.test(upperBlob)) return true;
  const name = US_STATES.find(([c]) => c === upperCode)?.[1];
  if (name && blob.toLowerCase().includes(name)) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

interface ScoreInput {
  fundingAmount?: number;
  fundingTypeLabel?: string;
  fundingTypeKeywords?: string[];
  propertyTypeLabel?: string;
  propertyTypeKeywords?: string[];
  state?: string;
  transactionType?: string;
  ficoScore?: number;
  annualRevenue?: number;
  timeInBusinessMonths?: number;
  ltv?: number;
  ownerOccupied?: string;
  entityTypePreference?: string;
  industry?: string;
  freeText?: string;
}

interface ScoredLender {
  lender: Doc<"lenders">;
  score: number;
  reasons: string[];
  concerns: string[];
  matchedProgram?: {
    name: string;
    minFico?: string;
    requirements?: string;
  } | null;
}

type FilterReason =
  | "not-a-lender"
  | "loan-amount-below-min"
  | "loan-amount-above-max"
  | "state-excluded"
  | "fico-below-min"
  | "industry-excluded"
  | "funding-type-incompatible"
  | "no-criteria"
  | "zero-signal";

function scoreLender(
  l: Doc<"lenders">,
  s: ScoreInput
): { result: ScoredLender | null; filterReason?: FilterReason } {
  const reasons: string[] = [];
  const concerns: string[] = [];

  // --- Hard filter: non-lender entity types ---
  if (isNonLenderEntity(l.entityType)) {
    return { result: null, filterReason: "not-a-lender" };
  }

  // Keyword / free-text blob (same field set as Browse search — see `buildLenderSearchBlob`)
  const haystack = buildLenderSearchBlob(l);

  let score = 0;
  let hadCriterion = false;

  /* --- Funding amount --- */
  if (typeof s.fundingAmount === "number" && s.fundingAmount > 0) {
    hadCriterion = true;
    const min = parseMoney(l.fundingAmountMin);
    const max = parseMoney(l.fundingAmountMax);
    if (min === undefined && max === undefined) {
      // No range data - neutral
      score += 2;
    } else {
      const okMin = min === undefined || s.fundingAmount >= min;
      const okMax = max === undefined || s.fundingAmount <= max;
      if (okMin && okMax) {
        score += 30;
        const range = `${min ? money(min) : "no min"} – ${
          max ? money(max) : "no max"
        }`;
        reasons.push(`Your $${money(s.fundingAmount)} fits their ${range} range`);
      } else if (!okMin && min !== undefined) {
        return { result: null, filterReason: "loan-amount-below-min" };
      } else if (!okMax && max !== undefined) {
        return { result: null, filterReason: "loan-amount-above-max" };
      }
    }
  }

  /* --- Funding type (product) ---
     HARD FILTER: if the broker explicitly picked a funding type, only include
     lenders whose programs / niche / notes / entity type contain at least one
     confirmed keyword for that product. If there is no evidence in the data
     that they do this funding type, they are dropped entirely - the broker does
     not want "maybe" matches cluttering the results.

     Also try to match against the STRUCTURED programList so we can surface
     the matched program name to the broker, and later use that program's
     per-program minFico instead of the lender-wide minimum.
  */
  let matchedProgram: {
    name: string;
    minFico?: string;
    requirements?: string;
  } | null = null;

  if (s.fundingTypeKeywords && s.fundingTypeKeywords.length > 0) {
    hadCriterion = true;
    const lowerKeywords = s.fundingTypeKeywords.map((k) => k.toLowerCase());

    // First try structured list.
    const pl = Array.isArray(l.programList) ? l.programList : [];
    for (const p of pl) {
      const blob = `${p.name ?? ""} ${p.requirements ?? ""}`.toLowerCase();
      if (lowerKeywords.some((k) => blob.includes(k))) {
        matchedProgram = p;
        break;
      }
    }

    const hits = lowerKeywords.filter((k) => haystack.includes(k));

    if (matchedProgram || hits.length > 0) {
      score += Math.min(30, 10 + Math.max(hits.length, 1) * 6);
      if (matchedProgram) {
        reasons.push(
          `Offers ${s.fundingTypeLabel ?? "this"} - program: "${matchedProgram.name}"`
        );
      } else {
        reasons.push(
          `Offers ${s.fundingTypeLabel ?? "this"} (matched: ${hits
            .slice(0, 3)
            .join(", ")})`
        );
      }
    } else {
      return { result: null, filterReason: "funding-type-incompatible" };
    }
  }

  /* --- Property type --- */
  if (s.propertyTypeKeywords && s.propertyTypeKeywords.length > 0) {
    hadCriterion = true;
    const hits = s.propertyTypeKeywords.filter((k) =>
      haystack.includes(k.toLowerCase())
    );
    if (hits.length > 0) {
      score += 15;
      reasons.push(`Handles ${s.propertyTypeLabel ?? "this property type"}`);
    } else {
      score -= 2;
    }
  }

  /* --- State --- */
  if (s.state) {
    hadCriterion = true;
    const match = stateMatches(l.statesServed, s.state);
    if (match === "yes") {
      score += 18;
      reasons.push(`Lends in ${s.state}`);
    } else if (match === "no") {
      return { result: null, filterReason: "state-excluded" };
    } else {
      // Unknown coverage - small penalty, not a filter
      score -= 1;
    }
  }

  /* --- FICO ---
     Hard filter: if borrower FICO is below the effective minimum FICO
     (explicitly stated OR inferred from the lender's entity type), drop the
     lender entirely.
  */
  if (typeof s.ficoScore === "number" && s.ficoScore > 0) {
    hadCriterion = true;

    // Priority order:
    //   1. Matched program's per-program minFico (most specific)
    //   2. Lender-wide manual `minFico` override
    //   3. FICO explicitly stated in notes/programs (regex-extracted)
    //   4. Type-based inference (or name-based fallback)
    const programMin = parseManualMinFico(matchedProgram?.minFico);
    const manualMin = parseManualMinFico(l.minFico);
    const statedMin = extractMinFico(haystack);
    const typeMin = typeBasedMinFico(l.entityType, l.company);

    let effectiveMin: number | undefined;
    let minSource: "program" | "manual" | "stated" | "inferred" | null = null;
    if (programMin !== undefined) {
      effectiveMin = programMin;
      minSource = "program";
    } else if (manualMin !== undefined) {
      effectiveMin = manualMin;
      minSource = "manual";
    } else if (statedMin !== undefined) {
      effectiveMin = statedMin;
      minSource = "stated";
    } else if (typeMin !== undefined) {
      effectiveMin = typeMin;
      minSource = "inferred";
    }

    if (effectiveMin !== undefined && effectiveMin > 0) {
      if (s.ficoScore >= effectiveMin) {
        score += 10;
        if (minSource === "program") {
          reasons.push(
            `FICO ${s.ficoScore} clears the ${effectiveMin} min for "${matchedProgram?.name}"`
          );
        } else if (minSource === "manual") {
          reasons.push(
            `FICO ${s.ficoScore} clears their confirmed ${effectiveMin} min`
          );
        } else if (minSource === "stated") {
          reasons.push(
            `FICO ${s.ficoScore} clears their stated ${effectiveMin} min`
          );
        } else {
          reasons.push(
            `FICO ${s.ficoScore} likely qualifies (${l.entityType} typically need ${effectiveMin}+)`
          );
        }
      } else {
        return { result: null, filterReason: "fico-below-min" };
      }
    } else {
      score += 3;
      if (programMin === 0) {
        reasons.push(
          `No FICO minimum for "${matchedProgram?.name}" (confirmed)`
        );
      } else if (manualMin === 0) {
        reasons.push("No FICO minimum (confirmed)");
      } else if (statedMin === 0) {
        reasons.push("No stated FICO minimum");
      }
    }
  }

  /* --- Entity type preference --- */
  if (
    s.entityTypePreference &&
    s.entityTypePreference !== "No preference" &&
    l.entityType
  ) {
    hadCriterion = true;
    const first = s.entityTypePreference.toLowerCase().split(/[\s/]+/)[0];
    if (l.entityType.toLowerCase().includes(first)) {
      score += 10;
      reasons.push(`Matches preferred type: ${l.entityType}`);
    }
  }

  /* --- Transaction type --- */
  if (s.transactionType && s.transactionType !== "Other") {
    hadCriterion = true;
    if (haystack.includes(s.transactionType.toLowerCase().split(" ")[0])) {
      score += 5;
      reasons.push(`Supports ${s.transactionType}`);
    }
  }

  /* --- Owner vs Investor --- */
  if (s.ownerOccupied && s.ownerOccupied !== "Either" && l.ownerOrInvestor) {
    hadCriterion = true;
    const want = s.ownerOccupied.toLowerCase();
    const has = l.ownerOrInvestor.toLowerCase();
    if (has.includes(want) || has.includes("either") || has.includes("both")) {
      score += 6;
    } else if (has && !has.includes(want)) {
      concerns.push(`Only handles ${l.ownerOrInvestor}`);
      score -= 10;
    }
  }

  /* --- Industry exclusion check --- */
  if (s.industry) {
    hadCriterion = true;
    const ind = s.industry.toLowerCase();
    if (l.exclusions && l.exclusions.toLowerCase().includes(ind)) {
      return { result: null, filterReason: "industry-excluded" };
    }
  }

  /* --- Free-text bonus --- */
  if (s.freeText) {
    const tokens = s.freeText
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    const unique = Array.from(new Set(tokens));
    const hits = unique.filter((t) => haystack.includes(t));
    if (hits.length > 0) {
      const bonus = Math.min(15, hits.length * 3);
      score += bonus;
      if (hits.length >= 2) {
        reasons.push(`Matches "${hits.slice(0, 3).join(", ")}"`);
      }
    }
  }

  /* --- Broker rating boost ---
     Lenders the broker has explicitly rated get a priority boost so their
     trusted partners surface at the top. Each star is worth ~10 points so a
     perfect 5-star lender gets +50 - meaningful, but still below hard-criteria
     matches like a confirmed loan-amount fit (+30) + FICO clear (+10) +
     program match (+15). Concerns and hard filters still apply first.
  */
  const rating = typeof l.rating === "number" ? l.rating : 0;
  if (rating > 0) {
    const boost = Math.max(0, Math.min(5, Math.round(rating))) * 10;
    score += boost;
    reasons.unshift(
      `${"\u2605".repeat(Math.round(rating))} Your ${Math.round(rating)}-star lender`
    );
  }

  if (!hadCriterion) return { result: null, filterReason: "no-criteria" };

  if (score <= 0 && reasons.length === 0)
    return { result: null, filterReason: "zero-signal" };

  return {
    result: { lender: l, score, reasons, concerns, matchedProgram },
  };
}

function money(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${m}M` : m.toFixed(1) + "M";
  }
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

/**
 * Prefer an FTS slice over `lenders` when a funding type requires keyword matches.
 * If the index is empty (no `searchText` on rows) or the query returns 0 rows,
 * fall back to a full read so results stay complete.
 */
async function loadLendersForScenario(
  ctx: QueryCtx,
  args: { fundingTypeKeywords?: string[] }
) {
  const kws = args.fundingTypeKeywords?.filter((k) => k.trim().length > 0) ?? [];
  if (kws.length > 0) {
    const first = kws[0]!.trim();
    if (first.length > 0) {
      const narrowed = await ctx.db
        .query("lenders")
        .withSearchIndex("lender_scenario", (q) => q.search("searchText", first))
        .collect();
      if (narrowed.length > 0) {
        return { lenders: narrowed, usedSearchNarrow: true as const };
      }
    }
  }
  return {
    lenders: await ctx.db.query("lenders").collect(),
    usedSearchNarrow: false as const,
  };
}

/* -------------------------------------------------------------------------- */
/* Public query                                                                */
/* -------------------------------------------------------------------------- */

export const matchScenario = query({
  args: {
    fundingAmount: v.optional(v.number()),
    fundingTypeLabel: v.optional(v.string()),
    fundingTypeKeywords: v.optional(v.array(v.string())),
    propertyTypeLabel: v.optional(v.string()),
    propertyTypeKeywords: v.optional(v.array(v.string())),
    state: v.optional(v.string()),
    transactionType: v.optional(v.string()),
    ficoScore: v.optional(v.number()),
    annualRevenue: v.optional(v.number()),
    timeInBusinessMonths: v.optional(v.number()),
    ltv: v.optional(v.number()),
    ownerOccupied: v.optional(v.string()),
    entityTypePreference: v.optional(v.string()),
    industry: v.optional(v.string()),
    freeText: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit ?? 30, 100);
    const { lenders, usedSearchNarrow } = await loadLendersForScenario(
      ctx,
      args
    );

    const scored: ScoredLender[] = [];
    const filterCounts: Record<string, number> = {};
    for (const l of lenders) {
      const { result, filterReason } = scoreLender(l, args);
      if (result) {
        scored.push(result);
      } else if (filterReason && filterReason !== "no-criteria") {
        filterCounts[filterReason] = (filterCounts[filterReason] ?? 0) + 1;
      }
    }
    scored.sort((a, b) => b.score - a.score);

    const top = scored[0]?.score ?? 0;
    const results = scored.slice(0, cap).map((r) => ({
      _id: r.lender._id,
      company: r.lender.company,
      contactName: r.lender.contactName,
      phone: r.lender.phone,
      email: r.lender.email,
      website: r.lender.website,
      entityType: r.lender.entityType,
      primaryNiche: r.lender.primaryNiche,
      programs: r.lender.programs,
      statesServed: r.lender.statesServed,
      fundingAmountMin: lenderFundingMinRaw(r.lender) ?? "",
      fundingAmountMax: lenderFundingMaxRaw(r.lender) ?? "",
      rawScore: r.score,
      displayScore:
        top > 0 ? Math.round(Math.max(0, (r.score / top) * 100)) : 0,
      reasons: r.reasons,
      concerns: r.concerns,
      matchedProgram: r.matchedProgram ?? null,
    }));

    return {
      totalConsidered: lenders.length,
      totalMatched: scored.length,
      filterCounts,
      results,
      usedSearchNarrow,
    };
  },
});
