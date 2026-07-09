import type { Doc, Id } from "@/convex/_generated/dataModel";

export type DocumentFolderRow = Doc<"documentFolders">;

export type FolderBreadcrumbSegment = {
  id: Id<"documentFolders"> | null;
  name: string;
};

/** Walk parent chain from `currentFolderId` to root for breadcrumb UI. */
export function buildFolderBreadcrumbs(
  folders: DocumentFolderRow[],
  currentFolderId: Id<"documentFolders"> | null,
  rootLabel = "Root",
): FolderBreadcrumbSegment[] {
  const byId = new Map(folders.map((f) => [String(f._id), f]));
  const trail: FolderBreadcrumbSegment[] = [{ id: null, name: rootLabel }];

  if (!currentFolderId) return trail;

  const chain: DocumentFolderRow[] = [];
  let cursor: Id<"documentFolders"> | undefined = currentFolderId;
  const guard = new Set<string>();

  while (cursor && !guard.has(String(cursor))) {
    guard.add(String(cursor));
    const row = byId.get(String(cursor));
    if (!row) break;
    chain.unshift(row);
    cursor = row.parentFolderId;
  }

  for (const folder of chain) {
    trail.push({ id: folder._id, name: folder.name });
  }

  return trail;
}

/** Human-readable path for move-to-folder picker (e.g. Root / Tax Returns / 2025). */
export function folderDisplayPath(
  folders: DocumentFolderRow[],
  folderId: Id<"documentFolders">,
): string {
  const crumbs = buildFolderBreadcrumbs(folders, folderId);
  return crumbs.map((c) => c.name).join(" / ");
}

export function foldersInParent(
  folders: DocumentFolderRow[],
  parentFolderId: Id<"documentFolders"> | null,
): DocumentFolderRow[] {
  return folders
    .filter((f) => (f.parentFolderId ?? null) === parentFolderId)
    .sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

/** Portal-facing path without "Root" prefix (e.g. `/Tax Returns/2025`). */
export function folderPortalPath(
  folders: DocumentFolderRow[],
  folderId: Id<"documentFolders">,
): string {
  const crumbs = buildFolderBreadcrumbs(folders, folderId);
  const parts = crumbs.filter((c) => c.id != null).map((c) => c.name);
  return parts.length ? `/${parts.join("/")}` : "/";
}

export function portalRequestGroupHeading(
  folders: DocumentFolderRow[],
  targetFolderId: Id<"documentFolders"> | null | undefined,
): string {
  if (!targetFolderId) return "General requests";
  return folderDisplayPath(folders, targetFolderId);
}

export function documentMatchesFolder(
  folderId: Id<"documentFolders"> | null | undefined,
  currentFolderId: Id<"documentFolders"> | null,
): boolean {
  return (folderId ?? null) === currentFolderId;
}

export type FolderTreeNode = {
  folder: DocumentFolderRow;
  children: FolderTreeNode[];
};

/** Sibling folder ids in display order (sortOrder, optional optimistic override). */
export function orderedSiblingFolderIds(
  folders: DocumentFolderRow[],
  parentFolderId: Id<"documentFolders"> | null,
  siblingOrderByParent?: Record<string, Id<"documentFolders">[]>,
): Id<"documentFolders">[] {
  const parentKey =
    parentFolderId == null ? "__root__" : String(parentFolderId);
  let ids = foldersInParent(folders, parentFolderId).map((f) => f._id);
  const override = siblingOrderByParent?.[parentKey];
  if (!override?.length) return ids;

  const byId = new Map(ids.map((id) => [String(id), id]));
  const ordered: Id<"documentFolders">[] = [];
  for (const id of override) {
    const match = byId.get(String(id));
    if (match) ordered.push(match);
  }
  for (const id of ids) {
    if (!override.some((o) => o === id)) ordered.push(id);
  }
  return ordered;
}

/** Nested folder tree for vault directory sidebar (sorted by name). */
export function buildFolderTree(
  folders: DocumentFolderRow[],
  parentFolderId: Id<"documentFolders"> | null = null,
  siblingOrderByParent?: Record<string, Id<"documentFolders">[]>,
): FolderTreeNode[] {
  const parentKey =
    parentFolderId == null ? "__root__" : String(parentFolderId);
  const override = siblingOrderByParent?.[parentKey];
  let siblings = foldersInParent(folders, parentFolderId);
  if (override?.length) {
    const byId = new Map(siblings.map((s) => [String(s._id), s]));
    const ordered: DocumentFolderRow[] = [];
    for (const id of override) {
      const row = byId.get(String(id));
      if (row) ordered.push(row);
    }
    for (const s of siblings) {
      if (!override.some((id) => id === s._id)) ordered.push(s);
    }
    siblings = ordered;
  }
  return siblings.map((folder) => ({
    folder,
    children: buildFolderTree(
      folders,
      folder._id,
      siblingOrderByParent,
    ),
  }));
}
