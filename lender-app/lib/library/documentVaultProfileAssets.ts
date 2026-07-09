import type { LibraryDocumentCategory } from "@/lib/library/documentVaultTaxonomy";

/** Evergreen contact-profile asset types (import + save). */
export const PROFILE_ASSET_CATEGORIES = [
  "id",
  "dd214",
  "tax_return",
  "other",
] as const satisfies readonly LibraryDocumentCategory[];

export type ProfileAssetCategory = (typeof PROFILE_ASSET_CATEGORIES)[number];

export function isProfileAssetCategory(
  value: string | undefined | null,
): value is ProfileAssetCategory {
  if (!value) return false;
  return (PROFILE_ASSET_CATEGORIES as readonly string[]).includes(value);
}

export function isEvergreenContactDocument(
  category: LibraryDocumentCategory | undefined,
): boolean {
  if (!category) return false;
  return isProfileAssetCategory(category);
}
