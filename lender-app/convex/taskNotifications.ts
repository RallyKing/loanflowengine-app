import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { dispatchUserNotification } from "./notifications";

export async function notifyTaskAssigneeChange(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    title: string;
    prevAssignee: string | undefined;
    nextAssignee: string | undefined;
    actorUserKey: string | undefined;
  },
): Promise<void> {
  const next = args.nextAssignee?.trim();
  if (!next) return;
  if (args.prevAssignee?.trim() === next) return;
  if (args.actorUserKey?.trim() === next) return;

  const kind = args.prevAssignee?.trim() ? ("reassigned" as const) : ("assigned" as const);
  const summary =
    kind === "reassigned"
      ? `Reassigned to you: “${args.title.trim()}”`
      : `Assigned to you: “${args.title.trim()}”`;

  await dispatchUserNotification(ctx, {
    userKey: next,
    category: "task_assignment",
    summary,
    actorUserKey: args.actorUserKey,
    taskId: args.taskId,
  });
}

export const listUnreadForUser = query({
  args: { userKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { userKey, limit }) => {
    const k = userKey.trim();
    if (!k) return [];
    const cap = Math.min(Math.max(limit ?? 25, 1), 60);
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(cap * 4);
    return rows
      .filter(
        (r) => r.readAt == null && r.category === "task_assignment",
      )
      .slice(0, cap);
  },
});

export const unreadCountForUser = query({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const k = userKey.trim();
    if (!k) return 0;
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(200);
    return rows.filter(
      (r) => r.readAt == null && r.category === "task_assignment",
    ).length;
  },
});

export const markRead = mutation({
  args: { id: v.id("userNotifications") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await ctx.db.patch(id, { readAt: Date.now() });
  },
});

export const markAllReadForUser = mutation({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const k = userKey.trim();
    if (!k) return { updated: 0 };
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_user_created", (q) => q.eq("userKey", k))
      .order("desc")
      .take(200);
    const now = Date.now();
    let updated = 0;
    for (const r of rows) {
      if (r.readAt != null || r.category !== "task_assignment") continue;
      await ctx.db.patch(r._id, { readAt: now });
      updated += 1;
    }
    return { updated };
  },
});

export const markReadForTaskForUser = mutation({
  args: { userKey: v.string(), taskId: v.id("tasks") },
  handler: async (ctx, { userKey, taskId }) => {
    const k = userKey.trim();
    if (!k) return { updated: 0 };
    const rows = await ctx.db
      .query("userNotifications")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const now = Date.now();
    let updated = 0;
    for (const r of rows) {
      if (r.userKey !== k || r.readAt != null || r.category !== "task_assignment") {
        continue;
      }
      await ctx.db.patch(r._id, { readAt: now });
      updated += 1;
    }
    return { updated };
  },
});
