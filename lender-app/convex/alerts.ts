/**
 * Time Alerts — one-shot snooze/due reminders (separate from userNotifications).
 * Schedule via `alertSchedule.ts`; fire handlers re-validate source rows.
 */

import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAuthenticatedCaller } from "./callerAuth";
import {
  DEFAULT_ALERT_PREFERENCES,
  resolveAlertPreferences,
  shouldCreateInAppAlert,
  shouldSendPushAlert,
  type AlertCategory,
  type AlertPreferencesResolved,
} from "../lib/alerts/alertCategories";
import { assertInternalAppPath } from "../lib/alerts/internalPath";
import {
  isFileSnoozeAlertStillValid,
  isHubTaskDueAlertStillValid,
  isVaultFileTaskDueAlertStillValid,
  parseSnoozedUntilMs,
} from "../lib/alerts/fireValidity";
import {
  scheduleHubTaskDueAlert,
  schedulePipelineSnoozeAlert,
  scheduleVaultFileTaskDueAlert,
} from "./alertSchedule";

const UNREAD_BADGE_CAP = 100;
const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const BACKFILL_PAGE_MAX = 100;

const memberUserKeyArg = {
  memberUserKey: v.optional(v.string()),
};

async function assertCallerOwnsUserKey(
  ctx: QueryCtx | MutationCtx,
  userKey: string,
  memberUserKey: string | undefined,
): Promise<string> {
  const caller = await requireAuthenticatedCaller(ctx, memberUserKey);
  const target = userKey.trim();
  if (!target || caller !== target) {
    throw new Error("Unauthorized");
  }
  return caller;
}

function prefsFromDoc(
  row: Doc<"alertPreferences"> | null,
): AlertPreferencesResolved {
  if (!row) return DEFAULT_ALERT_PREFERENCES;
  return resolveAlertPreferences({
    file_snooze_due: {
      inApp: row.fileSnoozeDueInApp,
      push: row.fileSnoozeDuePush,
    },
    task_due: {
      inApp: row.taskDueInApp,
      push: row.taskDuePush,
    },
  });
}

async function loadAlertPrefs(
  ctx: MutationCtx | QueryCtx,
  userKey: string,
): Promise<AlertPreferencesResolved> {
  const row = await ctx.db
    .query("alertPreferences")
    .withIndex("by_userKey", (q) => q.eq("userKey", userKey.trim()))
    .first();
  return prefsFromDoc(row);
}

/** Web Push is not implemented — preference may be true but send is a no-op. */
function stubPushSend(args: {
  userKey: string;
  category: AlertCategory;
  title: string;
}): void {
  console.log(
    "[alerts] push stub (no Web Push infra)",
    JSON.stringify({
      userKeyPrefix: args.userKey.slice(0, 12),
      category: args.category,
      title: args.title.slice(0, 80),
    }),
  );
}

async function insertAlertIdempotent(
  ctx: MutationCtx,
  args: {
    userKey: string;
    orgId: Id<"organizations">;
    category: AlertCategory;
    title: string;
    body?: string;
    entityType: "pipeline" | "task" | "documentVaultFileTask";
    entityId: string;
    deepLinkPath: string;
    fireAt: number;
    dedupeKey: string;
  },
): Promise<Id<"alerts"> | null> {
  const userKey = args.userKey.trim();
  if (!userKey) return null;

  const prefs = await loadAlertPrefs(ctx, userKey);
  if (!shouldCreateInAppAlert(prefs, args.category)) {
    if (shouldSendPushAlert(prefs, args.category)) {
      stubPushSend({
        userKey,
        category: args.category,
        title: args.title,
      });
    }
    return null;
  }

  const dedupeKey = args.dedupeKey.trim();
  const existing = await ctx.db
    .query("alerts")
    .withIndex("by_dedupeKey", (q) =>
      q.eq("userKey", userKey).eq("dedupeKey", dedupeKey),
    )
    .first();
  if (existing) return existing._id;

  const deepLinkPath = assertInternalAppPath(args.deepLinkPath);
  const now = Date.now();
  const id = await ctx.db.insert("alerts", {
    userKey,
    orgId: args.orgId,
    category: args.category,
    title: args.title.slice(0, 500),
    body: args.body?.slice(0, 2000),
    entityType: args.entityType,
    entityId: args.entityId,
    deepLinkPath,
    fireAt: args.fireAt,
    createdAt: now,
    dedupeKey,
  });

  if (shouldSendPushAlert(prefs, args.category)) {
    stubPushSend({
      userKey,
      category: args.category,
      title: args.title,
    });
  }

  return id;
}

// ---------- Internal fire handlers ----------

export const fireFileSnoozeDue = internalMutation({
  args: {
    pipelineId: v.id("pipeline"),
    userKey: v.string(),
    orgId: v.id("organizations"),
    fireAt: v.number(),
    dedupeKey: v.string(),
    title: v.string(),
    deepLinkPath: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pipelineId);
    if (!row) return { inserted: false as const, reason: "missing" as const };
    if (
      !isFileSnoozeAlertStillValid({
        snoozedUntil: row.snoozedUntil,
        expectedFireAt: args.fireAt,
      })
    ) {
      console.warn(
        "[alerts] fireFileSnoozeDue stale",
        JSON.stringify({
          pipelineId: args.pipelineId,
          expectedFireAt: args.fireAt,
          snoozedUntil: row.snoozedUntil ?? null,
        }),
      );
      return { inserted: false as const, reason: "stale" as const };
    }
    if (
      row.snoozeAlertUserKey &&
      row.snoozeAlertUserKey.trim() !== args.userKey.trim()
    ) {
      return { inserted: false as const, reason: "user_mismatch" as const };
    }

    const id = await insertAlertIdempotent(ctx, {
      userKey: args.userKey,
      orgId: args.orgId,
      category: "file_snooze_due",
      title: args.title,
      body: args.body,
      entityType: "pipeline",
      entityId: String(args.pipelineId),
      deepLinkPath: args.deepLinkPath,
      fireAt: args.fireAt,
      dedupeKey: args.dedupeKey,
    });
    return {
      inserted: id != null,
      reason: id != null ? ("ok" as const) : ("skipped" as const),
    };
  },
});

export const fireTaskDue = internalMutation({
  args: {
    kind: v.union(v.literal("hub_task"), v.literal("vault_file_task")),
    taskId: v.optional(v.id("tasks")),
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    userKey: v.string(),
    orgId: v.id("organizations"),
    fireAt: v.number(),
    dedupeKey: v.string(),
    title: v.string(),
    deepLinkPath: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.kind === "hub_task") {
      if (!args.taskId) {
        return { inserted: false as const, reason: "missing" as const };
      }
      const row = await ctx.db.get(args.taskId);
      if (!row) return { inserted: false as const, reason: "missing" as const };
      if (
        !isHubTaskDueAlertStillValid({
          dueDate: row.dueDate,
          expectedFireAt: args.fireAt,
          status: row.status,
        })
      ) {
        return { inserted: false as const, reason: "stale" as const };
      }
      if (
        row.dueAlertUserKey &&
        row.dueAlertUserKey.trim() !== args.userKey.trim()
      ) {
        return { inserted: false as const, reason: "user_mismatch" as const };
      }
      const id = await insertAlertIdempotent(ctx, {
        userKey: args.userKey,
        orgId: args.orgId,
        category: "task_due",
        title: args.title,
        body: args.body,
        entityType: "task",
        entityId: String(args.taskId),
        deepLinkPath: args.deepLinkPath,
        fireAt: args.fireAt,
        dedupeKey: args.dedupeKey,
      });
      return {
        inserted: id != null,
        reason: id != null ? ("ok" as const) : ("skipped" as const),
      };
    }

    if (!args.fileTaskId) {
      return { inserted: false as const, reason: "missing" as const };
    }
    const row = await ctx.db.get(args.fileTaskId);
    if (!row) return { inserted: false as const, reason: "missing" as const };
    if (
      !isVaultFileTaskDueAlertStillValid({
        dueDate: row.dueDate,
        expectedFireAt: args.fireAt,
        status: row.status,
        isArchived: row.isArchived,
      })
    ) {
      return { inserted: false as const, reason: "stale" as const };
    }
    if (
      row.dueAlertUserKey &&
      row.dueAlertUserKey.trim() !== args.userKey.trim()
    ) {
      return { inserted: false as const, reason: "user_mismatch" as const };
    }
    const id = await insertAlertIdempotent(ctx, {
      userKey: args.userKey,
      orgId: args.orgId,
      category: "task_due",
      title: args.title,
      body: args.body,
      entityType: "documentVaultFileTask",
      entityId: String(args.fileTaskId),
      deepLinkPath: args.deepLinkPath,
      fireAt: args.fireAt,
      dedupeKey: args.dedupeKey,
    });
    return {
      inserted: id != null,
      reason: id != null ? ("ok" as const) : ("skipped" as const),
    };
  },
});

// ---------- Public queries / mutations (caller-scoped) ----------

export const unreadCountForUser = query({
  args: {
    userKey: v.string(),
    orgId: v.optional(v.id("organizations")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { userKey, orgId, memberUserKey }) => {
    const k = userKey.trim();
    if (!k) return { count: 0, capped: false as const };
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);

    // Unread rows have `readAt` absent — indexed as undefined.
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_user_unread", (q) =>
        q.eq("userKey", k).eq("readAt", undefined),
      )
      .take(UNREAD_BADGE_CAP);

    let count = 0;
    for (const r of rows) {
      if (r.dismissedAt != null) continue;
      if (orgId && r.orgId !== orgId) continue;
      count += 1;
    }
    return {
      count,
      capped: rows.length >= UNREAD_BADGE_CAP,
    };
  },
});

export const listForUser = query({
  args: {
    userKey: v.string(),
    orgId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
    includeDismissed: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const k = args.userKey.trim();
    if (!k) return [];
    await assertCallerOwnsUserKey(ctx, k, args.memberUserKey);
    const limit = Math.min(
      Math.max(1, args.limit ?? LIST_DEFAULT_LIMIT),
      LIST_MAX_LIMIT,
    );

    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(limit * 2);

    const out: Doc<"alerts">[] = [];
    for (const r of rows) {
      if (!args.includeDismissed && r.dismissedAt != null) continue;
      if (args.orgId && r.orgId !== args.orgId) continue;
      out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  },
});

export const markRead = mutation({
  args: {
    id: v.id("alerts"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    if (row.readAt != null) return;
    await ctx.db.patch(id, { readAt: Date.now() });
  },
});

export const markUnread = mutation({
  args: {
    id: v.id("alerts"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    if (row.readAt == null) return;
    await ctx.db.patch(id, { readAt: undefined });
  },
});

export const dismiss = mutation({
  args: {
    id: v.id("alerts"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    const now = Date.now();
    await ctx.db.patch(id, {
      dismissedAt: now,
      readAt: row.readAt ?? now,
    });
  },
});

export const setHiddenUntil = mutation({
  args: {
    id: v.id("alerts"),
    until: v.union(v.number(), v.null()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { id, until, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    await ctx.db.patch(id, {
      hiddenUntil: until === null ? undefined : until,
    });
  },
});

export const getPreferences = query({
  args: {
    userKey: v.string(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { userKey, memberUserKey }) => {
    const k = userKey.trim();
    if (!k) return DEFAULT_ALERT_PREFERENCES;
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);
    return await loadAlertPrefs(ctx, k);
  },
});

/**
 * One-shot self-test: schedule an in-app reminder that fires after `delayMs`
 * (clamped 2s–60s). Used to verify scheduler → fire → Reminders bell without
 * waiting for end-of-day file snooze.
 */
export const scheduleSelfTestReminder = mutation({
  args: {
    orgId: v.id("organizations"),
    delayMs: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const k = await requireAuthenticatedCaller(ctx, args.memberUserKey);
    const delay = Math.min(Math.max(args.delayMs ?? 5000, 2000), 60_000);
    const fireAt = Date.now() + delay;
    const dedupeKey = `self_test:${k}:${fireAt}`;
    await ctx.scheduler.runAt(fireAt, internal.alerts.fireSelfTestReminder, {
      userKey: k,
      orgId: args.orgId,
      fireAt,
      dedupeKey,
    });
    return { ok: true as const, fireAt, delayMs: delay };
  },
});

export const fireSelfTestReminder = internalMutation({
  args: {
    userKey: v.string(),
    orgId: v.id("organizations"),
    fireAt: v.number(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await insertAlertIdempotent(ctx, {
      userKey: args.userKey,
      orgId: args.orgId,
      category: "task_due",
      title: "Test reminder",
      body: "Self-test from Reminder preferences — the Reminders bell is working.",
      entityType: "task",
      entityId: `self_test:${args.fireAt}`,
      deepLinkPath: "/settings#reminders",
      fireAt: args.fireAt,
      dedupeKey: args.dedupeKey,
    });
    return {
      inserted: id != null,
      reason: id != null ? ("ok" as const) : ("skipped" as const),
    };
  },
});

const alertCategoryArg = v.union(
  v.literal("file_snooze_due"),
  v.literal("task_due"),
);
const alertChannelArg = v.union(v.literal("inApp"), v.literal("push"));

function prefsDocFromResolved(resolved: AlertPreferencesResolved) {
  return {
    fileSnoozeDueInApp: resolved.file_snooze_due.inApp,
    fileSnoozeDuePush: resolved.file_snooze_due.push,
    taskDueInApp: resolved.task_due.inApp,
    taskDuePush: resolved.task_due.push,
  };
}

/**
 * Upsert one category/channel preference. Storage stays flat on the document;
 * the public API matches the nested AlertCategory domain model.
 */
export const upsertPreferences = mutation({
  args: {
    userKey: v.string(),
    category: alertCategoryArg,
    channel: alertChannelArg,
    enabled: v.boolean(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const k = await assertCallerOwnsUserKey(
      ctx,
      args.userKey,
      args.memberUserKey,
    );
    const existing = await ctx.db
      .query("alertPreferences")
      .withIndex("by_userKey", (q) => q.eq("userKey", k))
      .first();
    const current = prefsFromDoc(existing);
    if (current[args.category][args.channel] === args.enabled) {
      return { ok: true as const, id: existing?._id ?? null };
    }
    const nextResolved: AlertPreferencesResolved = {
      ...current,
      [args.category]: {
        ...current[args.category],
        [args.channel]: args.enabled,
      },
    };
    const next = prefsDocFromResolved(nextResolved);
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...next,
        updatedAt: Date.now(),
      });
      return { ok: true as const, id: existing._id };
    }
    const id = await ctx.db.insert("alertPreferences", {
      userKey: k,
      ...next,
      updatedAt: Date.now(),
    });
    return { ok: true as const, id };
  },
});

// ---------- Bounded backfill (operator / one-shot; no self-reschedule pump) ----------

type BackfillPhase = "pipeline_snooze" | "hub_tasks" | "vault_file_tasks";

/**
 * Paginated one-shot backfill. Caller re-invokes with `continueCursor` until
 * `isDone` — never schedules itself via runAfter(0, self).
 */
export const backfillAlertSchedulesPage = internalMutation({
  args: {
    phase: v.union(
      v.literal("pipeline_snooze"),
      v.literal("hub_tasks"),
      v.literal("vault_file_tasks"),
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(
      Math.max(1, args.limit ?? 50),
      BACKFILL_PAGE_MAX,
    );
    const startCursor =
      args.cursor === undefined || args.cursor === null ? null : args.cursor;
    const now = Date.now();

    let scheduled = 0;
    let skipped = 0;
    let examined = 0;

    if (args.phase === "pipeline_snooze") {
      const { page, isDone, continueCursor } = await ctx.db
        .query("pipeline")
        .order("asc")
        .paginate({ numItems: pageSize, cursor: startCursor });
      examined = page.length;
      for (const row of page) {
        if (row.snoozedUntil == null) {
          skipped += 1;
          continue;
        }
        if (!row.organizationId) {
          skipped += 1;
          continue;
        }
        if (row.snoozeAlertJobId != null) {
          skipped += 1;
          continue;
        }
        const fireAt = parseSnoozedUntilMs(row.snoozedUntil);
        if (fireAt == null) {
          skipped += 1;
          continue;
        }
        const userKey = (
          row.snoozeAlertUserKey ??
          row.assigneeId ??
          ""
        ).trim();
        if (!userKey) {
          skipped += 1;
          continue;
        }
        // Future or past — one-shot path (past → runAt now; dedupeKey prevents re-fire).
        await schedulePipelineSnoozeAlert(ctx, {
          pipelineId: row._id,
          userKey,
          orgId: row.organizationId,
          snoozedUntil: row.snoozedUntil,
          fileLabel: row.fileName,
        });
        scheduled += 1;
      }
      return {
        phase: args.phase as BackfillPhase,
        examined,
        scheduled,
        skipped,
        isDone,
        continueCursor: isDone ? null : continueCursor,
      };
    }

    if (args.phase === "hub_tasks") {
      const { page, isDone, continueCursor } = await ctx.db
        .query("tasks")
        .withIndex("by_dueDate")
        .order("asc")
        .paginate({ numItems: pageSize, cursor: startCursor });
      examined = page.length;
      for (const row of page) {
        if (row.dueDate == null) {
          skipped += 1;
          continue;
        }
        if (!row.organizationId) {
          skipped += 1;
          continue;
        }
        if (row.status === "done" || row.status === "archived") {
          skipped += 1;
          continue;
        }
        if (row.dueAlertJobId != null) {
          skipped += 1;
          continue;
        }
        const userKey = (
          row.dueAlertUserKey ??
          row.ownerUserId ??
          row.assigneeId ??
          ""
        ).trim();
        if (!userKey) {
          skipped += 1;
          continue;
        }
        await scheduleHubTaskDueAlert(ctx, {
          taskId: row._id,
          userKey,
          orgId: row.organizationId,
          dueDate: row.dueDate,
          title: row.title,
        });
        scheduled += 1;
      }
      return {
        phase: args.phase as BackfillPhase,
        examined,
        scheduled,
        skipped,
        isDone,
        continueCursor: isDone ? null : continueCursor,
      };
    }

    // vault_file_tasks
    const { page, isDone, continueCursor } = await ctx.db
      .query("documentVaultFileTasks")
      .order("asc")
      .paginate({ numItems: pageSize, cursor: startCursor });
    examined = page.length;
    for (const row of page) {
      if (row.dueDate == null) {
        skipped += 1;
        continue;
      }
      if (row.isArchived || row.status === "complete") {
        skipped += 1;
        continue;
      }
      if (row.dueAlertJobId != null) {
        skipped += 1;
        continue;
      }
      const pipeline = await ctx.db.get(row.pipelineFileId);
      if (!pipeline?.organizationId) {
        skipped += 1;
        continue;
      }
      const userKey = (
        row.dueAlertUserKey ??
        row.createdByUserKey ??
        ""
      ).trim();
      if (!userKey || userKey === "__system__") {
        skipped += 1;
        continue;
      }
      await scheduleVaultFileTaskDueAlert(ctx, {
        fileTaskId: row._id,
        userKey,
        orgId: pipeline.organizationId,
        dueDate: row.dueDate,
        title: row.title,
      });
      scheduled += 1;
    }
    return {
      phase: args.phase as BackfillPhase,
      examined,
      scheduled,
      skipped,
      isDone,
      continueCursor: isDone ? null : continueCursor,
    };
  },
});

