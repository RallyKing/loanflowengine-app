import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { assemblePageAssetsPdf } from "@/lib/library/assemblePageAssetsPdf";
import type { PageAssetForAssembly } from "@/lib/library/pageAssetTypes";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";

export async function finalizePageAssetDocument(options: {
  pages: PageAssetForAssembly[];
  fileName: string;
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  finalizeDocument: (args: {
    documentId: Id<"libraryDocuments">;
    proof: LibraryDocumentsProof;
    storageId: Id<"_storage">;
    fileName: string;
    contentType?: string;
    size?: number;
    memberUserKey: string;
  }) => Promise<{ version: number }>;
}): Promise<{ version: number }> {
  const pdfBytes = await assemblePageAssetsPdf(options.pages);
  const safeName = options.fileName.toLowerCase().endsWith(".pdf")
    ? options.fileName
    : `${options.fileName.replace(/\.[^.]+$/, "")}.pdf`;
  const file = new File(
    [pdfBytes.buffer as ArrayBuffer],
    safeName,
    { type: "application/pdf" },
  );
  const uploadUrl = await options.generateUploadUrl({
    proof: options.proof,
    memberUserKey: options.memberUserKey,
  });
  const { storageId } = await postFileToConvexUploadUrl(uploadUrl, file);
  const result = await options.finalizeDocument({
    documentId: options.documentId,
    proof: options.proof,
    storageId: storageId as Id<"_storage">,
    fileName: safeName,
    contentType: "application/pdf",
    size: file.size,
    memberUserKey: options.memberUserKey,
  });
  return { version: result.version ?? 0 };
}
