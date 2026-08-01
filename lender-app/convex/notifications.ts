import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mergeServerUserPreferences } from "../lib/userPreferencesModel";
import { pickCanonicalUserPreferences } from "./userPreferencesPick";
import {
  channelsForCategory,
  resolveNotificationPrefs,
  simpleEmailLooksValid,
  type NotificationCategory,
} from "../lib/notificationPreferences";
import { resolveDisplayUsernameForUserKey } from "./auth/displayIdentity";
import { requireAuthenticatedCaller } from "./callerAuth";

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

async function loadResolvedPrefs(ctx: MutationCtx, userKey: string) {
  const prefRows = await ctx.db
    .query("userPreferences")
    .withIndex("by_accountId", (q) => q.eq("accountId", userKey.trim()))
    .collect();
  const row = pickCanonicalUserPreferences(prefRows);
  return resolveNotificationPrefs(mergeServerUserPreferences(row));
}

/**
 * Insert a notification for one user. Used by assignments, file watchers,
 * @mentions, and deadline digest. Schedules optional email via Resend when
 * configured (`RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM`).
 */
export async function dispatchUserNotification(
  ctx: MutationCtx,
  args: {
    userKey: string;
    category: NotificationCategory;
    summary: string;
    detail?: string;
    actorUserKey?: string | undefined;
    taskId?: Id<"tasks"> | undefined;
    fileId?: Id<"pipeline"> | undefined;
    lenderId?: Id<"lenders"> | undefined;
    libraryDocumentId?: Id<"libraryDocuments"> | undefined;
    collaborationThreadId?: Id<"collaborationThreads"> | undefined;
    collaborationEventId?: Id<"collaborationActivityEvents"> | undefined;
    dedupeKey?: string | undefined;
    snoozedUntil?: number | undefined;
  },
): Promise<Id<"userNotifications"> | null> {
  const recipient = args.userKey.trim();
  if (!recipient) return null;
  const actor = args.actorUserKey?.trim();
  if (actor && actor === recipient) return null;

  const prefs = await loadResolvedPrefs(ctx, recipient);
  const channels = channelsForCategory(prefs, args.category);
  if (!channels.inApp && !channels.email) return null;

  const markReadImmediately = !channels.inApp && channels.email;

  if (args.dedupeKey) {
    const dk = args.dedupeKey.trim();
    if (dk) {
      const dupe = await ctx.db
        .query("userNotifications")
        .withIndex("by_user_dedupe", (q) =>
          q.eq("userKey", recipient).eq("dedupeKey", dk),
        )
        .first();
      if (dupe) return null;
    }
  }

  const now = Date.now();
  const summaryNorm = args.summary.slice(0, 500);

  /** Aggressive fanout dedupe when callers omit dedupeKey. */
  if (!args.dedupeKey?.trim()) {
    const recent = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", recipient))
      .order("desc")
      .take(12);
    const dupe = recent.find(
      (row) =>
        row.category === args.category &&
        row.summary === summaryNorm &&
        row.fileId === args.fileId &&
        row.taskId === args.taskId &&
        now - row.createdAt < 120_000,
    );
    if (dupe) return null;
  }

  const id = await ctx.db.insert("userNotifications", {
    userKey: recipient,
    category: args.category,
    summary: summaryNorm,
    detail: args.detail?.trim() || undefined,
    readAt: markReadImmediately ? now : undefined,
    createdAt: now,
    actorUserKey: actor || undefined,
    taskId: args.taskId,
    fileId: args.fileId,
    lenderId: args.lenderId,
    libraryDocumentId: args.libraryDocumentId,
    collaborationThreadId: args.collaborationThreadId,
    collaborationEventId: args.collaborationEventId,
    dedupeKey: args.dedupeKey?.trim() || undefined,
    snoozedUntil: args.snoozedUntil,
  });

  if (channels.email && simpleEmailLooksValid(prefs.notificationEmail)) {
    await ctx.scheduler.runAfter(0, internal.notifications.trySendNotificationEmail, {
      notificationId: id,
    });
  }
  return id;
}

export const listUnreadForUser = query({
  args: {
    userKey: v.string(),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userKey, memberUserKey, limit }) => {
    const k = userKey.trim();
    if (!k) return [];
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);
    const cap = Math.min(Math.max(limit ?? 30, 1), 80);
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(cap * 3);
    const t = Date.now();
    const page = rows
      .filter(
        (r) =>
          r.readAt == null &&
          (r.snoozedUntil == null || r.snoozedUntil <= t),
      )
      .slice(0, cap);
    const enriched = [];
    for (const r of page) {
      enriched.push({
        ...r,
        actorDisplayUsername: r.actorUserKey
          ? await resolveDisplayUsernameForUserKey(ctx, r.actorUserKey)
          : undefined,
      });
    }
    return enriched;
  },
});

export const unreadCountForUser = query({
  args: {
    userKey: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { userKey, memberUserKey }) => {
    const k = userKey.trim();
    if (!k) return 0;
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);
    const t = Date.now();
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(200);
    return rows.filter(
      (r) =>
        r.readAt == null &&
        (r.snoozedUntil == null || r.snoozedUntil <= t),
    ).length;
  },
});

export const snooze = mutation({
  args: {
    id: v.id("userNotifications"),
    memberUserKey: v.optional(v.string()),
    until: v.number(),
  },
  handler: async (ctx, { id, memberUserKey, until }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    await ctx.db.patch(id, { snoozedUntil: until });
  },
});

export const markRead = mutation({
  args: {
    id: v.id("userNotifications"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { id, memberUserKey }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await assertCallerOwnsUserKey(ctx, row.userKey, memberUserKey);
    await ctx.db.patch(id, { readAt: Date.now() });
  },
});

export const markAllReadForUser = mutation({
  args: {
    userKey: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { userKey, memberUserKey }) => {
    const k = userKey.trim();
    if (!k) return { updated: 0 };
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(250);
    const now = Date.now();
    let updated = 0;
    for (const r of rows) {
      if (r.readAt != null) continue;
      await ctx.db.patch(r._id, { readAt: now });
      updated += 1;
    }
    return { updated };
  },
});

export const markReadForTaskForUser = mutation({
  args: {
    userKey: v.string(),
    memberUserKey: v.optional(v.string()),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, { userKey, memberUserKey, taskId }) => {
    const k = userKey.trim();
    if (!k) return { updated: 0 };
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const now = Date.now();
    let updated = 0;
    for (const r of rows) {
      if (r.userKey !== k || r.readAt != null) continue;
      await ctx.db.patch(r._id, { readAt: now });
      updated += 1;
    }
    return { updated };
  },
});

export const markReadForFileForUser = mutation({
  args: {
    userKey: v.string(),
    memberUserKey: v.optional(v.string()),
    fileId: v.id("pipeline"),
  },
  handler: async (ctx, { userKey, memberUserKey, fileId }) => {
    const k = userKey.trim();
    if (!k) return { updated: 0 };
    await assertCallerOwnsUserKey(ctx, k, memberUserKey);
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .collect();
    const now = Date.now();
    let updated = 0;
    for (const r of rows) {
      if (r.userKey !== k || r.readAt != null) continue;
      await ctx.db.patch(r._id, { readAt: now });
      updated += 1;
    }
    return { updated };
  },
});

export const internalGetNotification = internalQuery({
  args: { notificationId: v.id("userNotifications") },
  handler: async (ctx, { notificationId }) => {
    return await ctx.db.get(notificationId);
  },
});

export const internalGetUserPrefs = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const k = accountId.trim();
    if (!k) return null;
    const prefRows = await ctx.db
      .query("userPreferences")
      .withIndex("by_accountId", (q) => q.eq("accountId", k))
      .collect();
    return pickCanonicalUserPreferences(prefRows);
  },
});

export const trySendNotificationEmail = internalAction({
  args: { notificationId: v.id("userNotifications") },
  handler: async (ctx, { notificationId }) => {
    const row = await ctx.runQuery(internal.notifications.internalGetNotification, {
      notificationId,
    });
    if (!row) return { ok: false as const, reason: "not_found" };
    if (row.emailDispatchedAt != null) {
      return { ok: false as const, reason: "already_sent" };
    }

    const prefsRow = await ctx.runQuery(
      internal.notifications.internalGetUserPrefs,
      { accountId: row.userKey },
    );
    const prefs = resolveNotificationPrefs(
      mergeServerUserPreferences(prefsRow),
    );
    const channels = channelsForCategory(prefs, row.category as NotificationCategory);
    if (!channels.email || !simpleEmailLooksValid(prefs.notificationEmail)) {
      return { ok: false as const, reason: "email_disabled" };
    }
    const to = prefs.notificationEmail.trim();

    const apiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.NOTIFICATION_EMAIL_FROM?.trim() ||
      "onboarding@resend.dev";
    const subject = row.summary.slice(0, 120);
    const text = [row.summary, row.detail].filter(Boolean).join("\n\n");

    if (!apiKey) {
      console.warn(
        "notifications: RESEND_API_KEY not set; email notification skipped.",
      );
      return { ok: false as const, reason: "no_resend_key" };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("Resend error", res.status, errBody);
        return { ok: false as const, reason: "resend_http" };
      }
      await ctx.runMutation(internal.notifications.internalMarkEmailDispatched, {
        notificationId,
      });
      return { ok: true as const };
    } catch (e) {
      console.error("notifications email fetch failed", e);
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});

export const internalMarkEmailDispatched = internalMutation({
  args: { notificationId: v.id("userNotifications") },
  handler: async (ctx, { notificationId }) => {
    await ctx.db.patch(notificationId, { emailDispatchedAt: Date.now() });
  },
});

export const deadlineDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dayMs = 86400000;
    const u = new Date(now);
    u.setUTCHours(0, 0, 0, 0);
    const startToday = u.getTime();
    const horizonEnd = startToday + 2 * dayMs;
    const overdueCutoff = startToday - 7 * dayMs;
    const digestDay = u.toISOString().slice(0, 10);

    const candidates = await ctx.db
      .query("tasks")
      .withIndex("by_dueDate", (q) =>
        q.gte("dueDate", overdueCutoff).lte("dueDate", horizonEnd),
      )
      .take(2000);

    let inserted = 0;
    for (const t of candidates) {
      if (t.status === "done" || t.status === "archived") continue;
      if (t.snoozedUntil != null && t.snoozedUntil > now) continue;
      const assignee = t.assigneeId?.trim();
      if (!assignee || t.dueDate == null) continue;

      let label: string;
      if (t.dueDate < startToday) {
        label = `Overdue: “${t.title.trim()}”`;
      } else if (t.dueDate < startToday + dayMs) {
        label = `Due today: “${t.title.trim()}”`;
      } else {
        label = `Due soon: “${t.title.trim()}”`;
      }

      const dedupeKey = `deadline:${t._id}:${digestDay}`;
      const nid = await dispatchUserNotification(ctx, {
        userKey: assignee,
        category: "deadline",
        summary: label,
        detail: `Due date: ${new Date(t.dueDate).toISOString().slice(0, 10)} UTC`,
        taskId: t._id,
        dedupeKey,
      });
      if (nid) inserted += 1;
    }
    return { scanned: candidates.length, inserted };
  },
});
