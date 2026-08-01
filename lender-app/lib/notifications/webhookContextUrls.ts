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
export function brokerDocumentVaultUrl(pipelineFileId: Id<"pipeline"> | string): string {
  const id = String(pipelineFileId);
  return `${brokerAppOrigin()}/pipeline/${encodeURIComponent(id)}#pipeline-documents-vault`;
}
