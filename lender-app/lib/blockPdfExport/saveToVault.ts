/**
 * Save a block fillable PDF into Document Vault (no shadow vault).
 * Reuses `uploadFileToVault` + Convex libraryDocuments storage.
 */
import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { pdfBytesToFile } from "@/lib/library/pdfManipulation";
import {
  titleFromVaultFileName,
  uploadFileToVault,
  type VaultUploadMutations,
  type VaultUploadProgress,
} from "@/lib/library/uploadFileToVault";
import { exportBlockToFillablePdf } from "./exportBlockToFillablePdf";
import type { BlockPdfExportResult, BlockPdfExportSpec } from "./types";

/** Root folder names we prefer for block-generated forms (case-insensitive). */
export const BLOCK_PDF_VAULT_FOLDER_CANDIDATES = [
  "PFS",
  "Forms",
  "Personal Financial Statements",
  "REO",
  "Schedule of REO",
  "Track Record",
  "Construction Budget",
  "Simple P&L",
  "Profit and Loss",
] as const;

export const BLOCK_PDF_VAULT_DEFAULT_FOLDER = "Forms";

export type BlockPdfVaultFolderRow = {
  _id: Id<"documentFolders">;
  name: string;
  parentFolderId?: Id<"documentFolders"> | null;
};

export type SaveBlockFillablePdfToVaultOptions = {
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  mutations: VaultUploadMutations;
  folderId?: Id<"documentFolders"> | null;
  title?: string;
  onProgress?: (progress: VaultUploadProgress) => void;
};

export type SaveBlockFillablePdfToVaultResult = BlockPdfExportResult & {
  documentId: Id<"libraryDocuments">;
};

/** Sanitize a pipeline / person name for use in a PDF basename. */
export function sanitizeBlockPdfFileLabel(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "file";
  const safe = trimmed
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || "file";
}

/**
 * Sensible vault filename, e.g. `Personal-Financial-Statement-Acme-LLC.pdf`.
 */
export function buildBlockPdfVaultFileName(
  blockLabel: string,
  fileLabel?: string | null,
): string {
  const block = sanitizeBlockPdfFileLabel(blockLabel.replace(/\s+/g, "-"));
  const file = sanitizeBlockPdfFileLabel(fileLabel);
  return `${block}-${file}.pdf`;
}

/**
 * Prefer an existing root Forms/PFS folder; otherwise create `Forms`.
 */
export async function resolveBlockPdfVaultFolder(options: {
  folders: BlockPdfVaultFolderRow[] | null | undefined;
  pipelineFileId: Id<"pipeline">;
  memberUserKey: string;
  createFolder: (args: {
    pipelineFileId: Id<"pipeline">;
    name: string;
    memberUserKey: string;
  }) => Promise<{ folderId: Id<"documentFolders"> }>;
  createIfMissing?: boolean;
  defaultFolderName?: string;
}): Promise<{ folderId: Id<"documentFolders"> | null; folderName: string }> {
  const defaultName =
    options.defaultFolderName?.trim() || BLOCK_PDF_VAULT_DEFAULT_FOLDER;
  const roots = (options.folders ?? []).filter((f) => !f.parentFolderId);

  for (const candidate of BLOCK_PDF_VAULT_FOLDER_CANDIDATES) {
    const hit = roots.find(
      (f) =>
        f.name.localeCompare(candidate, undefined, { sensitivity: "base" }) ===
        0,
    );
    if (hit) return { folderId: hit._id, folderName: hit.name };
  }

  if (options.createIfMissing === false) {
    return { folderId: null, folderName: "Unassigned" };
  }

  const { folderId } = await options.createFolder({
    pipelineFileId: options.pipelineFileId,
    name: defaultName,
    memberUserKey: options.memberUserKey,
  });
  return { folderId, folderName: defaultName };
}

/** Upload already-generated fillable PDF bytes into the vault. */
export async function uploadBlockFillablePdfResultToVault(
  result: BlockPdfExportResult,
  options: SaveBlockFillablePdfToVaultOptions,
): Promise<SaveBlockFillablePdfToVaultResult> {
  const file = pdfBytesToFile(result.bytes, result.fileName);
  const { documentId } = await uploadFileToVault({
    file,
    proof: options.proof,
    memberUserKey: options.memberUserKey,
    title: options.title?.trim() || titleFromVaultFileName(result.fileName),
    folderId: options.folderId,
    mutations: options.mutations,
    onProgress: options.onProgress,
  });
  return { ...result, documentId };
}

/** Generate a fillable block PDF and save it into Document Vault. */
export async function saveBlockFillablePdfToVault(
  spec: BlockPdfExportSpec,
  options: SaveBlockFillablePdfToVaultOptions,
): Promise<SaveBlockFillablePdfToVaultResult> {
  const result = await exportBlockToFillablePdf(spec);
  return uploadBlockFillablePdfResultToVault(result, options);
}
