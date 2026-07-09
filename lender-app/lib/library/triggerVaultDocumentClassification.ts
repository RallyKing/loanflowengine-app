import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { extractDocumentTextForClassification } from "@/lib/library/extractDocumentTextForClassification";

type EnqueueClassification = (args: {
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  previewText: string;
  fileName: string;
  memberUserKey: string;
}) => Promise<unknown>;

/** Fire-and-forget AI classification after vault upload (non-blocking). */
export function triggerVaultDocumentClassification(options: {
  file: File;
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  enqueueDocumentClassification: EnqueueClassification;
}): void {
  void (async () => {
    const previewText = await extractDocumentTextForClassification(options.file);
    await options.enqueueDocumentClassification({
      documentId: options.documentId,
      proof: options.proof,
      previewText,
      fileName: options.file.name,
      memberUserKey: options.memberUserKey,
    });
  })().catch(() => {
    /* classification is best-effort */
  });
}
