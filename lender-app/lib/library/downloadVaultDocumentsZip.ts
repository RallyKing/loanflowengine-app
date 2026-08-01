import JSZip from "jszip";
import type { Id } from "@/convex/_generated/dataModel";

export type VaultDownloadItem = {
  documentId: Id<"libraryDocuments">;
  versionId: Id<"libraryDocumentVersions">;
  fileName: string;
  url: string;
  /** Nested path inside the ZIP (e.g. `Tax Returns/2024/doc.pdf`). */
  zipPath?: string;
};

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

export async function downloadVaultDocumentsZip(
  items: VaultDownloadItem[],
  zipName = "vault-documents.zip",
): Promise<void> {
  if (items.length === 0) throw new Error("No files to download.");
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
      item.fileName.trim() ||
      `document-${item.documentId}`;
    const path = dedupeZipPath(rawPath, usedPaths);
    zip.file(path, buf);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(href);
}
