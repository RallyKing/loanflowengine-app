import JSZip from "jszip";
import type { Id } from "@/convex/_generated/dataModel";

export type VaultDownloadItem = {
  documentId: Id<"libraryDocuments">;
  versionId: Id<"libraryDocumentVersions">;
  fileName: string;
  url: string;
};

export async function downloadVaultDocumentsZip(
  items: VaultDownloadItem[],
  zipName = "vault-documents.zip",
): Promise<void> {
  if (items.length === 0) throw new Error("No files to download.");
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of items) {
    const res = await fetch(item.url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${item.fileName} (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    let name = item.fileName.trim() || `document-${item.documentId}`;
    let suffix = 1;
    while (usedNames.has(name)) {
      const dot = name.lastIndexOf(".");
      if (dot > 0) {
        name = `${name.slice(0, dot)} (${suffix})${name.slice(dot)}`;
      } else {
        name = `${name} (${suffix})`;
      }
      suffix += 1;
    }
    usedNames.add(name);
    zip.file(name, buf);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(href);
}
