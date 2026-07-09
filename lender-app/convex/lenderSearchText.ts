import type { Doc } from "./_generated/dataModel";

/** Published minimum funding size string (`fundingAmountMin`). */
export function lenderFundingMinRaw(l: Doc<"lenders">): string | undefined {
  if (l.fundingAmountMin != null && String(l.fundingAmountMin).trim() !== "") {
    return l.fundingAmountMin;
  }
  return undefined;
}

/** Published maximum funding size string (`fundingAmountMax`). */
export function lenderFundingMaxRaw(l: Doc<"lenders">): string | undefined {
  if (l.fundingAmountMax != null && String(l.fundingAmountMax).trim() !== "") {
    return l.fundingAmountMax;
  }
  return undefined;
}

/**
 * Flatten `programList` for keyword / token search (browse + scenario).
 */
export function flattenProgramList(l: Doc<"lenders">): string {
  const pl = l.programList;
  if (!Array.isArray(pl) || pl.length === 0) return "";
  return pl
    .map((p) => [p.name, p.minFico ?? "", p.requirements ?? ""].join(" "))
    .filter((s) => s.trim().length > 0)
    .join(" | ");
}

/**
 * Extra contacts + company phone lines for search / scoring blobs.
 */
export function contactsAndPhoneNumbersText(l: Doc<"lenders">): string {
  const parts: string[] = [];
  if (Array.isArray(l.contacts) && l.contacts.length) {
    for (const c of l.contacts) {
      if (!c) continue;
      parts.push(
        [c.name, c.titleRole, c.email, c.phone, c.notes]
          .filter(Boolean)
          .join(" ")
      );
    }
  }
  if (Array.isArray(l.phoneNumbers) && l.phoneNumbers.length) {
    for (const p of l.phoneNumbers) {
      if (!p?.phone) continue;
      parts.push([p.label, p.phone].filter(Boolean).join(" "));
    }
  }
  return parts.join(" | ");
}

/**
 * One lowercased string for:
 * - Browse: `rowMatchesLenderSearch` token “includes” checks
 * - Scenario: `haystack` for free-text and keyword-style scoring
 *
 * Add a field in one place so both paths stay aligned.
 */
export function buildLenderSearchBlob(l: Doc<"lenders">): string {
  return [
    l.source,
    l.section,
    l.company,
    l.contactName,
    l.titleRole,
    l.website,
    l.email,
    l.phone,
    l.primaryNiche,
    l.programs,
    flattenProgramList(l),
    l.propertyTypes,
    l.notes,
    l.entityType,
    l.statesServed,
    l.ownerOrInvestor,
    l.exclusions,
    lenderFundingMinRaw(l),
    lenderFundingMaxRaw(l),
    l.ltv,
    l.interestRates,
    l.amortTerm,
    l.referralFees,
    l.status,
    l.minFico,
    l.ratingNotes,
    contactsAndPhoneNumbersText(l),
  ]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" \n ")
    .toLowerCase();
}
