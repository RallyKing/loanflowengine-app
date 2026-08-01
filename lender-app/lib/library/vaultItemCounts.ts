import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { DocumentFolderRow } from "@/lib/library/documentVaultFolders";

export type VaultTreeDocumentRef = {
  _id: Id<"libraryDocuments">;
  folderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
  status?: "incomplete" | "pending_review" | "complete";
};

export type VaultItemCountSummary = {
  folderCount: number;
  documentCount: number;
  completeDocuments: number;
  totalItems: number;
};

function isCompleteDoc(doc: VaultTreeDocumentRef): boolean {
  return doc.status === "complete" || doc.status === "pending_review";
}

function collectFolderSubtreeIds(
  folders: DocumentFolderRow[],
  rootFolderId: Id<"documentFolders">,
): Set<string> {
  const out = new Set<string>([String(rootFolderId)]);
  const queue = [rootFolderId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const f of folders) {
      if (f.parentFolderId === id) {
        const key = String(f._id);
        if (!out.has(key)) {
          out.add(key);
          queue.push(f._id);
        }
      }
    }
  }
  return out;
}

export function countDocumentsInFolders(
  docs: VaultTreeDocumentRef[],
  folderIds: Set<string>,
): { documentCount: number; completeDocuments: number } {
  let documentCount = 0;
  let completeDocuments = 0;
  for (const doc of docs) {
    if (!doc.folderId || !folderIds.has(String(doc.folderId))) continue;
    documentCount += 1;
    if (isCompleteDoc(doc)) completeDocuments += 1;
  }
  return { documentCount, completeDocuments };
}

/** Recursive folder + document totals for one folder node. */
export function countFolderItems(
  folderId: Id<"documentFolders">,
  folders: DocumentFolderRow[],
  docs: VaultTreeDocumentRef[],
): VaultItemCountSummary {
  const subtree = collectFolderSubtreeIds(folders, folderId);
  const folderCount = subtree.size - 1;
  const { documentCount, completeDocuments } = countDocumentsInFolders(
    docs,
    subtree,
  );
  return {
    folderCount,
    documentCount,
    completeDocuments,
    totalItems: folderCount + documentCount,
  };
}

/** Totals for a file task container (root folders + nested + loose docs + blocks). */
export function countFileTaskItems(
  fileTaskId: Id<"documentVaultFileTasks">,
  folders: DocumentFolderRow[],
  docs: VaultTreeDocumentRef[],
  options?: { assignedBlockCount?: number },
): VaultItemCountSummary {
  const taskFolders = folders.filter((f) => f.fileTaskId === fileTaskId);
  const folderIds = new Set(taskFolders.map((f) => String(f._id)));
  const folderCount = taskFolders.length;
  const blockCount = options?.assignedBlockCount ?? 0;
  let documentCount = 0;
  let completeDocuments = 0;

  for (const doc of docs) {
    const inTaskRoot =
      !doc.folderId && doc.fileTaskId && String(doc.fileTaskId) === String(fileTaskId);
    const inTaskFolder =
      doc.folderId != null && folderIds.has(String(doc.folderId));
    if (!inTaskRoot && !inTaskFolder) continue;
    documentCount += 1;
    if (isCompleteDoc(doc)) completeDocuments += 1;
  }

  return {
    folderCount,
    documentCount,
    completeDocuments,
    totalItems: folderCount + documentCount + blockCount,
  };
}

export function formatVaultItemBadge(summary: VaultItemCountSummary): string {
  if (summary.totalItems === 0) return "0 items";
  if (summary.documentCount > 0 && summary.completeDocuments > 0) {
    return `${summary.totalItems} items · ${summary.completeDocuments}/${summary.documentCount} docs`;
  }
  return `${summary.totalItems} item${summary.totalItems === 1 ? "" : "s"}`;
}

export function formatFolderItemBadge(summary: VaultItemCountSummary): string {
  const n = summary.totalItems;
  return `${n} item${n === 1 ? "" : "s"}`;
}

export function formatTaskItemBadge(
  summary: VaultItemCountSummary,
  taskStatus?: "incomplete" | "pending_review" | "complete",
  assignedBlockCount = 0,
): string {
  if (assignedBlockCount > 0 && summary.documentCount === 0) {
    return `${assignedBlockCount} block${assignedBlockCount === 1 ? "" : "s"}`;
  }
  if (summary.documentCount > 0) {
    return `${summary.completeDocuments}/${summary.documentCount} complete`;
  }
  if (taskStatus === "complete") return "Complete";
  if (taskStatus === "pending_review") return "Under review";
  if (summary.totalItems > 0) {
    return `${summary.totalItems} item${summary.totalItems === 1 ? "" : "s"}`;
  }
  return "0 items";
}
