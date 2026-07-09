import { formToListArgs, type BrowseFilterForm } from "@/components/BrowseFiltersPanel";

/**
 * Keep in sync with `tokenizeFilter` in `convex/lenders.ts`.
 */
function tokenizeFilter(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  return s
    .trim()
    .toLowerCase()
    .split(/[\s,]+/g)
    .map((t) => t.replace(/^['"]|['"]$/g, ""))
    .filter((t) => t.length > 0);
}

type ListFilterBundle = {
  searchTokens: string[] | null;
  entityType: string | undefined;
  section: string | undefined;
  matchDealAmount: number | undefined;
  programTokens: string[];
  stateCode: string | undefined;
  minRating: number | undefined;
  ficoCleared: number | undefined;
  propertyTypeContains: string | undefined;
  ownerOrInvestor: string | undefined;
  lenderMaxAtLeast: number | undefined;
  lenderMinAtMost: number | undefined;
};

/**
 * Keep in sync with `listArgsToFilterBundle` in `convex/lenders.ts`.
 */
function listArgsToFilterBundle(a: {
  search?: string;
  entityType?: string;
  section?: string;
  matchDealAmount?: number;
  programKeywords?: string;
  stateCode?: string;
  minRating?: number;
  ficoCleared?: number;
  propertyTypeContains?: string;
  ownerOrInvestor?: string;
  lenderMaxAtLeast?: number;
  lenderMinAtMost?: number;
}): ListFilterBundle {
  const {
    search,
    entityType,
    section,
    matchDealAmount,
    programKeywords,
    stateCode,
    minRating,
    ficoCleared,
    propertyTypeContains,
    ownerOrInvestor: ownerOrInvestorFilter,
    lenderMaxAtLeast,
    lenderMinAtMost,
  } = a;
  const searchTokens = (() => {
    if (!search || !search.trim()) return null;
    return tokenizeFilter(search);
  })();
  const programTokens = tokenizeFilter(programKeywords);
  return {
    searchTokens: searchTokens?.length ? searchTokens : null,
    entityType: entityType || undefined,
    section: section || undefined,
    matchDealAmount:
      matchDealAmount != null && matchDealAmount > 0
        ? matchDealAmount
        : undefined,
    programTokens,
    stateCode: stateCode?.trim() || undefined,
    minRating: minRating != null && minRating > 0 ? minRating : undefined,
    ficoCleared:
      ficoCleared != null && ficoCleared > 0 ? ficoCleared : undefined,
    propertyTypeContains: propertyTypeContains?.trim() || undefined,
    ownerOrInvestor: ownerOrInvestorFilter?.trim() || undefined,
    lenderMaxAtLeast:
      lenderMaxAtLeast != null && lenderMaxAtLeast > 0
        ? lenderMaxAtLeast
        : undefined,
    lenderMinAtMost:
      lenderMinAtMost != null && lenderMinAtMost > 0
        ? lenderMinAtMost
        : undefined,
  };
}

/**
 * Keep in sync with `needsFullScan` in `convex/lenders.ts`.
 */
function needsFullScan(f: ListFilterBundle): boolean {
  if (f.searchTokens && f.searchTokens.length) return true;
  if (f.matchDealAmount != null) return true;
  if (f.programTokens.length) return true;
  if (f.stateCode) return true;
  if (f.minRating != null && f.minRating > 0) return true;
  if (f.ficoCleared != null && f.ficoCleared > 0) return true;
  if (f.propertyTypeContains) return true;
  if (f.ownerOrInvestor) return true;
  if (f.lenderMaxAtLeast != null && f.lenderMaxAtLeast > 0) return true;
  if (f.lenderMinAtMost != null && f.lenderMinAtMost > 0) return true;
  if (f.section && !f.entityType) return true;
  return false;
}

/**
 * `true` when the browse UI must use `lenders.list` (full table scan in Convex).
 * `false` when `lenders.listBrowsePaginated` is valid (indexed path).
 */
export function browseListNeedsFullScan(
  search: string,
  entityType: string,
  section: string,
  adv: BrowseFilterForm
): boolean {
  const a = {
    search: search.trim() || undefined,
    entityType: entityType || undefined,
    section: section || undefined,
    ...formToListArgs(adv),
  };
  return needsFullScan(listArgsToFilterBundle(a));
}
