import type { LibraryDocumentCategory } from "@/lib/library/documentVaultTaxonomy";
import { LIBRARY_DOCUMENT_CATEGORY_LABELS } from "@/lib/library/documentVaultTaxonomy";

export type VaultSearchableDocument = {
  title: string;
  latestFileName?: string;
  documentCategory?: LibraryDocumentCategory;
  aiSuggestedCategory?: LibraryDocumentCategory;
  linkScope?: string;
  savedToContactProfile?: boolean;
};

export function documentMatchesVaultSearch(
  doc: VaultSearchableDocument,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack: string[] = [doc.title, doc.latestFileName ?? ""];
  if (doc.documentCategory) {
    haystack.push(LIBRARY_DOCUMENT_CATEGORY_LABELS[doc.documentCategory]);
    haystack.push(doc.documentCategory);
  }
  if (doc.aiSuggestedCategory) {
    haystack.push(LIBRARY_DOCUMENT_CATEGORY_LABELS[doc.aiSuggestedCategory]);
  }
  if (doc.linkScope === "contact") {
    haystack.push("contact", "global");
  }
  if (doc.savedToContactProfile) {
    haystack.push("contact", "profile", "saved");
  }

  return haystack.some((part) => part.toLowerCase().includes(q));
}
