import type { Id } from "@/convex/_generated/dataModel";
import {
  buildFolderBreadcrumbs,
  type DocumentFolderRow,
} from "@/lib/library/documentVaultFolders";

/** Safe single path segment for ZIP archives (no slashes or illegal chars). */
export function sanitizeZipPathSegment(name: string): string {
  const trimmed = name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
  return trimmed || "untitled";
}

/**
 * Build a nested ZIP entry path that mirrors vault folder hierarchy.
 * Example: `Tax Returns/2024/W-2.pdf`
 */
export function buildVaultDocumentZipPath(
  folders: DocumentFolderRow[],
  folderId: Id<"documentFolders"> | null | undefined,
  fileName: string,
  rootLabel = "Root",
): string {
  const segments: string[] = [];
  if (folderId) {
    const crumbs = buildFolderBreadcrumbs(folders, folderId, rootLabel);
    for (const crumb of crumbs) {
      if (crumb.id != null) {
        segments.push(sanitizeZipPathSegment(crumb.name));
      }
    }
  }
  segments.push(sanitizeZipPathSegment(fileName));
  return segments.join("/");
}

/**
 * ZIP path for a folder download: folder name is the archive root, nested
 * structure under it is preserved. Example downloading "Tax Returns":
 * `Tax Returns/2024/W-2s/john-w2.pdf`
 */
export function buildVaultFolderSubtreeZipPath(
  folders: DocumentFolderRow[],
  rootFolderId: Id<"documentFolders">,
  documentFolderId: Id<"documentFolders"> | null | undefined,
  fileName: string,
): string {
  const rootFolder = folders.find((f) => f._id === rootFolderId);
  const rootName = sanitizeZipPathSegment(rootFolder?.name ?? "folder");
  const safeFile = sanitizeZipPathSegment(fileName);

  if (!documentFolderId || documentFolderId === rootFolderId) {
    return `${rootName}/${safeFile}`;
  }

  const crumbs = buildFolderBreadcrumbs(folders, documentFolderId, "");
  const startIdx = crumbs.findIndex((c) => c.id === rootFolderId);
  if (startIdx < 0) {
    return `${rootName}/${safeFile}`;
  }
  const segments = crumbs
    .slice(startIdx)
    .filter((c) => c.id != null)
    .map((c) => sanitizeZipPathSegment(c.name));
  segments.push(safeFile);
  return segments.join("/");
}
