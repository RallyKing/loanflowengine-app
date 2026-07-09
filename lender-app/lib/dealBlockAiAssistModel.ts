/**
 * Types + deterministic “AI assist” hints for deal blocks. Server may add LLM items;
 * patches are always sanitized before any user-triggered apply.
 */

export type DealBlockAiKind =
  | "dti"
  | "scenario"
  | "funding"
  | "lender_match";

export type DealBlockAiSuggestionKind =
  | "insight"
  | "explanation"
  | "autofill"
  | "lender_tip";

export type DealBlockAiSuggestion = {
  id: string;
  suggestionKind: DealBlockAiSuggestionKind;
  title: string;
  body: string;
  /** Optional patch — only applied when the user clicks Accept */
  patch?: Record<string, unknown>;
  source: "local" | "ai";
};

const DTI_SCALAR_KEYS = [
  "downPaymentPct",
  "termMonths",
  "interestRate",
  "propertyTaxRate",
  "propertyTaxesMonthly",
  "homeownersInsuranceMonthly",
  "hoa",
  "fhaMiRate",
  "fhaMiMonthly",
  "purchasePrice",
  "fundingAmount",
] as const;

const DTI_DEBT_KEYS = ["cars", "revolving", "installment", "other"] as const;

const SCENARIO_TEXT_KEYS = [
  "notes",
  "loanPurpose",
  "fundingType",
  "proposedLoanAmount",
  "creditScore",
  "loanTermYears",
  "cashOutAmount",
] as const;

const COVER_TEXT_KEYS = [
  "notes",
  "borrowerGoals",
  "prepayStructure",
  "purpose",
  "recourse",
] as const;

const LENDER_CRITERIA_KEYS = [
  "fundingTypeLabel",
  "propertyTypeLabel",
  "state",
  "transactionType",
  "ficoText",
  "annualRevenueText",
  "timeInBusinessText",
  "ltvText",
  "ownerOccupied",
  "entityTypePreference",
  "industry",
] as const;

function str(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/** Keep only safe scalar / debt patches for the DTI tool. */
export function sanitizeDtiAiPatch(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of DTI_SCALAR_KEYS) {
    const s = str(o[k]);
    if (s !== undefined) out[k] = s.slice(0, 80);
  }
  if (o.debts && typeof o.debts === "object" && !Array.isArray(o.debts)) {
    const d = o.debts as Record<string, unknown>;
    const debts: Record<string, string> = {};
    for (const k of DTI_DEBT_KEYS) {
      const s = str(d[k]);
      if (s !== undefined) debts[k] = s.slice(0, 80);
    }
    if (Object.keys(debts).length) out.debts = debts;
  }
  return Object.keys(out).length ? out : null;
}

export function sanitizeScenarioAiPatch(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SCENARIO_TEXT_KEYS) {
    const s = str(o[k]);
    if (s !== undefined) out[k] = s.slice(0, 2000);
  }
  return Object.keys(out).length ? out : null;
}

export function sanitizeCoverAiPatch(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of COVER_TEXT_KEYS) {
    const s = str(o[k]);
    if (s !== undefined) out[k] = s.slice(0, 2000);
  }
  return Object.keys(out).length ? out : null;
}

export function sanitizeLenderCriteriaAiPatch(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of LENDER_CRITERIA_KEYS) {
    const s = str(o[k]);
    if (s !== undefined) out[k] = s.slice(0, 500);
  }
  if (
    o.ownerOccupied === "Owner" ||
    o.ownerOccupied === "Investor" ||
    o.ownerOccupied === "Either"
  ) {
    out.ownerOccupied = o.ownerOccupied;
  }
  return Object.keys(out).length ? out : null;
}

export function sanitizeSuggestionPatch(
  blockKind: DealBlockAiKind,
  patch: unknown,
): Record<string, unknown> | null {
  switch (blockKind) {
    case "dti":
      return sanitizeDtiAiPatch(patch);
    case "scenario":
      return sanitizeScenarioAiPatch(patch);
    case "funding":
      return sanitizeCoverAiPatch(patch);
    case "lender_match":
      return sanitizeLenderCriteriaAiPatch(patch);
    default:
      return null;
  }
}

/** Fast, on-device hints — never overwrite data. */
export function buildLocalDealBlockSuggestions(
  blockKind: DealBlockAiKind,
  ctx: Record<string, unknown>,
): DealBlockAiSuggestion[] {
  const out: DealBlockAiSuggestion[] = [];
  let n = 0;
  const add = (
    suggestionKind: DealBlockAiSuggestionKind,
    title: string,
    body: string,
  ) => {
    n += 1;
    out.push({
      id: `local-${n}`,
      suggestionKind,
      title,
      body,
      source: "local",
    });
  };

  if (blockKind === "dti") {
    const gross = Number(ctx.grossIncome);
    const front = Number(ctx.frontDti);
    const back = Number(ctx.backDti);
    if (gross > 0) {
      add(
        "explanation",
        "How DTI is calculated here",
        "Front DTI is proposed housing (PITIA) divided by gross monthly income. Back DTI adds consumer debts (car, revolving, installment, other) to the housing payment, then divides by gross income.",
      );
    }
    if (back > 0.43) {
      add(
        "insight",
        "Back DTI above common agency caps",
        "Back DTI is above the typical 43% ceiling used on many agency / QM files. Investor or non-QM paths may allow higher ratios if documented.",
      );
    } else if (back > 0.36 && back <= 0.43) {
      add(
        "insight",
        "Back DTI is elevated",
        "Back DTI is in a zone where compensating factors, reserves, or a lower LTV often matter for conventional approval.",
      );
    }
    if (front > 0.31 && gross > 0) {
      add(
        "insight",
        "Front DTI vs FHA housing ratio",
        "Front DTI exceeds the classic FHA housing benchmark (~31%). FHA still uses full back-end underwriting — verify AUS / manual guidelines.",
      );
    }
  }

  if (blockKind === "scenario") {
    const cltv = Number(ctx.cltv);
    const purpose = String(ctx.loanPurpose ?? "").toLowerCase();
    if (cltv > 0.8 && purpose.includes("cash")) {
      add(
        "insight",
        "High leverage on cash-out",
        "CLTV is high for a cash-out structure. Lenders often cap LTV by purpose and credit tier — consider layering a second-lien strategy or reducing draw.",
      );
    }
    const inc = Number(ctx.income);
    if (inc <= 0) {
      add(
        "insight",
        "Income not reflected in scenario",
        "Scenario income fields look empty. Filling income 1/2 (or linking from intake) makes DTI and pricing conversations faster.",
      );
    }
  }

  if (blockKind === "funding") {
    const dealType = String(ctx.dealType ?? "").toLowerCase();
    const fundingType = String(ctx.coverFundingType ?? "").toLowerCase();
    const ltv = Number(ctx.ltv);
    if (dealType.includes("dscr") && fundingType.includes("fha")) {
      add(
        "insight",
        "Product / program mismatch?",
        "DSCR-style deals rarely map to FHA; double-check funding type vs. investor program fit.",
      );
    }
    if (ltv > 0.85) {
      add(
        "insight",
        "High LTV structure",
        "LTV is elevated. MI, pricing adjustments, and reserve requirements usually tighten — note that in your cover notes for the lender.",
      );
    }
  }

  if (blockKind === "lender_match") {
    const hasCrit = Boolean(ctx.hasCriteria);
    const famt = Number(ctx.fundingAmount);
    if (!hasCrit && famt <= 0) {
      add(
        "insight",
        "Add match signals",
        "Set funding type, state, or FICO (and ensure loan amount) so matching isn’t searching blind.",
      );
    }
  }

  return out;
}

export function parseAiSuggestionsResponse(
  text: string,
  blockKind: DealBlockAiKind,
): DealBlockAiSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }
  const list = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return [];
  const out: DealBlockAiSuggestion[] = [];
  let i = 0;
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id) ?? `ai-${i}`;
    const kind = o.kind;
    const title = str(o.title);
    const body = str(o.body);
    if (!title || !body) continue;
    if (
      kind !== "insight" &&
      kind !== "explanation" &&
      kind !== "autofill" &&
      kind !== "lender_tip"
    ) {
      continue;
    }
    let patchRaw: unknown = o.patch;
    if (patchRaw && typeof patchRaw === "object" && !Array.isArray(patchRaw)) {
      const pr = patchRaw as Record<string, unknown>;
      if (blockKind === "dti" && "dti" in pr) patchRaw = pr.dti;
      else if (blockKind === "scenario" && "scenario" in pr) patchRaw = pr.scenario;
      else if (blockKind === "funding" && "cover" in pr) patchRaw = pr.cover;
      else if (blockKind === "lender_match" && "lenderCriteria" in pr) {
        patchRaw = pr.lenderCriteria;
      }
    }
    const patch =
      patchRaw !== undefined
        ? sanitizeSuggestionPatch(blockKind, patchRaw) ?? undefined
        : undefined;
    out.push({
      id,
      suggestionKind: kind,
      title,
      body: body.slice(0, 4000),
      ...(patch ? { patch } : {}),
      source: "ai",
    });
    i += 1;
    if (out.length >= 6) break;
  }
  return out;
}
