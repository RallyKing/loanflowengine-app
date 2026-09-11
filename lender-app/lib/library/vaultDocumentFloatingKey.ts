import type { Id } from "@/convex/_generated/dataModel";

/** FloatingBlockWindow detach key for a Document Vault library document. */
export function vaultDocumentFloatingBlockKey(
  documentId: Id<"libraryDocuments"> | string,
): string {
  return `vault-doc:${String(documentId).trim()}`;
}

export function isVaultDocumentFloatingBlockKey(blockKey: string): boolean {
  return blockKey.trim().startsWith("vault-doc:");
}
