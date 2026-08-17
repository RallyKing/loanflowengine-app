import type { Id } from "@/convex/_generated/dataModel";
import {
  buildFolderTree,
  type DocumentFolderRow,
  type FolderTreeNode,
} from "@/lib/library/documentVaultFolders";
import {
  buildVaultDocumentZipPath,
  sanitizeZipPathSegment,
} from "@/lib/library/vaultZipPaths";

/** Minimal folder row for lender package organization (vault-compatible). */
export type LenderPackageFolderRef = {
  _id: Id<"documentFolders">;
  name: string;
  parentFolderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
  sortOrder?: number;
};

export type LenderPackageDocumentRef = {
  documentId: Id<"libraryDocuments">;
  folderId?: Id<"documentFolders">;
  fileTaskId?: Id<"documentVaultFileTasks">;
  title: string;
  fileName?: string;
};

export type LenderPackageContainer = {
  fileTaskId: Id<"documentVaultFileTasks">;
  title: string;
  sortOrder?: number;
};

export function taskRootKey(
  fileTaskId: Id<"documentVaultFileTasks"> | string,
): string {
  return `task:${String(fileTaskId)}`;
}

/**
 * Folder ids that own included docs, plus every ancestor so vault path
 * context stays intact. Empty sibling folders are omitted.
 */
export function collectPackageFolderIds(
  allFolders: readonly LenderPackageFolderRef[],
  documentFolderIds: Iterable<Id<"documentFolders"> | undefined | null>,
): Set<string> {
  const byId = new Map(allFolders.map((f) => [String(f._id), f]));
  const out = new Set<string>();

  for (const folderId of documentFolderIds) {
    if (!folderId) continue;
    let cursor: Id<"documentFolders"> | undefined = folderId;
    const guard = new Set<string>();
    while (cursor && !guard.has(String(cursor))) {
      guard.add(String(cursor));
      if (!byId.has(String(cursor))) break;
      out.add(String(cursor));
      cursor = byId.get(String(cursor))?.parentFolderId;
    }
  }

  return out;
}

/** Resolve effective file-task container for a document (link or folder). */
export function resolveDocumentPackageTaskId(
  doc: Pick<LenderPackageDocumentRef, "folderId" | "fileTaskId">,
  foldersById: Map<string, LenderPackageFolderRef>,
): Id<"documentVaultFileTasks"> | undefined {
  if (doc.fileTaskId) return doc.fileTaskId;
  if (!doc.folderId) return undefined;
  return foldersById.get(String(doc.folderId))?.fileTaskId;
}

/**
 * Group package documents the same way the Document Vault explorer does:
 * folder id, else `task:{id}` for task-root loose files, else root.
 */
export function groupPackageDocumentsByLocation(
  documents: readonly LenderPackageDocumentRef[],
  folders: readonly LenderPackageFolderRef[],
): Map<string, LenderPackageDocumentRef[]> {
  const foldersById = new Map(folders.map((f) => [String(f._id), f]));
  const map = new Map<string, LenderPackageDocumentRef[]>();

  for (const doc of documents) {
    const taskId = resolveDocumentPackageTaskId(doc, foldersById);
    const key = doc.folderId
      ? String(doc.folderId)
      : taskId
        ? taskRootKey(taskId)
        : "__root__";
    const list = map.get(key) ?? [];
    list.push(doc);
    map.set(key, list);
  }

  for (const [, list] of map) {
    list.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
  }

  return map;
}

export type LenderPackageTreeSection = {
  kind: "task" | "unassigned";
  fileTaskId?: Id<"documentVaultFileTasks">;
  title: string;
  folderTree: FolderTreeNode[];
  rootDocs: LenderPackageDocumentRef[];
};

/**
 * Build read-only sections mirroring vault: File Task containers, then
 * Unassigned for root folders / loose files with no task.
 */
export function buildLenderPackageTreeSections(args: {
  folders: readonly LenderPackageFolderRef[];
  documents: readonly LenderPackageDocumentRef[];
  containers: readonly LenderPackageContainer[];
}): LenderPackageTreeSection[] {
  const folders = args.folders as DocumentFolderRow[];
  const docsByKey = groupPackageDocumentsByLocation(
    args.documents,
    args.folders,
  );
  const foldersById = new Map(args.folders.map((f) => [String(f._id), f]));

  const taskIdsWithContent = new Set<string>();
  for (const doc of args.documents) {
    const taskId = resolveDocumentPackageTaskId(doc, foldersById);
    if (taskId) taskIdsWithContent.add(String(taskId));
  }
  for (const folder of args.folders) {
    if (folder.fileTaskId) taskIdsWithContent.add(String(folder.fileTaskId));
  }

  const containers = [...args.containers]
    .filter((c) => taskIdsWithContent.has(String(c.fileTaskId)))
    .sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });

  const sections: LenderPackageTreeSection[] = [];

  for (const container of containers) {
    const folderTree = buildFolderTree(folders, null, undefined, container.fileTaskId);
    const rootDocs = docsByKey.get(taskRootKey(container.fileTaskId)) ?? [];
    if (folderTree.length === 0 && rootDocs.length === 0) continue;
    sections.push({
      kind: "task",
      fileTaskId: container.fileTaskId,
      title: container.title,
      folderTree,
      rootDocs,
    });
  }

  const unassignedTree = buildFolderTree(folders, null, undefined, null);
  const unassignedRootDocs = docsByKey.get("__root__") ?? [];
  if (unassignedTree.length > 0 || unassignedRootDocs.length > 0) {
    sections.push({
      kind: "unassigned",
      title: containers.length > 0 ? "Unassigned" : "Documents",
      folderTree: unassignedTree,
      rootDocs: unassignedRootDocs,
    });
  }

  return sections;
}

/** ZIP entry path: optional task title prefix + vault folder path. */
export function buildLenderPackageZipPath(args: {
  folders: readonly LenderPackageFolderRef[];
  containersById: Map<string, string>;
  folderId?: Id<"documentFolders"> | null;
  fileTaskId?: Id<"documentVaultFileTasks"> | null;
  fileName: string;
}): string {
  const folders = args.folders as DocumentFolderRow[];
  const folderPath = buildVaultDocumentZipPath(
    folders,
    args.folderId,
    args.fileName,
  );

  let taskId = args.fileTaskId ?? undefined;
  if (!taskId && args.folderId) {
    const folder = args.folders.find(
      (f) => String(f._id) === String(args.folderId),
    );
    taskId = folder?.fileTaskId;
  }
  if (!taskId) return folderPath;

  const taskTitle = args.containersById.get(String(taskId));
  if (!taskTitle) return folderPath;
  return `${sanitizeZipPathSegment(taskTitle)}/${folderPath}`;
}
