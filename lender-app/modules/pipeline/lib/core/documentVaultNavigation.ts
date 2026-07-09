import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentCategory } from "@/lib/library/documentVaultTaxonomy";

/** Cross-tab handoff: Tab 5 portal → Tab 4 Document Vault. */
export type DocumentVaultNavigationFocus = {
  category?: LibraryDocumentCategory;
  highlightDocumentId?: Id<"libraryDocuments">;
  /** Bumps when navigation fires so vault effects re-run on repeat clicks. */
  nonce: number;
};

export function createDocumentVaultNavigationFocus(
  partial: Omit<DocumentVaultNavigationFocus, "nonce">,
): DocumentVaultNavigationFocus {
  return { ...partial, nonce: Date.now() };
}
