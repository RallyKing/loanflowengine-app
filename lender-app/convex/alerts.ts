/**
 * Time Alerts — one-shot snooze/due reminders (separate from userNotifications).
 * Schedule via `alertSchedule.ts`; fire handlers re-validate source rows.
 */

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAuthenticatedCaller } from "./callerAuth";
import { assertOrgMember } from "./organizationAccess";
import {
  DEFAULT_ALERT_PREFERENCES,
  resolveAlertPreferences,
  shouldCreateInAppAlert,
  shouldSendPushAlert,
  type AlertCategory,
  type AlertPreferencesResolved,
} from "../lib/alerts/alertCategories";
import {
  assertInternalAppPath,
  isLegacyTasksPageDeepLink,
} from "../lib/alerts/internalPath";
import {
  isFileSnoozeAlertStillValid,
  isHubTaskDueAlertStillValid,
  isHubTaskScheduleAlertStillValid,
  isVaultFileTaskDueAlertStillValid,
  parseSnoozedUntilMs,
  resolveHubTaskDueAlertFireAt,
  resolveHubTaskScheduleAlertFireAt,
} from "../lib/alerts/fireValidity";
import {
  resolveHubTaskDeepLinkPath,
  schedulePipelineSnoozeAlert,
  scheduleVaultFileTaskDueAlert,
  syncHubTaskAlerts,
} from "./alertSchedule";

const UNREAD_BADGE_CAP = 100;
const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const BACKFILL_PAGE_MAX = 100;
/** Max unread rows cleared per `clearAllForUser` invocation (bounded; client may re-call). */
const CLEAR_ALL_PAGE = 100;
const CLEAR_ALL_MAX_PAGES = 5;
/** Max legacy `/tasks?task=` deep links repaired per `repairDeepLinksForUser` call. */
const REPAIR_DEEPLINK_PAGE = 50;
const REPAIR_DEEPLINK_MAX_PAGES = 4;

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
    task_scheduled: {
      // Legacy rows predate task_scheduled — inherit task_due channels.
      inApp: row.taskScheduledInApp ?? row.taskDueInApp,
      push: row.taskScheduledPush ?? row.taskDuePush,
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

async function scheduleTimeAlertPush(
  ctx: MutationCtx,
  alertId: Id<"alerts">,
): Promise<void> {
  // One-shot fan-out — never a polling pump. Action no-ops without VAPID/subs.
  await ctx.scheduler.runAfter(0, internal.webPushActions.trySendTimeAlertWebPush, {
    alertId,
  });
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
  const wantInApp = shouldCreateInAppAlert(prefs, args.category);
  const wantPush = shouldSendPushAlert(prefs, args.category);
  if (!wantInApp && !wantPush) return null;

  const dedupeKey = args.dedupeKey.trim();
  const existing = await ctx.db
    .query("alerts")
    .withIndex("by_dedupeKey", (q) =>
      q.eq("userKey", userKey).eq("dedupeKey", dedupeKey),
    )
    .first();
  if (existing) {
    if (wantPush && existing.pushDispatchedAt == null) {
      await scheduleTimeAlertPush(ctx, existing._id);
    }
    return existing._id;
  }

  const deepLinkPath = assertInternalAppPath(args.deepLinkPath);
  const now = Date.now();
  // Persist a row whenever either channel is on so push has an idempotent
  // stamp (`pushDispatchedAt`). Push-only rows are marked read so the
  // Reminders badge stays quiet.
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
    readAt: wantInApp ? undefined : now,
  });

  if (wantPush) {
    await scheduleTimeAlertPush(ctx, id);
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

async function fireHubTaskAlert(
  ctx: MutationCtx,
  args: {
    path: "due" | "scheduled";
    taskId: Id<"tasks">;
    userKey: string;
    orgId: Id<"organizations">;
    fireAt: number;
    dedupeKey: string;
    title: string;
    deepLinkPath: string;
    body?: string;
  },
): Promise<{
  inserted: boolean;
  reason: "missing" | "stale" | "user_mismatch" | "ok" | "skipped";
}> {
  const row = await ctx.db.get(args.taskId);
  if (!row) return { inserted: false, reason: "missing" };
  const stillValid =
    args.path === "due"
      ? isHubTaskDueAlertStillValid({
          dueDate: row.dueDate,
          reminderAt: row.reminderAt,
          expectedFireAt: args.fireAt,
          status: row.status,
        })
      : isHubTaskScheduleAlertStillValid({
          scheduledTriggerTime: row.scheduledTriggerTime,
          expectedFireAt: args.fireAt,
          status: row.status,
        });
  if (!stillValid) return { inserted: false, reason: "stale" };
  const storedUserKey =
    args.path === "due" ? row.dueAlertUserKey : row.scheduleAlertUserKey;
  if (storedUserKey && storedUserKey.trim() !== args.userKey.trim()) {
    return { inserted: false, reason: "user_mismatch" };
  }
  // Prefer file-workspace link even when the scheduled job still carries a
  // legacy `/tasks?task=` path (jobs scheduled before the deep-link fix).
  const deepLinkPath = await resolveHubTaskDeepLinkPath(ctx, args.taskId);
  const id = await insertAlertIdempotent(ctx, {
    userKey: args.userKey,
    orgId: args.orgId,
    category: args.path === "due" ? "task_due" : "task_scheduled",
    title: args.title,
    body: args.body,
    entityType: "task",
    entityId: String(args.taskId),
    deepLinkPath,
    fireAt: args.fireAt,
    dedupeKey: args.dedupeKey,
  });
  return {
    inserted: id != null,
    reason: id != null ? "ok" : "skipped",
  };
}

/**
 * Rewrite a stored legacy Tasks-page deep link to the pipeline file workspace
 * when the hub task is file-linked. Idempotent; no-op when already correct.
 */
async function maybeRepairAlertDeepLink(
  ctx: MutationCtx,
  row: Doc<"alerts">,
): Promise<string> {
  const current = assertInternalAppPath(row.deepLinkPath);
  if (row.entityType !== "task") return current;
  if (!isLegacyTasksPageDeepLink(current)) return current;
  let taskId: Id<"tasks">;
  try {
    taskId = row.entityId as Id<"tasks">;
  } catch {
    return current;
  }
  const repaired = await resolveHubTaskDeepLinkPath(ctx, taskId);
  if (repaired === current) return current;
  await ctx.db.patch(row._id, { deepLinkPath: repaired });
  return repaired;
}

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
      return await fireHubTaskAlert(ctx, {
        path: "due",
        taskId: args.taskId,
        userKey: args.userKey,
        orgId: args.orgId,
        fireAt: args.fireAt,
        dedupeKey: args.dedupeKey,
        title: args.title,
        deepLinkPath: args.deepLinkPath,
        body: args.body,
      });
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

export const fireTaskScheduled = internalMutation({
  args: {
    taskId: v.id("tasks"),
    userKey: v.string(),
    orgId: v.id("organizations"),
    fireAt: v.number(),
    dedupeKey: v.string(),
    title: v.string(),
    deepLinkPath: v.string(),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await fireHubTaskAlert(ctx, {
      path: "scheduled",
      taskId: args.taskId,
      userKey: args.userKey,
      orgId: args.orgId,
      fireAt: args.fireAt,
      dedupeKey: args.dedupeKey,
      title: args.title,
      deepLinkPath: args.deepLinkPath,
      body: args.body,
    });
  },
});

// ---------- Internal helpers for Web Push ----------

export const internalGetAlert = internalQuery({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    return await ctx.db.get(alertId);
  },
});

export const internalMarkPushDispatched = internalMutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    const row = await ctx.db.get(alertId);
    if (!row) return;
    if (row.pushDispatchedAt != null) return;
    await ctx.db.patch(alertId, { pushDispatchedAt: Date.now() });
  },
});

/**
 * Re-queue Web Push for an existing alert (idempotent via pushDispatchedAt).
 * Used after shipping push infra / prefs backfill — not a polling pump.
 */
export const internalRedispatchAlertPush = internalMutation({
  args: { alertId: v.id("alerts"), force: v.optional(v.boolean()) },
  handler: async (ctx, { alertId, force }) => {
    const row = await ctx.db.get(alertId);
    if (!row) return { ok: false as const, reason: "missing" as const };
    if (!force && row.pushDispatchedAt != null) {
      return { ok: false as const, reason: "already_sent" as const };
    }
    if (force && row.pushDispatchedAt != null) {
      await ctx.db.patch(alertId, { pushDispatchedAt: undefined });
    }
    await scheduleTimeAlertPush(ctx, alertId);
    return { ok: true as const, reason: "scheduled" as const };
  },
});

/**
 * Persist inherited task_scheduled push when legacy prefs only set taskDuePush.
 * One-shot operator/backfill helper — not scheduled on a loop.
 */
export const internalAlignScheduledPushPrefs = internalMutation({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const k = userKey.trim();
    if (!k) return { ok: false as const, reason: "empty" as const };
    const row = await ctx.db
      .query("alertPreferences")
      .withIndex("by_userKey", (q) => q.eq("userKey", k))
      .first();
    if (!row) return { ok: false as const, reason: "missing" as const };
    if (row.taskScheduledPush !== undefined) {
      return {
        ok: true as const,
        reason: "already_set" as const,
        taskScheduledPush: row.taskScheduledPush,
      };
    }
    await ctx.db.patch(row._id, {
      taskScheduledInApp: row.taskScheduledInApp ?? row.taskDueInApp,
      taskScheduledPush: row.taskDuePush,
      updatedAt: Date.now(),
    });
    return {
      ok: true as const,
      reason: "aligned" as const,
      taskScheduledPush: row.taskDuePush,
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
  returns: v.object({
    deepLinkPath: v.string(),
  }),
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return { deepLinkPath: "" };
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    if (row.readAt == null) {
      await ctx.db.patch(id, { readAt: Date.now() });
    }
    const deepLinkPath = await maybeRepairAlertDeepLink(ctx, row);
    return { deepLinkPath };
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

/**
 * Shared unread pagination for mass mark-read / clear. Does not dismiss unless
 * `hide` is true. Bounded via `by_user_unread` (no unbounded collect).
 */
async function markUnreadPageForUser(
  ctx: MutationCtx,
  args: {
    userKey: string;
    orgId?: Id<"organizations">;
    hide: boolean;
  },
): Promise<{ updated: number; hasMore: boolean }> {
  const k = args.userKey.trim();
  if (!k) return { updated: 0, hasMore: false };
  const now = Date.now();
  let updated = 0;

  for (let page = 0; page < CLEAR_ALL_MAX_PAGES; page++) {
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_user_unread", (q) =>
        q.eq("userKey", k).eq("readAt", undefined),
      )
      .take(CLEAR_ALL_PAGE);

    if (rows.length === 0) {
      return { updated, hasMore: false };
    }

    let patchedThisPage = 0;
    for (const r of rows) {
      if (args.orgId && r.orgId !== args.orgId) continue;
      // Idempotent: unread index already implies readAt == null.
      const patch: { readAt: number; dismissedAt?: number } = {
        readAt: now,
      };
      if (args.hide && r.dismissedAt == null) {
        patch.dismissedAt = now;
      }
      await ctx.db.patch(r._id, patch);
      updated += 1;
      patchedThisPage += 1;
    }

    if (rows.length < CLEAR_ALL_PAGE) {
      return { updated, hasMore: false };
    }

    // Org filter can skip an entire page — avoid an idle loop: if nothing
    // matched this page, stop and let the client decide (rare multi-org).
    if (patchedThisPage === 0) {
      return { updated, hasMore: false };
    }
  }

  const more = await ctx.db
    .query("alerts")
    .withIndex("by_user_unread", (q) =>
      q.eq("userKey", k).eq("readAt", undefined),
    )
    .take(1);
  const hasMore =
    more.length > 0 &&
    (!args.orgId || more.some((r) => r.orgId === args.orgId));
  return { updated, hasMore };
}

/**
 * Mark every unread reminder read for the caller. Does **not** dismiss/hide —
 * rows stay in the list; badge goes to 0. Idempotent; bounded pages via
 * `by_user_unread`. Client may re-invoke while `hasMore`.
 */
export const markAllReadForUser = mutation({
  args: {
    userKey: v.string(),
    orgId: v.optional(v.id("organizations")),
    ...memberUserKeyArg,
  },
  returns: v.object({
    updated: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const k = args.userKey.trim();
    if (!k) return { updated: 0, hasMore: false };
    await assertCallerOwnsUserKey(ctx, k, args.memberUserKey);
    return await markUnreadPageForUser(ctx, {
      userKey: k,
      orgId: args.orgId,
      hide: false,
    });
  },
});

/**
 * True clear for the Reminders badge: mark unread rows read (and optionally
 * dismiss/hide) for the authenticated caller. Idempotent — already-read rows
 * are skipped. Bounded pages via `by_user_unread` (no unbounded collect).
 * Client may re-invoke while `hasMore` until the badge hits 0.
 */
export const clearAllForUser = mutation({
  args: {
    userKey: v.string(),
    orgId: v.optional(v.id("organizations")),
    /** When true (default), also set `dismissedAt` so rows leave the default inbox. */
    hide: v.optional(v.boolean()),
    ...memberUserKeyArg,
  },
  returns: v.object({
    updated: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const k = args.userKey.trim();
    if (!k) return { updated: 0, hasMore: false };
    await assertCallerOwnsUserKey(ctx, k, args.memberUserKey);
    const hide = args.hide !== false;
    return await markUnreadPageForUser(ctx, {
      userKey: k,
      orgId: args.orgId,
      hide,
    });
  },
});

/**
 * Repair legacy `/tasks?task=` deep links on the caller's reminders to the
 * pipeline file workspace when the task is file-linked. Bounded; idempotent.
 * Client may re-invoke while `hasMore`.
 */
export const repairDeepLinksForUser = mutation({
  args: {
    userKey: v.string(),
    orgId: v.optional(v.id("organizations")),
    ...memberUserKeyArg,
  },
  returns: v.object({
    repaired: v.number(),
    scanned: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const k = args.userKey.trim();
    if (!k) return { repaired: 0, scanned: 0, hasMore: false };
    await assertCallerOwnsUserKey(ctx, k, args.memberUserKey);

    const cap = REPAIR_DEEPLINK_PAGE * REPAIR_DEEPLINK_MAX_PAGES;
    // bounded: newest reminders first (cap+1 probes hasMore)
    const batch = await ctx.db
      .query("alerts")
      .withIndex("by_user_created", (iq) => iq.eq("userKey", k))
      .order("desc")
      .take(cap + 1);
    const hasMore = batch.length > cap;
    const page = batch.slice(0, cap);

    let repaired = 0;
    let scanned = 0;
    for (const r of page) {
      scanned += 1;
      if (args.orgId && r.orgId !== args.orgId) continue;
      if (r.entityType !== "task") continue;
      if (!isLegacyTasksPageDeepLink(r.deepLinkPath)) continue;
      const before = r.deepLinkPath;
      const after = await maybeRepairAlertDeepLink(ctx, r);
      if (after !== before) repaired += 1;
    }
    return { repaired, scanned, hasMore };
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
 * waiting for end-of-day file snooze. Membership-checked; one pending test per user.
 */
export const scheduleSelfTestReminder = mutation({
  args: {
    orgId: v.id("organizations"),
    delayMs: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const k = await requireAuthenticatedCaller(ctx, args.memberUserKey);
    await assertOrgMember(ctx, args.orgId, k);
    const delay = Math.min(Math.max(args.delayMs ?? 5000, 2000), 60_000);
    const now = Date.now();
    // Stable pending key — one in-flight self-test per user (cost + UX).
    const pendingKey = `self_test_pending:${k}`;
    const pending = await ctx.db
      .query("alerts")
      .withIndex("by_dedupeKey", (q) =>
        q.eq("userKey", k).eq("dedupeKey", pendingKey),
      )
      .first();
    if (pending && pending.fireAt > now) {
      return {
        ok: true as const,
        fireAt: pending.fireAt,
        delayMs: Math.max(0, pending.fireAt - now),
        alreadyPending: true as const,
      };
    }
    const fireAt = now + delay;
    const dedupeKey = `self_test:${k}:${fireAt}`;
    await ctx.scheduler.runAt(fireAt, internal.alerts.fireSelfTestReminder, {
      userKey: k,
      orgId: args.orgId,
      fireAt,
      dedupeKey,
      pendingKey,
    });
    // Placeholder row so a second click within the delay is a no-op (not a new job).
    if (pending) {
      await ctx.db.patch(pending._id, { fireAt, createdAt: now });
    } else {
      await ctx.db.insert("alerts", {
        userKey: k,
        orgId: args.orgId,
        category: "task_due",
        title: "Test reminder (scheduled)",
        body: "Waiting for self-test fire…",
        entityType: "task",
        entityId: `self_test_pending`,
        deepLinkPath: "/settings#reminders",
        fireAt,
        createdAt: now,
        dedupeKey: pendingKey,
        // Hide from default inbox until the real fire replaces/dismisses it.
        dismissedAt: now,
      });
    }
    return {
      ok: true as const,
      fireAt,
      delayMs: delay,
      alreadyPending: false as const,
    };
  },
});

export const fireSelfTestReminder = internalMutation({
  args: {
    userKey: v.string(),
    orgId: v.id("organizations"),
    fireAt: v.number(),
    dedupeKey: v.string(),
    pendingKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userKey = args.userKey.trim();
    if (!userKey) {
      return { inserted: false as const, reason: "missing" as const };
    }
    // Bypass channel prefs — diagnostic must still appear when task_due in-app is off.
    const existing = await ctx.db
      .query("alerts")
      .withIndex("by_dedupeKey", (q) =>
        q.eq("userKey", userKey).eq("dedupeKey", args.dedupeKey),
      )
      .first();
    if (existing) {
      return { inserted: false as const, reason: "dedupe" as const };
    }
    const deepLinkPath = assertInternalAppPath("/settings#reminders");
    const now = Date.now();
    const id = await ctx.db.insert("alerts", {
      userKey,
      orgId: args.orgId,
      category: "task_due",
      title: "Test reminder",
      body: "Self-test from Reminder preferences — the Reminders bell is working.",
      entityType: "task",
      entityId: `self_test:${args.fireAt}`,
      deepLinkPath,
      fireAt: args.fireAt,
      createdAt: now,
      dedupeKey: args.dedupeKey,
    });
    const pending = await ctx.db
      .query("alerts")
      .withIndex("by_dedupeKey", (q) =>
        q.eq("userKey", userKey).eq("dedupeKey", args.pendingKey),
      )
      .first();
    if (pending) {
      await ctx.db.delete(pending._id);
    }
    return { inserted: true as const, reason: "ok" as const, id };
  },
});

const alertCategoryArg = v.union(
  v.literal("file_snooze_due"),
  v.literal("task_due"),
  v.literal("task_scheduled"),
);
const alertChannelArg = v.union(v.literal("inApp"), v.literal("push"));

function prefsDocFromResolved(resolved: AlertPreferencesResolved) {
  return {
    fileSnoozeDueInApp: resolved.file_snooze_due.inApp,
    fileSnoozeDuePush: resolved.file_snooze_due.push,
    taskDueInApp: resolved.task_due.inApp,
    taskDuePush: resolved.task_due.push,
    taskScheduledInApp: resolved.task_scheduled.inApp,
    taskScheduledPush: resolved.task_scheduled.push,
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
      // Paginate all tasks (not by_dueDate): sync clears/reschedules both
      // classic due/reminder and triage scheduledTriggerTime one-shots.
      const { page, isDone, continueCursor } = await ctx.db
        .query("tasks")
        .order("asc")
        .paginate({ numItems: pageSize, cursor: startCursor });
      examined = page.length;
      for (const row of page) {
        if (!row.organizationId) {
          skipped += 1;
          continue;
        }
        if (row.status === "done" || row.status === "archived") {
          skipped += 1;
          continue;
        }
        const dueFireAt = resolveHubTaskDueAlertFireAt({
          dueDate: row.dueDate,
          reminderAt: row.reminderAt,
        });
        const scheduleFireAt = resolveHubTaskScheduleAlertFireAt({
          scheduledTriggerTime: row.scheduledTriggerTime,
        });
        const needsWork =
          dueFireAt != null ||
          scheduleFireAt != null ||
          row.dueAlertJobId != null ||
          row.scheduleAlertJobId != null;
        if (!needsWork) {
          skipped += 1;
          continue;
        }
        const userKey = (
          row.scheduleAlertUserKey ??
          row.dueAlertUserKey ??
          row.ownerUserId ??
          row.assigneeId ??
          ""
        ).trim();
        if (!userKey) {
          skipped += 1;
          continue;
        }
        await syncHubTaskAlerts(ctx, {
          taskId: row._id,
          userKey,
          orgId: row.organizationId,
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

