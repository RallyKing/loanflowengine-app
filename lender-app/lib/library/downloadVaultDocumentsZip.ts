import JSZip from "jszip";
import type { Id } from "@/convex/_generated/dataModel";
import { downloadBlob } from "@/lib/export/downloadClient";

/** Generic remote file for ZIP / single download (lender docs, vault, delivery). */
export type RemoteZipFile = {
  fileName: string;
  url: string;
  /** Nested path inside the ZIP (e.g. `Tax Returns/2024/doc.pdf`). */
  zipPath?: string;
};

export type VaultDownloadItem = RemoteZipFile & {
  documentId: Id<"libraryDocuments">;
  versionId: Id<"libraryDocumentVersions">;
};

/** Deduplicate ZIP entry paths (`a.pdf`, `a (1).pdf`, …). Exported for unit tests. */
export function dedupeZipPath(path: string, used: Set<string>): string {
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

function safeDownloadName(name: string, fallback: string): string {
  const cleaned = name.replace(/[/\\]/g, "").trim();
  return cleaned || fallback;
}

/** Fetch a Convex storage (or other) URL and trigger a browser download with the given name. */
export async function downloadRemoteFile(
  url: string,
  fileName: string,
): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${fileName} (${res.status})`);
  }
  const blob = await res.blob();
  downloadBlob(blob, safeDownloadName(fileName, "download"));
}

export type ZipDownloadProgress = {
  completed: number;
  total: number;
  currentFileName: string;
};

/**
 * ZIP selected remote files and download. Same JSZip path used by Document Vault bulk download.
 */
export async function downloadRemoteFilesZip(
  items: RemoteZipFile[],
  zipName = "documents.zip",
  onProgress?: (progress: ZipDownloadProgress) => void,
): Promise<void> {
  if (items.length === 0) throw new Error("No files to download.");
  const zip = new JSZip();
  const usedPaths = new Set<string>();
  const total = items.length;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    onProgress?.({
      completed: i,
      total,
      currentFileName: item.fileName,
    });
    const res = await fetch(item.url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${item.fileName} (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const rawPath =
      item.zipPath?.trim() ||
      item.fileName.trim() ||
      "document";
    const path = dedupeZipPath(rawPath, usedPaths);
    zip.file(path, buf);
  }

  onProgress?.({
    completed: total,
    total,
    currentFileName: zipName,
  });
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, safeDownloadName(zipName, "documents.zip"));
}

export async function downloadVaultDocumentsZip(
  items: VaultDownloadItem[],
  zipName = "vault-documents.zip",
  onProgress?: (progress: ZipDownloadProgress) => void,
): Promise<void> {
  await downloadRemoteFilesZip(
    items.map((item) => ({
      fileName: item.fileName,
      url: item.url,
      zipPath:
        item.zipPath?.trim() ||
        item.fileName.trim() ||
        `document-${item.documentId}`,
    })),
    zipName,
    onProgress,
  );
}
