import type { Id } from "@/convex/_generated/dataModel";

export const VAULT_DRAG_PREFIX = "vault-drag:doc:";
export const VAULT_DRAG_FOLDER_PREFIX = "vault-drag:folder:";
export const VAULT_SORT_FOLDER_PREFIX = "vault-sort:folder:";
export const VAULT_SORT_FILE_TASK_PREFIX = "vault-sort:filetask:";
export const VAULT_DROP_ROOT = "vault-drop:root";
export const VAULT_DROP_FOLDER_PREFIX = "vault-drop:folder:";
export const VAULT_DROP_FILE_TASK_PREFIX = "vault-drop:filetask:";

export function vaultDocumentDragId(documentId: Id<"libraryDocuments">): string {
  return `${VAULT_DRAG_PREFIX}${documentId}`;
}

export function parseVaultDocumentDragId(
  id: string,
): Id<"libraryDocuments"> | null {
  if (!id.startsWith(VAULT_DRAG_PREFIX)) return null;
  return id.slice(VAULT_DRAG_PREFIX.length) as Id<"libraryDocuments">;
}

export function vaultFolderDragId(folderId: Id<"documentFolders">): string {
  return `${VAULT_DRAG_FOLDER_PREFIX}${folderId}`;
}

export function parseVaultFolderDragId(
  id: string,
): Id<"documentFolders"> | null {
  if (!id.startsWith(VAULT_DRAG_FOLDER_PREFIX)) return null;
  return id.slice(VAULT_DRAG_FOLDER_PREFIX.length) as Id<"documentFolders">;
}

export function vaultFolderSortableId(
  folderId: Id<"documentFolders">,
): string {
  return `${VAULT_SORT_FOLDER_PREFIX}${folderId}`;
}

export function parseVaultFolderSortableId(
  id: string,
): Id<"documentFolders"> | null {
  if (!id.startsWith(VAULT_SORT_FOLDER_PREFIX)) return null;
  return id.slice(VAULT_SORT_FOLDER_PREFIX.length) as Id<"documentFolders">;
}

export function parseVaultFolderActiveId(
  id: string,
): Id<"documentFolders"> | null {
  return parseVaultFolderSortableId(id) ?? parseVaultFolderDragId(id);
}

export function vaultFolderDropId(
  folderId: Id<"documentFolders"> | null,
): string {
  return folderId == null
    ? VAULT_DROP_ROOT
    : `${VAULT_DROP_FOLDER_PREFIX}${folderId}`;
}

export function parseVaultFolderDropId(
  id: string,
): Id<"documentFolders"> | null | undefined {
  if (id === VAULT_DROP_ROOT) return null;
  if (!id.startsWith(VAULT_DROP_FOLDER_PREFIX)) return undefined;
  return id.slice(VAULT_DROP_FOLDER_PREFIX.length) as Id<"documentFolders">;
}

/** Resolve document drop target from droppable or sortable folder row ids. */
export function resolveVaultDocumentDropFolderId(
  overId: string,
): Id<"documentFolders"> | null | undefined {
  const dropTarget = parseVaultFolderDropId(overId);
  if (dropTarget !== undefined) return dropTarget;
  const sortTarget = parseVaultFolderSortableId(overId);
  if (sortTarget) return sortTarget;
  return undefined;
}

export function vaultFileTaskSortableId(
  fileTaskId: Id<"documentVaultFileTasks">,
): string {
  return `${VAULT_SORT_FILE_TASK_PREFIX}${fileTaskId}`;
}

export function parseVaultFileTaskSortableId(
  id: string,
): Id<"documentVaultFileTasks"> | null {
  if (!id.startsWith(VAULT_SORT_FILE_TASK_PREFIX)) return null;
  return id.slice(VAULT_SORT_FILE_TASK_PREFIX.length) as Id<"documentVaultFileTasks">;
}

export function vaultFileTaskDropId(
  fileTaskId: Id<"documentVaultFileTasks">,
): string {
  return `${VAULT_DROP_FILE_TASK_PREFIX}${fileTaskId}`;
}

export function parseVaultFileTaskDropId(
  id: string,
): Id<"documentVaultFileTasks"> | null | undefined {
  if (!id.startsWith(VAULT_DROP_FILE_TASK_PREFIX)) return undefined;
  return id.slice(VAULT_DROP_FILE_TASK_PREFIX.length) as Id<"documentVaultFileTasks">;
}

/** Droppable body or sortable header row — both accept folder/document drops. */
export function parseVaultFileTaskTargetId(
  id: string,
): Id<"documentVaultFileTasks"> | null {
  const fromDrop = parseVaultFileTaskDropId(id);
  if (fromDrop) return fromDrop;
  return parseVaultFileTaskSortableId(id);
}

export function isVaultFileTaskTargetId(id: string): boolean {
  return parseVaultFileTaskTargetId(id) !== null;
}

export type VaultDocumentDropTarget = {
  folderId: Id<"documentFolders"> | null;
  fileTaskId?: Id<"documentVaultFileTasks">;
};

/** Resolve document drop target including file task containers. */
export function resolveVaultDocumentDropTarget(
  overId: string,
): VaultDocumentDropTarget | undefined {
  const fileTaskId = parseVaultFileTaskTargetId(overId);
  if (fileTaskId) {
    return { folderId: null, fileTaskId };
  }
  const folderId = resolveVaultDocumentDropFolderId(overId);
  if (folderId !== undefined) {
    return { folderId };
  }
  return undefined;
}
