/**
 * Document Vault Explorer filter helpers (search + starred).
 *
 * Combination rule when both are on:
 * - Start from the starred-visible tree (starred files/folders, ancestors for
 *   context, and descendants of starred folders).
 * - Then keep items whose name matches the query, or ancestors of those hits.
 * A starred folder whose own name does not match still appears when a
 * descendant matches.
 */

export type VaultStarredIds = {
  documentIds: ReadonlySet<string>;
  folderIds: ReadonlySet<string>;
};

export type ExplorerFilterOptions = {
  query: string;
  starredOnly: boolean;
  starred: VaultStarredIds;
};

export type ExplorerNamedItem = {
  id: string;
  name: string;
};

export type ExplorerFolderNode<T = unknown> = {
  id: string;
  name: string;
  children: ExplorerFolderNode<T>[];
  source: T;
};

export function normalizeExplorerQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesExplorerQuery(
  name: string,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  return name.toLowerCase().includes(normalizedQuery);
}

export function emptyVaultStarredIds(): VaultStarredIds {
  return { documentIds: new Set(), folderIds: new Set() };
}

export function isDocumentStarred(
  documentId: string,
  starred: VaultStarredIds,
): boolean {
  return starred.documentIds.has(documentId);
}

export function isFolderStarred(
  folderId: string,
  starred: VaultStarredIds,
): boolean {
  return starred.folderIds.has(folderId);
}

function docPasses(
  docId: string,
  title: string,
  normalizedQuery: string,
  starredOnly: boolean,
  starred: VaultStarredIds,
  insideStarredFolder: boolean,
): boolean {
  const matches = matchesExplorerQuery(title, normalizedQuery);
  if (!starredOnly) return matches;
  const allowed = insideStarredFolder || isDocumentStarred(docId, starred);
  return allowed && matches;
}

export function filterExplorerDocuments<
  T extends { id: string; title: string },
>(
  docs: readonly T[],
  options: ExplorerFilterOptions,
  insideStarredFolder = false,
  parentMatchedQuery = false,
): T[] {
  const q = normalizeExplorerQuery(options.query);
  if (parentMatchedQuery && (!options.starredOnly || insideStarredFolder)) {
    return [...docs];
  }
  return docs.filter((doc) =>
    docPasses(
      doc.id,
      doc.title,
      q,
      options.starredOnly,
      options.starred,
      insideStarredFolder,
    ),
  );
}

/**
 * Keep folders that match, contain matching docs, or contain matching child
 * folders. When `starredOnly`, a non-starred folder is kept only as ancestor
 * context. A starred folder applies search to its subtree (descendants stay).
 */
export function filterExplorerFolderTree<T>(
  nodes: readonly ExplorerFolderNode<T>[],
  docsByFolderId: ReadonlyMap<string, ReadonlyArray<{ id: string; title: string }>>,
  options: ExplorerFilterOptions,
  insideStarredFolder = false,
): ExplorerFolderNode<T>[] {
  const q = normalizeExplorerQuery(options.query);
  const out: ExplorerFolderNode<T>[] = [];

  for (const node of nodes) {
    const folderStarred = isFolderStarred(node.id, options.starred);
    const inStarredSubtree = insideStarredFolder || folderStarred;
    const folderMatches = matchesExplorerQuery(node.name, q);
    /** Folder name is the hit — keep its contents so the match isn't an empty shell. */
    const showFullSubtree =
      folderMatches && (!options.starredOnly || inStarredSubtree);

    const children = showFullSubtree
      ? node.children.map((child) => cloneFolderTree(child))
      : filterExplorerFolderTree(
          node.children,
          docsByFolderId,
          options,
          inStarredSubtree,
        );

    const folderDocs = docsByFolderId.get(node.id) ?? [];
    const visibleDocs = showFullSubtree
      ? folderDocs
      : folderDocs.filter((doc) =>
          docPasses(
            doc.id,
            doc.title,
            q,
            options.starredOnly,
            options.starred,
            inStarredSubtree,
          ),
        );

    const hasContent = children.length > 0 || visibleDocs.length > 0;

    if (options.starredOnly && !inStarredSubtree) {
      if (hasContent) {
        out.push({ ...node, children });
      }
      continue;
    }

    if (!q || folderMatches || hasContent) {
      out.push({ ...node, children });
    }
  }

  return out;
}

function cloneFolderTree<T>(node: ExplorerFolderNode<T>): ExplorerFolderNode<T> {
  return {
    ...node,
    children: node.children.map(cloneFolderTree),
  };
}

export function filterExplorerTasks<T extends ExplorerNamedItem>(
  tasks: readonly T[],
  taskHasVisibleContent: ReadonlyMap<string, boolean>,
  options: ExplorerFilterOptions,
): T[] {
  const q = normalizeExplorerQuery(options.query);
  return tasks.filter((task) => {
    const matches = matchesExplorerQuery(task.name, q);
    const hasContent = taskHasVisibleContent.get(task.id) === true;
    if (!q && !options.starredOnly) return true;
    if (options.starredOnly && !q) return hasContent;
    return matches || hasContent;
  });
}

export function folderIsInStarredSubtree(
  folderId: string,
  parentById: ReadonlyMap<string, string | null>,
  starredFolderIds: ReadonlySet<string>,
): boolean {
  let cursor: string | null = folderId;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor)) {
    if (starredFolderIds.has(cursor)) return true;
    guard.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

export function explorerFilterEmptyMessage(
  starredOnly: boolean,
  query: string,
): string {
  const hasQuery = normalizeExplorerQuery(query).length > 0;
  if (starredOnly && hasQuery) {
    return "No matching starred tasks, files, or folders.";
  }
  if (starredOnly) return "No starred files or folders.";
  return "No matching tasks, files, or folders.";
}
