/**
 * Shared one-shot schedule helpers for Time Alerts.
 * Used from pipeline / tasks / vault mutations — not a public API.
 */

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildAlertDedupeKey } from "../lib/alerts/dedupe";
import {
  parseSnoozedUntilMs,
  shouldScheduleOneShot,
} from "../lib/alerts/fireValidity";
import {
  fileSnoozeDeepLink,
  hubTaskDeepLink,
  vaultFileTaskDeepLink,
} from "../lib/alerts/internalPath";

async function cancelJob(
  ctx: MutationCtx,
  jobId: Id<"_scheduled_functions"> | undefined,
): Promise<void> {
  if (!jobId) return;
  try {
    await ctx.scheduler.cancel(jobId);
  } catch {
    // Already finished or cancelled — ignore.
  }
}

export async function clearPipelineSnoozeAlert(
  ctx: MutationCtx,
  pipelineId: Id<"pipeline">,
): Promise<void> {
  const row = await ctx.db.get(pipelineId);
  if (!row) return;
  await cancelJob(ctx, row.snoozeAlertJobId);
  if (
    row.snoozeAlertJobId != null ||
    row.snoozeAlertUserKey != null ||
    row.snoozeAlertFireAt != null
  ) {
    await ctx.db.patch(pipelineId, {
      snoozeAlertJobId: undefined,
      snoozeAlertUserKey: undefined,
      snoozeAlertFireAt: undefined,
    });
  }
}

export async function schedulePipelineSnoozeAlert(
  ctx: MutationCtx,
  args: {
    pipelineId: Id<"pipeline">;
    userKey: string;
    orgId: Id<"organizations">;
    snoozedUntil: string | number;
    fileLabel?: string;
  },
): Promise<void> {
  const userKey = args.userKey.trim();
  if (!userKey) return;
  const fireAt = parseSnoozedUntilMs(args.snoozedUntil);
  if (fireAt == null) {
    await clearPipelineSnoozeAlert(ctx, args.pipelineId);
    return;
  }
  const now = Date.now();
  const plan = shouldScheduleOneShot({ fireAt, now });
  if (!plan) {
    await clearPipelineSnoozeAlert(ctx, args.pipelineId);
    return;
  }
  // Live snooze writes are always future (mutation clears past). Backfill may
  // pass past fireAt — schedule immediate runAt(now) once (dedupeKey holds).
  const runAt = plan.kind === "future" ? fireAt : now;

  const row = await ctx.db.get(args.pipelineId);
  if (!row) return;
  if (
    row.snoozeAlertJobId &&
    row.snoozeAlertFireAt === fireAt &&
    row.snoozeAlertUserKey === userKey
  ) {
    return;
  }
  await cancelJob(ctx, row.snoozeAlertJobId);

  const entityId = String(args.pipelineId);
  const dedupeKey = buildAlertDedupeKey({
    userKey,
    category: "file_snooze_due",
    entityType: "pipeline",
    entityId,
    fireAt,
  });
  const title = args.fileLabel?.trim()
    ? `Snooze ended: ${args.fileLabel.trim()}`
    : "Pipeline file snooze ended";
  const deepLinkPath = fileSnoozeDeepLink(entityId);

  const jobId = await ctx.scheduler.runAt(
    runAt,
    internal.alerts.fireFileSnoozeDue,
    {
      pipelineId: args.pipelineId,
      userKey,
      orgId: args.orgId,
      fireAt,
      dedupeKey,
      title,
      deepLinkPath,
    },
  );

  await ctx.db.patch(args.pipelineId, {
    snoozeAlertJobId: jobId,
    snoozeAlertUserKey: userKey,
    snoozeAlertFireAt: fireAt,
  });
}

export async function clearHubTaskDueAlert(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  const row = await ctx.db.get(taskId);
  if (!row) return;
  await cancelJob(ctx, row.dueAlertJobId);
  if (
    row.dueAlertJobId != null ||
    row.dueAlertUserKey != null ||
    row.dueAlertFireAt != null
  ) {
    await ctx.db.patch(taskId, {
      dueAlertJobId: undefined,
      dueAlertUserKey: undefined,
      dueAlertFireAt: undefined,
    });
  }
}

export async function scheduleHubTaskDueAlert(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
    dueDate: number | null | undefined;
    title?: string;
  },
): Promise<void> {
  const userKey = args.userKey.trim();
  if (!userKey) return;
  if (args.dueDate == null || !Number.isFinite(args.dueDate)) {
    await clearHubTaskDueAlert(ctx, args.taskId);
    return;
  }
  const fireAt = Math.trunc(args.dueDate);
  const row = await ctx.db.get(args.taskId);
  if (!row) return;
  if (row.status === "done" || row.status === "archived") {
    await clearHubTaskDueAlert(ctx, args.taskId);
    return;
  }

  if (
    row.dueAlertJobId &&
    row.dueAlertFireAt === fireAt &&
    row.dueAlertUserKey === userKey
  ) {
    return;
  }
  await cancelJob(ctx, row.dueAlertJobId);

  const now = Date.now();
  const runAt = fireAt > now ? fireAt : now;
  const entityId = String(args.taskId);
  const dedupeKey = buildAlertDedupeKey({
    userKey,
    category: "task_due",
    entityType: "task",
    entityId,
    fireAt,
  });
  const label = args.title?.trim() || row.title.trim() || "Task";
  const title = `Due: ${label}`;
  const deepLinkPath = hubTaskDeepLink(entityId);

  const jobId = await ctx.scheduler.runAt(runAt, internal.alerts.fireTaskDue, {
    kind: "hub_task",
    taskId: args.taskId,
    userKey,
    orgId: args.orgId,
    fireAt,
    dedupeKey,
    title,
    deepLinkPath,
  });

  await ctx.db.patch(args.taskId, {
    dueAlertJobId: jobId,
    dueAlertUserKey: userKey,
    dueAlertFireAt: fireAt,
  });
}

export async function clearVaultFileTaskDueAlert(
  ctx: MutationCtx,
  fileTaskId: Id<"documentVaultFileTasks">,
): Promise<void> {
  const row = await ctx.db.get(fileTaskId);
  if (!row) return;
  await cancelJob(ctx, row.dueAlertJobId);
  if (
    row.dueAlertJobId != null ||
    row.dueAlertUserKey != null ||
    row.dueAlertFireAt != null
  ) {
    await ctx.db.patch(fileTaskId, {
      dueAlertJobId: undefined,
      dueAlertUserKey: undefined,
      dueAlertFireAt: undefined,
    });
  }
}

export async function scheduleVaultFileTaskDueAlert(
  ctx: MutationCtx,
  args: {
    fileTaskId: Id<"documentVaultFileTasks">;
    userKey: string;
    orgId: Id<"organizations">;
    dueDate: number | null | undefined;
    title?: string;
  },
): Promise<void> {
  const userKey = args.userKey.trim();
  if (!userKey) return;
  if (args.dueDate == null || !Number.isFinite(args.dueDate)) {
    await clearVaultFileTaskDueAlert(ctx, args.fileTaskId);
    return;
  }
  const fireAt = Math.trunc(args.dueDate);
  const row = await ctx.db.get(args.fileTaskId);
  if (!row) return;
  if (row.isArchived || row.status === "complete") {
    await clearVaultFileTaskDueAlert(ctx, args.fileTaskId);
    return;
  }

  if (
    row.dueAlertJobId &&
    row.dueAlertFireAt === fireAt &&
    row.dueAlertUserKey === userKey
  ) {
    return;
  }
  await cancelJob(ctx, row.dueAlertJobId);

  const now = Date.now();
  const runAt = fireAt > now ? fireAt : now;
  const entityId = String(args.fileTaskId);
  const dedupeKey = buildAlertDedupeKey({
    userKey,
    category: "task_due",
    entityType: "documentVaultFileTask",
    entityId,
    fireAt,
  });
  const label = args.title?.trim() || row.title.trim() || "File task";
  const title = `Due: ${label}`;
  const deepLinkPath = vaultFileTaskDeepLink(String(row.pipelineFileId));

  const jobId = await ctx.scheduler.runAt(runAt, internal.alerts.fireTaskDue, {
    kind: "vault_file_task",
    fileTaskId: args.fileTaskId,
    userKey,
    orgId: args.orgId,
    fireAt,
    dedupeKey,
    title,
    deepLinkPath,
  });

  await ctx.db.patch(args.fileTaskId, {
    dueAlertJobId: jobId,
    dueAlertUserKey: userKey,
    dueAlertFireAt: fireAt,
  });
}

/**
 * Load hub task and schedule or clear due alert from current row state.
 * Call after create/update/complete/delete mutations (authenticated userKey only).
 */
export async function syncHubTaskDueAlert(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
  },
): Promise<void> {
  const row = await ctx.db.get(args.taskId);
  if (!row) {
    await clearHubTaskDueAlert(ctx, args.taskId);
    return;
  }
  await scheduleHubTaskDueAlert(ctx, {
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    dueDate: row.dueDate,
    title: row.title,
  });
}

/**
 * Load vault file-task and schedule or clear due alert from current row state.
 */
export async function syncVaultFileTaskDueAlert(
  ctx: MutationCtx,
  args: {
    fileTaskId: Id<"documentVaultFileTasks">;
    userKey: string;
    orgId: Id<"organizations">;
  },
): Promise<void> {
  const row = await ctx.db.get(args.fileTaskId);
  if (!row) {
    await clearVaultFileTaskDueAlert(ctx, args.fileTaskId);
    return;
  }
  await scheduleVaultFileTaskDueAlert(ctx, {
    fileTaskId: args.fileTaskId,
    userKey: args.userKey,
    orgId: args.orgId,
    dueDate: row.dueDate,
    title: row.title,
  });
}
