import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { applyPipelineSoftArchive } from "./pipelineArchiveApply";
import { assertOrgMember } from "./organizationAccess";
import { assertCanMutatePipelineRow } from "./resourceAccess";
import {
  AUTO_ARCHIVE_SWEEP_BATCH,
  dueIndexPatchWhenNotActuallyDue,
  isAutoArchiveDue,
  lastPipelineActivityAt,
} from "../lib/pipelineAutoArchive";

const sweepResultV = v.object({
  ok: v.literal(true),
  now: v.number(),
  archived: v.number(),
  rescheduled: v.number(),
  skipped: v.number(),
  hasMore: v.boolean(),
  chained: v.literal(false),
});

type SweepResult = {
  ok: true;
  now: number;
  archived: number;
  rescheduled: number;
  skipped: number;
  hasMore: boolean;
  chained: false;
};

async function runDueAutoArchiveBatch(
  ctx: MutationCtx,
  args: {
    now: number;
    organizationId: Id<"organizations">;
    memberUserKey: string | undefined;
  },
): Promise<SweepResult> {
  const { now, organizationId, memberUserKey } = args;
  const candidates = await ctx.db
    .query("pipeline")
    .withIndex("by_org_autoArchiveAfter", (q) =>
      q.eq("organizationId", organizationId).lte("autoArchiveAfterAt", now),
    )
    .take(AUTO_ARCHIVE_SWEEP_BATCH);

  let archived = 0;
  let rescheduled = 0;
  let skipped = 0;

  for (const row of candidates) {
    const applied = await applyDueAutoArchiveRow(ctx, row, now, memberUserKey);
    archived += applied.archived;
    rescheduled += applied.rescheduled;
    skipped += applied.skipped;
  }

  return {
    ok: true,
    now,
    archived,
    rescheduled,
    skipped,
    hasMore: candidates.length >= AUTO_ARCHIVE_SWEEP_BATCH,
    chained: false,
  };
}

async function applyDueAutoArchiveRow(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  now: number,
  memberUserKey: string | undefined,
): Promise<{ archived: number; rescheduled: number; skipped: number }> {
  if (row.archivedAt != null) {
    await ctx.db.patch(row._id, {
      autoArchiveInactivityDays: undefined,
      autoArchiveAfterAt: undefined,
    });
    return { archived: 0, rescheduled: 0, skipped: 1 };
  }
  const days = row.autoArchiveInactivityDays;
  if (days == null) {
    await ctx.db.patch(row._id, { autoArchiveAfterAt: undefined });
    return { archived: 0, rescheduled: 0, skipped: 1 };
  }
  const lastActivityAt = lastPipelineActivityAt(row);
  if (
    !isAutoArchiveDue({
      now,
      lastActivityAt,
      inactivityDays: days,
      archivedAt: row.archivedAt,
    })
  ) {
    const patch = dueIndexPatchWhenNotActuallyDue({
      now,
      lastActivityAt,
      inactivityDays: days,
    });
    if (patch.kind === "reschedule") {
      await ctx.db.patch(row._id, { autoArchiveAfterAt: patch.autoArchiveAfterAt });
      return { archived: 0, rescheduled: 1, skipped: 0 };
    }
    await ctx.db.patch(row._id, { autoArchiveAfterAt: undefined });
    return { archived: 0, rescheduled: 0, skipped: 1 };
  }

  try {
    await assertCanMutatePipelineRow(ctx, row, memberUserKey, "auto_archive");
  } catch {
    return { archived: 0, rescheduled: 0, skipped: 1 };
  }

  await applyPipelineSoftArchive(ctx, row, now);
  return { archived: 1, rescheduled: 0, skipped: 0 };
}

/**
 * Backlog sink for the old cron / `runAfter(0)` chain.
 * Intentionally a no-op: do not scan, do not archive, do not reschedule.
 * Real work is `runDueAutoArchives` (user click only).
 */
export const sweepDueAutoArchives = internalMutation({
  args: {
    now: v.optional(v.number()),
  },
  returns: sweepResultV,
  handler: async (_ctx, args): Promise<SweepResult> => {
    const now =
      typeof args.now === "number" && Number.isFinite(args.now)
        ? args.now
        : 0;
    return {
      ok: true,
      now,
      archived: 0,
      rescheduled: 0,
      skipped: 0,
      hasMore: false,
      chained: false,
    };
  },
});

/**
 * Archive files whose inactivity timer has elapsed — one small indexed page.
 * Call only from the Pipeline hub “Run auto-archive now” control.
 */
export const runDueAutoArchives = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: sweepResultV,
  handler: async (ctx, args): Promise<SweepResult> => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey ?? "");
    const now =
      typeof args.now === "number" && Number.isFinite(args.now)
        ? args.now
        : Date.now();
    return await runDueAutoArchiveBatch(ctx, {
      now,
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
    });
  },
});
