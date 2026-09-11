import type { Id } from "@/convex/_generated/dataModel";

/** Broker-facing app origin for deep links in webhook payloads. */
export function brokerAppOrigin(): string {
  const fromEnv =
    process.env.APP_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (fromEnv) {
    const withScheme = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    return withScheme.replace(/\/$/, "");
  }
  return "https://dlcfunds.vercel.app";
}

/** Direct link to the broker Document Vault tab for a pipeline file. */
export function brokerDocumentVaultUrl(
  pipelineFileId: Id<"pipeline"> | string,
  documentId?: Id<"libraryDocuments"> | string,
): string {
  const id = String(pipelineFileId);
  const q = new URLSearchParams();
  q.set("tab", "documents");
  if (documentId) q.set("document", String(documentId));
  return `${brokerAppOrigin()}/pipeline/${encodeURIComponent(id)}?${q.toString()}`;
}
