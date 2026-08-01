import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { NotificationEventType } from "./notificationConstants";
import { brokerDocumentVaultUrl } from "../lib/notifications/webhookContextUrls";

/** Non-blocking fan-out entry point for product mutations. */
export async function scheduleWebhookQueueEvent(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations"> | undefined;
    event: NotificationEventType;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  if (!args.organizationId) return;
  await ctx.scheduler.runAfter(0, internal.webhookInternals.queueEvent, {
    organizationId: args.organizationId,
    event: args.event,
    data: args.data,
  });
}

export function pipelineDealName(
  pipeline: { fileName?: string; dealData?: unknown },
  fallback = "Deal",
): string {
  const fileName = pipeline.fileName?.trim();
  if (fileName) return fileName;
  const deal = pipeline.dealData;
  if (deal && typeof deal === "object" && !Array.isArray(deal)) {
    const record = deal as Record<string, unknown>;
    const borrower =
      (record.borrower as Record<string, unknown> | undefined)?.name ??
      record.borrowerName ??
      record.propertyAddress;
    if (typeof borrower === "string" && borrower.trim()) return borrower.trim();
  }
  return fallback;
}

export function webhookVaultContext(
  pipelineFileId: Id<"pipeline">,
  dealName: string,
): { dealName: string; documentVaultUrl: string; pipelineFileId: string } {
  return {
    dealName,
    documentVaultUrl: brokerDocumentVaultUrl(pipelineFileId),
    pipelineFileId: String(pipelineFileId),
  };
}
