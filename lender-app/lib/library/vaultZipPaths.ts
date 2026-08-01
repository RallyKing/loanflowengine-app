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
