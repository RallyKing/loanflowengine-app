import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { pipelineDealName } from "./webhookEventHelpers";
import { getPipelineStatusInfo } from "../lib/pipelineStatus";

export type NotificationContextFields = {
  contextFileName?: string;
  contextContactName?: string;
  contextStageLabel?: string;
};

/**
 * Resolve deal / client / stage labels for alert inbox rows.
 * Used at write time (dispatch) and at read time (historical rows missing denormalized fields).
 */
export async function resolveNotificationContext(
  ctx: QueryCtx | MutationCtx,
  args: {
    fileId?: Id<"pipeline"> | undefined;
    taskId?: Id<"tasks"> | undefined;
    /** Prefer when caller already has the pipeline doc (avoids extra get). */
    pipeline?: Doc<"pipeline"> | null;
    /** Explicit contact/submitter override (e.g. portal upload email). */
    contactNameOverride?: string | undefined;
  },
): Promise<NotificationContextFields> {
  let pipeline = args.pipeline ?? null;
  if (!pipeline && args.fileId) {
    pipeline = await ctx.db.get(args.fileId);
  }
  if (!pipeline && args.taskId) {
    const task = await ctx.db.get(args.taskId);
    if (task?.relatedFileId) {
      pipeline = await ctx.db.get(task.relatedFileId);
    }
  }

  if (!pipeline) {
    const override = args.contactNameOverride?.trim();
    return override ? { contextContactName: override.slice(0, 120) } : {};
  }

  const contextFileName = pipelineDealName(pipeline).slice(0, 160);

  let contextContactName = args.contactNameOverride?.trim().slice(0, 120);
  if (!contextContactName && pipeline.clientId) {
    const client = await ctx.db.get(pipeline.clientId);
    if (client) {
      contextContactName =
        client.primaryContactName?.trim() ||
        client.displayName?.trim() ||
        undefined;
      if (contextContactName) {
        contextContactName = contextContactName.slice(0, 120);
      }
    }
  }
  if (!contextContactName) {
    const deal = pipeline.dealData;
    if (deal && typeof deal === "object" && !Array.isArray(deal)) {
      const record = deal as Record<string, unknown>;
      const borrower =
        (record.borrower as Record<string, unknown> | undefined)?.name ??
        record.borrowerName;
      if (typeof borrower === "string" && borrower.trim()) {
        contextContactName = borrower.trim().slice(0, 120);
      }
    }
  }

  let contextStageLabel: string | undefined;
  if (pipeline.stageId) {
    const stage = await ctx.db.get(pipeline.stageId);
    const name = stage?.name?.trim();
    if (name) contextStageLabel = name.slice(0, 80);
  }
  if (!contextStageLabel) {
    const status = pipeline.status?.trim();
    if (status) {
      contextStageLabel = getPipelineStatusInfo(status).label.slice(0, 80);
    }
  }

  return {
    contextFileName: contextFileName || undefined,
    contextContactName: contextContactName || undefined,
    contextStageLabel: contextStageLabel || undefined,
  };
}
