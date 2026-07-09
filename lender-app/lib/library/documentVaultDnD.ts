import type { Id } from "@/convex/_generated/dataModel";

export const VAULT_DRAG_PREFIX = "vault-drag:doc:";
export const VAULT_DRAG_FOLDER_PREFIX = "vault-drag:folder:";
export const VAULT_SORT_FOLDER_PREFIX = "vault-sort:folder:";
export const VAULT_DROP_ROOT = "vault-drop:root";
export const VAULT_DROP_FOLDER_PREFIX = "vault-drop:folder:";

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
