/** Client-side mirror of `libraryDocumentCategoryV` (Convex). */
export const LIBRARY_DOCUMENT_CATEGORIES = [
  "tax_return",
  "id",
  "dd214",
  "deal_specific",
  "client_submitted",
  "other",
] as const;

export type LibraryDocumentCategory =
  (typeof LIBRARY_DOCUMENT_CATEGORIES)[number];

export const LIBRARY_DOCUMENT_CATEGORY_LABELS: Record<
  LibraryDocumentCategory,
  string
> = {
  tax_return: "Tax Return",
  id: "Government ID",
  dd214: "DD-214",
  deal_specific: "Deal Specific",
  client_submitted: "Client Submitted",
  other: "Other",
};

/** Vault filter bar selection — client-only; no extra network fetch. */
export type VaultCategoryFilter =
  | "all"
  | "unassigned"
  | LibraryDocumentCategory;

export const VAULT_FILTER_CHIPS: ReadonlyArray<{
  id: VaultCategoryFilter;
  label: string;
}> = [
  { id: "all", label: "All Documents" },
  { id: "unassigned", label: "Unassigned" },
  ...LIBRARY_DOCUMENT_CATEGORIES.map((id) => ({
    id,
    label: LIBRARY_DOCUMENT_CATEGORY_LABELS[id],
  })),
];

const CURRENT_YEAR = new Date().getFullYear();

/** Recent tax years for quick selection (newest first). */
export function vaultTaxYearOptions(
  span = 12,
): ReadonlyArray<{ value: string; label: string }> {
  const out: { value: string; label: string }[] = [];
  for (let y = CURRENT_YEAR + 1; y >= CURRENT_YEAR + 1 - span; y--) {
    out.push({ value: String(y), label: String(y) });
  }
  return out;
}

export function isLibraryDocumentCategory(
  value: string,
): value is LibraryDocumentCategory {
  return (LIBRARY_DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export function filterVaultDocuments<
  T extends { documentCategory?: LibraryDocumentCategory },
>(rows: T[], filter: VaultCategoryFilter): T[] {
  if (filter === "all") return rows;
  if (filter === "unassigned") {
    return rows.filter((r) => r.documentCategory == null);
  }
  return rows.filter((r) => r.documentCategory === filter);
}

/** Sub-filter when primary category is Tax Return — client-only. */
export type VaultTaxYearFilter = "all" | string;

/** Unique tax years from loaded rows (tax_return only), newest first. */
export function aggregateVaultTaxYears<
  T extends { documentCategory?: LibraryDocumentCategory; taxYear?: string },
>(rows: T[]): string[] {
  const years = new Set<string>();
  for (const row of rows) {
    if (row.documentCategory !== "tax_return") continue;
    const y = row.taxYear?.trim();
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return b.localeCompare(a);
  });
}

export function filterVaultDocumentsWithTaxYear<
  T extends { documentCategory?: LibraryDocumentCategory; taxYear?: string },
>(
  rows: T[],
  categoryFilter: VaultCategoryFilter,
  taxYearFilter: VaultTaxYearFilter,
): T[] {
  let out = filterVaultDocuments(rows, categoryFilter);
  if (categoryFilter === "tax_return" && taxYearFilter !== "all") {
    out = out.filter((r) => r.taxYear?.trim() === taxYearFilter);
  }
  return out;
}

export {
  DOCUMENT_CATEGORY_EXPIRATION_DAYS,
  DOCUMENT_EXPIRY_WARNING_DAYS,
} from "@/lib/library/documentVaultExpiry";
