import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import {
  postFileToConvexUploadUrl,
  validateLenderAttachmentFile,
  type ConvexAttachmentUploadPayload,
} from "@/lib/uploadToConvexStorage";
import { triggerVaultDocumentClassification } from "@/lib/library/triggerVaultDocumentClassification";

export type VaultUploadPhase =
  | "validating"
  | "preflight"
  | "uploading"
  | "committing"
  | "folder"
  | "done"
  | "error";

export type VaultUploadProgress = {
  phase: VaultUploadPhase;
  fileName: string;
  /** 0–100 approximate progress for UI bars. */
  percent: number;
  fileIndex: number;
  fileCount: number;
  message?: string;
};

export type VaultUploadMutations = {
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  createDocument: (args: {
    title: string;
    link: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<{ documentId: Id<"libraryDocuments"> }>;
  commitDocumentVersion: (args: {
    documentId: Id<"libraryDocuments">;
    proof: LibraryDocumentsProof;
    storageId: Id<"_storage">;
    fileName: string;
    contentType?: string;
    size?: number;
    memberUserKey: string;
  }) => Promise<unknown>;
  patchLinkMetadata?: (args: {
    documentId: Id<"libraryDocuments">;
    proof: LibraryDocumentsProof;
    folderId?: Id<"documentFolders">;
    fileTaskId?: Id<"documentVaultFileTasks">;
    memberUserKey: string;
  }) => Promise<unknown>;
  enqueueDocumentClassification?: EnqueueClassification;
};

type EnqueueClassification = (args: {
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  previewText: string;
  fileName: string;
  memberUserKey: string;
}) => Promise<unknown>;

const DEFAULT_RETRIES = 2;
const RETRY_DELAY_MS = 400;

function phasePercent(phase: VaultUploadPhase): number {
  switch (phase) {
    case "validating":
      return 5;
    case "preflight":
      return 15;
    case "uploading":
      return 55;
    case "committing":
      return 85;
    case "folder":
      return 95;
    case "done":
      return 100;
    case "error":
      return 0;
    default:
      return 0;
  }
}

async function sleep(ms: number) {
  await new Promise<void>((r) => setTimeout(r, ms));
}

async function withRetries<T>(
  fn: () => Promise<T>,
  retries: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Upload failed"));
}

export function titleFromVaultFileName(fileName: string): string {
  const base = fileName.replace(/[/\\]/g, "").trim() || "Document";
  const withoutExt = base.replace(/\.[^.]+$/, "").trim();
  return withoutExt || base;
}

/**
 * Centralized vault ingestion: validate → pre-flight URL (proof + access) → POST
 * with retries → commit version → optional folder placement.
 */
export async function uploadFileToVault(options: {
  file: File;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  title?: string;
  folderId?: Id<"documentFolders"> | null;
  fileTaskId?: Id<"documentVaultFileTasks"> | null;
  mutations: VaultUploadMutations;
  onProgress?: (progress: VaultUploadProgress) => void;
  maxRetries?: number;
  fileIndex?: number;
  fileCount?: number;
}): Promise<{ documentId: Id<"libraryDocuments"> }> {
  const {
    file,
    proof,
    memberUserKey,
    mutations,
    onProgress,
    maxRetries = DEFAULT_RETRIES,
    fileIndex = 0,
    fileCount = 1,
  } = options;
  const fileName = file.name;

  const report = (phase: VaultUploadPhase, message?: string) => {
    onProgress?.({
      phase,
      fileName,
      percent: phasePercent(phase),
      fileIndex,
      fileCount,
      message,
    });
  };

  report("validating");
  const validationError = validateLenderAttachmentFile(file);
  if (validationError) {
    report("error", validationError);
    throw new Error(validationError);
  }

  report("preflight", "Checking file access…");
  const postUrl = await withRetries(
    () =>
      mutations.generateUploadUrl({
        proof,
        memberUserKey,
      }),
    maxRetries,
  );

  report("uploading", "Uploading file…");
  const { storageId } = await withRetries(
    () => postFileToConvexUploadUrl(postUrl, file),
    maxRetries,
  );

  const title =
    options.title?.trim() || titleFromVaultFileName(fileName);

  report("committing", "Saving document…");
  const { documentId } = await withRetries(
    () =>
      mutations.createDocument({
        title,
        link: proof,
        memberUserKey,
      }),
    maxRetries,
  );

  await withRetries(
    () =>
      mutations.commitDocumentVersion({
        documentId,
        proof,
        storageId: storageId as Id<"_storage">,
        fileName,
        contentType: file.type || undefined,
        size: file.size,
        memberUserKey,
      }),
    maxRetries,
  );

  if (
    proof.kind === "pipeline" &&
    mutations.patchLinkMetadata &&
    (options.folderId || options.fileTaskId)
  ) {
    report("folder", "Placing in vault…");
    await withRetries(
      () =>
        mutations.patchLinkMetadata!({
          documentId,
          proof,
          ...(options.folderId ? { folderId: options.folderId } : {}),
          ...(options.fileTaskId ? { fileTaskId: options.fileTaskId } : {}),
          memberUserKey,
        }),
      maxRetries,
    );
  }

  report("done", "Upload complete");

  if (mutations.enqueueDocumentClassification) {
    triggerVaultDocumentClassification({
      file,
      documentId,
      proof,
      memberUserKey,
      enqueueDocumentClassification: mutations.enqueueDocumentClassification,
    });
  }

  return { documentId };
}

export async function uploadNewVersionToVault(options: {
  file: File;
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  generateUploadUrl: VaultUploadMutations["generateUploadUrl"];
  commitDocumentVersion: VaultUploadMutations["commitDocumentVersion"];
  enqueueDocumentClassification?: EnqueueClassification;
  onProgress?: (progress: VaultUploadProgress) => void;
  maxRetries?: number;
}): Promise<{ version: number }> {
  const {
    file,
    documentId,
    proof,
    memberUserKey,
    generateUploadUrl,
    commitDocumentVersion,
    onProgress,
    maxRetries = DEFAULT_RETRIES,
  } = options;

  const report = (phase: VaultUploadPhase, message?: string) => {
    onProgress?.({
      phase,
      fileName: file.name,
      percent: phasePercent(phase),
      fileIndex: 0,
      fileCount: 1,
      message,
    });
  };

  report("validating");
  const validationError = validateLenderAttachmentFile(file);
  if (validationError) {
    report("error", validationError);
    throw new Error(validationError);
  }

  report("preflight");
  const postUrl = await withRetries(
    () => generateUploadUrl({ proof, memberUserKey }),
    maxRetries,
  );

  report("uploading");
  const { storageId } = await withRetries(
    () => postFileToConvexUploadUrl(postUrl, file),
    maxRetries,
  );

  report("committing");
  const result = (await withRetries(
    () =>
      commitDocumentVersion({
        documentId,
        proof,
        storageId: storageId as Id<"_storage">,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size,
        memberUserKey,
      }),
    maxRetries,
  )) as { version?: number };

  report("done");

  if (options.enqueueDocumentClassification) {
    triggerVaultDocumentClassification({
      file,
      documentId,
      proof,
      memberUserKey,
      enqueueDocumentClassification: options.enqueueDocumentClassification,
    });
  }

  return { version: result.version ?? 0 };
}

/** Commit in-memory PDF bytes as the next document version (rotate/crop/merge). */
export async function commitPdfBytesAsNewVersion(options: {
  pdfBytes: Uint8Array;
  fileName: string;
  documentId: Id<"libraryDocuments">;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  generateUploadUrl: VaultUploadMutations["generateUploadUrl"];
  commitDocumentVersion: VaultUploadMutations["commitDocumentVersion"];
  onProgress?: (progress: VaultUploadProgress) => void;
  maxRetries?: number;
}): Promise<{ version: number }> {
  const file = new File(
    [options.pdfBytes.buffer as ArrayBuffer],
    options.fileName.toLowerCase().endsWith(".pdf")
      ? options.fileName
      : `${options.fileName}.pdf`,
    { type: "application/pdf" },
  );
  return uploadNewVersionToVault({
    file,
    documentId: options.documentId,
    proof: options.proof,
    memberUserKey: options.memberUserKey,
    generateUploadUrl: options.generateUploadUrl,
    commitDocumentVersion: options.commitDocumentVersion,
    onProgress: options.onProgress,
    maxRetries: options.maxRetries,
  });
}

export type { ConvexAttachmentUploadPayload };
