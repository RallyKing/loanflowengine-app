import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

function scheduleOrgPipelineWebhook(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  eventType: string,
  fileId: Id<"pipeline">,
): void {
  if (!organizationId) return;
  void ctx.scheduler.runAfter(0, internal.webhookOutbound.emitOrgWebhookEvent, {
    organizationId,
    eventType,
    resourceType: "pipeline",
    resourceId: fileId,
  });
}

/**
 * Canonical soft-archive write (same fields as `pipeline.archive`).
 * Clears auto-archive-on-inactivity so the timer cannot re-fire.
 */
export async function applyPipelineSoftArchive(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  now: number,
): Promise<{ archivedAt: number; firstArchive: boolean }> {
  const firstArchive = row.archivedAt == null;
  await ctx.db.patch(row._id, {
    archivedAt: now,
    projectIntoLedger: undefined,
    autoArchiveInactivityDays: undefined,
    autoArchiveAfterAt: undefined,
    createdAt: row.createdAt,
    updatedAt: now,
  });
  if (row.organizationId && firstArchive) {
    scheduleOrgPipelineWebhook(
      ctx,
      row.organizationId,
      "pipeline.file.archived",
      row._id,
    );
  }
  return { archivedAt: now, firstArchive };
}
