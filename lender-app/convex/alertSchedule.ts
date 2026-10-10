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
  resolveHubTaskDueAlertFireAt,
  resolveHubTaskScheduleAlertFireAt,
  resolveHubTaskSnoozeAlertFireAt,
  shouldScheduleOneShot,
} from "../lib/alerts/fireValidity";
import {
  assertInternalAppPath,
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

/**
 * Resolve the pipeline file for a hub task so Reminders open the file
 * workspace (not `/tasks`). Prefer `relatedFileId`, then a `fileTasks` edge.
 */
export async function resolveHubTaskPipelineFileId(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<Id<"pipeline"> | null> {
  const row = await ctx.db.get(taskId);
  if (!row) return null;
  if (row.relatedFileId) return row.relatedFileId;
  // bounded: at most one edge lookup for deep-link resolution
  const edge = await ctx.db
    .query("fileTasks")
    .withIndex("by_entity", (q) => q.eq("taskId", taskId))
    .first();
  return edge?.fileId ?? null;
}

/** Canonical deep link for a hub task reminder (file workspace when linked). */
export async function resolveHubTaskDeepLinkPath(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<string> {
  const fileId = await resolveHubTaskPipelineFileId(ctx, taskId);
  if (fileId) {
    return hubTaskDeepLink(String(fileId), String(taskId));
  }
  // Orphan task with no file link — Tasks page is the only safe surface.
  return assertInternalAppPath(
    `/tasks?task=${encodeURIComponent(String(taskId))}`,
  );
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

type HubTaskAlertKind = "due" | "scheduled" | "snooze";

async function clearHubTaskOneShot(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  kind: HubTaskAlertKind,
): Promise<void> {
  const row = await ctx.db.get(taskId);
  if (!row) return;
  if (kind === "due") {
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
    return;
  }
  if (kind === "scheduled") {
    await cancelJob(ctx, row.scheduleAlertJobId);
    if (
      row.scheduleAlertJobId != null ||
      row.scheduleAlertUserKey != null ||
      row.scheduleAlertFireAt != null
    ) {
      await ctx.db.patch(taskId, {
        scheduleAlertJobId: undefined,
        scheduleAlertUserKey: undefined,
        scheduleAlertFireAt: undefined,
      });
    }
    return;
  }
  await cancelJob(ctx, row.snoozeAlertJobId);
  if (
    row.snoozeAlertJobId != null ||
    row.snoozeAlertUserKey != null ||
    row.snoozeAlertFireAt != null
  ) {
    await ctx.db.patch(taskId, {
      snoozeAlertJobId: undefined,
      snoozeAlertUserKey: undefined,
      snoozeAlertFireAt: undefined,
    });
  }
}

export async function clearHubTaskDueAlert(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  await clearHubTaskOneShot(ctx, taskId, "due");
}

export async function clearHubTaskScheduleAlert(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  await clearHubTaskOneShot(ctx, taskId, "scheduled");
}

export async function clearHubTaskSnoozeAlert(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  await clearHubTaskOneShot(ctx, taskId, "snooze");
}

/** Clear due/reminder, triage schedule, and snooze-wake one-shots. */
export async function clearHubTaskAlerts(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  await clearHubTaskOneShot(ctx, taskId, "due");
  await clearHubTaskOneShot(ctx, taskId, "scheduled");
  await clearHubTaskOneShot(ctx, taskId, "snooze");
}

async function scheduleHubTaskOneShot(
  ctx: MutationCtx,
  args: {
    kind: HubTaskAlertKind;
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
    fireAt: number | null;
    title?: string;
    /** When kind=due, used to choose "Due:" vs "Reminder:" title. */
    dueDate?: number | null;
  },
): Promise<void> {
  const userKey = args.userKey.trim();
  if (!userKey) return;
  if (args.fireAt == null) {
    await clearHubTaskOneShot(ctx, args.taskId, args.kind);
    return;
  }
  const fireAt = args.fireAt;
  const row = await ctx.db.get(args.taskId);
  if (!row) return;
  if (row.status === "done" || row.status === "archived") {
    await clearHubTaskOneShot(ctx, args.taskId, args.kind);
    return;
  }

  const existingJobId =
    args.kind === "due"
      ? row.dueAlertJobId
      : args.kind === "scheduled"
        ? row.scheduleAlertJobId
        : row.snoozeAlertJobId;
  const existingFireAt =
    args.kind === "due"
      ? row.dueAlertFireAt
      : args.kind === "scheduled"
        ? row.scheduleAlertFireAt
        : row.snoozeAlertFireAt;
  const existingUserKey =
    args.kind === "due"
      ? row.dueAlertUserKey
      : args.kind === "scheduled"
        ? row.scheduleAlertUserKey
        : row.snoozeAlertUserKey;
  if (
    existingJobId &&
    existingFireAt === fireAt &&
    existingUserKey === userKey
  ) {
    return;
  }
  await cancelJob(ctx, existingJobId);

  const now = Date.now();
  const runAt = fireAt > now ? fireAt : now;
  const entityId = String(args.taskId);
  const category =
    args.kind === "due"
      ? "task_due"
      : args.kind === "scheduled"
        ? "task_scheduled"
        : "file_snooze_due";
  const dedupeKey = buildAlertDedupeKey({
    userKey,
    category,
    entityType: "task",
    entityId,
    fireAt,
  });
  const label = args.title?.trim() || row.title.trim() || "Task";
  const title =
    args.kind === "scheduled"
      ? `Scheduled: ${label}`
      : args.kind === "snooze"
        ? `Snooze ended: ${label}`
        : (() => {
            const dueMatches =
              args.dueDate != null &&
              Number.isFinite(args.dueDate) &&
              Math.abs(Math.trunc(args.dueDate) - fireAt) <= 1000;
            return `${dueMatches ? "Due" : "Reminder"}: ${label}`;
          })();
  const deepLinkPath = await resolveHubTaskDeepLinkPath(ctx, args.taskId);

  const jobId =
    args.kind === "due"
      ? await ctx.scheduler.runAt(runAt, internal.alerts.fireTaskDue, {
          kind: "hub_task",
          taskId: args.taskId,
          userKey,
          orgId: args.orgId,
          fireAt,
          dedupeKey,
          title,
          deepLinkPath,
        })
      : args.kind === "scheduled"
        ? await ctx.scheduler.runAt(runAt, internal.alerts.fireTaskScheduled, {
            taskId: args.taskId,
            userKey,
            orgId: args.orgId,
            fireAt,
            dedupeKey,
            title,
            deepLinkPath,
          })
        : await ctx.scheduler.runAt(runAt, internal.alerts.fireTaskSnoozeDue, {
            taskId: args.taskId,
            userKey,
            orgId: args.orgId,
            fireAt,
            dedupeKey,
            title,
            deepLinkPath,
          });

  if (args.kind === "due") {
    await ctx.db.patch(args.taskId, {
      dueAlertJobId: jobId,
      dueAlertUserKey: userKey,
      dueAlertFireAt: fireAt,
    });
  } else if (args.kind === "scheduled") {
    await ctx.db.patch(args.taskId, {
      scheduleAlertJobId: jobId,
      scheduleAlertUserKey: userKey,
      scheduleAlertFireAt: fireAt,
    });
  } else {
    await ctx.db.patch(args.taskId, {
      snoozeAlertJobId: jobId,
      snoozeAlertUserKey: userKey,
      snoozeAlertFireAt: fireAt,
    });
  }
}

export async function scheduleHubTaskDueAlert(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
    dueDate?: number | null;
    reminderAt?: number | null;
    title?: string;
  },
): Promise<void> {
  await scheduleHubTaskOneShot(ctx, {
    kind: "due",
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    fireAt: resolveHubTaskDueAlertFireAt({
      dueDate: args.dueDate,
      reminderAt: args.reminderAt,
    }),
    title: args.title,
    dueDate: args.dueDate,
  });
}

/**
 * One-shot for in-file triage `scheduledTriggerTime` — distinct category/title
 * from classic dueDate / reminderAt (`task_due`).
 */
export async function scheduleHubTaskScheduleAlert(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
    scheduledTriggerTime?: number | null;
    title?: string;
  },
): Promise<void> {
  await scheduleHubTaskOneShot(ctx, {
    kind: "scheduled",
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    fireAt: resolveHubTaskScheduleAlertFireAt({
      scheduledTriggerTime: args.scheduledTriggerTime,
    }),
    title: args.title,
  });
}

/**
 * One-shot for hub task `snoozedUntil` wake — same Reminders category as
 * pipeline file snooze (`file_snooze_due`) so the Snooze tab + prefs apply.
 */
export async function scheduleHubTaskSnoozeAlert(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
    snoozedUntil?: number | null;
    title?: string;
  },
): Promise<void> {
  await scheduleHubTaskOneShot(ctx, {
    kind: "snooze",
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    fireAt: resolveHubTaskSnoozeAlertFireAt({
      snoozedUntil: args.snoozedUntil,
    }),
    title: args.title,
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
 * Load hub task and schedule or clear due + schedule + snooze alerts.
 * Call after create/update/complete/delete/snooze/wake mutations.
 */
export async function syncHubTaskAlerts(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
  },
): Promise<void> {
  const row = await ctx.db.get(args.taskId);
  if (!row) {
    await clearHubTaskAlerts(ctx, args.taskId);
    return;
  }
  await scheduleHubTaskDueAlert(ctx, {
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    dueDate: row.dueDate,
    reminderAt: row.reminderAt,
    title: row.title,
  });
  await scheduleHubTaskScheduleAlert(ctx, {
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    scheduledTriggerTime: row.scheduledTriggerTime,
    title: row.title,
  });
  await scheduleHubTaskSnoozeAlert(ctx, {
    taskId: args.taskId,
    userKey: args.userKey,
    orgId: args.orgId,
    snoozedUntil: row.snoozedUntil,
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
