import JSZip from "jszip";
import type { VaultDownloadItem } from "@/lib/library/downloadVaultDocumentsZip";

function dedupeZipPath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");
  let suffix = 1;
  let next = path;
  while (used.has(next)) {
    const nextBase =
      dot > 0
        ? `${base.slice(0, dot)} (${suffix})${base.slice(dot)}`
        : `${base} (${suffix})`;
    next = `${dir}${nextBase}`;
    suffix += 1;
  }
  used.add(next);
  return next;
}

/** Build a ZIP blob preserving `zipPath` hierarchy on each item. */
export async function compileVaultPackageZip(
  items: VaultDownloadItem[],
): Promise<Blob> {
  if (items.length === 0) throw new Error("No files to compile.");
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  for (const item of items) {
    const res = await fetch(item.url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${item.fileName} (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const rawPath =
      item.zipPath?.trim() ||
      sanitizeFallbackPath(item.fileName.trim() || `document-${item.documentId}`);
    const path = dedupeZipPath(rawPath, usedPaths);
    zip.file(path, buf);
  }

  return zip.generateAsync({ type: "blob" });
}

function sanitizeFallbackPath(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|]+/g, "_");
}
