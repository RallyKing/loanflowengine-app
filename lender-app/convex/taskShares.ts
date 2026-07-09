import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgMember } from "./organizationAccess";
import {
  assertCanMutateTaskRow,
  assertCanReadTaskRow,
  removeResourceShare,
  resolveRowOwnerUserId,
  upsertResourceShare,
} from "./resourceAccess";
import { resolveShareTargetUserKey } from "./shareTargetResolve";
import { resolveDisplayUsernameForUserKey } from "./auth/displayIdentity";
import { appendTaskFeed } from "./activityFeed";
import {
  formatTaskShareActivitySummary,
  notifyResourceShareEvent,
} from "./resourceOwnershipPresentation";

async function assertCanManageTaskShares(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  actorKey: string,
): Promise<void> {
  if (!task.organizationId) {
    throw new Error("Sharing applies to organization tasks only.");
  }
  await assertOrgMember(ctx, task.organizationId, actorKey);
  const owner = resolveRowOwnerUserId(task);
  if (owner && owner === actorKey) return;
  throw new Error("Only the task owner can manage sharing.");
}

export const listForTask = query({
  args: {
    taskId: v.id("tasks"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, memberUserKey }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return [];
    const key = (memberUserKey ?? "").trim();
    if (!key) return [];
    await assertCanReadTaskRow(ctx, task, key);

    const rows = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "task").eq("resourceId", String(taskId)),
      )
      .collect();
    const out = [];
    for (const r of rows) {
      out.push({
        _id: r._id,
        sharedUserId: r.sharedUserId,
        sharedDisplayUsername: await resolveDisplayUsernameForUserKey(
          ctx,
          r.sharedUserId,
        ),
        permission: r.permission,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    }
    return out;
  },
});

export const upsertShare = mutation({
  args: {
    taskId: v.id("tasks"),
    targetLoginOrUserKey: v.string(),
    permission: v.union(v.literal("view"), v.literal("edit")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found.");
    if (!task.organizationId) {
      throw new Error("Sharing applies to organization tasks only.");
    }
    await assertCanManageTaskShares(ctx, task, actor);

    const target = await resolveShareTargetUserKey(
      ctx,
      task.organizationId,
      args.targetLoginOrUserKey,
    );
    if (target === actor) {
      throw new Error("You cannot share a task with yourself.");
    }
    if (resolveRowOwnerUserId(task) === target) {
      throw new Error("The owner already has full access.");
    }

    const priorRows = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "task").eq("resourceId", String(args.taskId)),
      )
      .collect();
    const priorShare = priorRows.find((r) => r.sharedUserId === target);

    const shareId = await upsertResourceShare(ctx, {
      organizationId: task.organizationId,
      resourceType: "task",
      resourceId: String(args.taskId),
      sharedUserId: target,
      permission: args.permission,
      createdByUserId: actor,
    });

    const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
    const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
    const taskLabel = task.title?.trim() || "a task";
    await appendTaskFeed(
      ctx,
      task,
      priorShare ? "task_share_updated" : "task_share_granted",
      formatTaskShareActivitySummary(
        actorName,
        targetName,
        args.permission,
        priorShare ? "update" : "grant",
      ),
      actor,
    );

    if (!priorShare) {
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "task",
        resourceId: String(args.taskId),
        taskId: args.taskId,
        event: "shared",
        resourceLabel: taskLabel,
      });
    } else if (priorShare.permission !== args.permission) {
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "task",
        resourceId: String(args.taskId),
        taskId: args.taskId,
        event:
          args.permission === "edit" ? "upgraded_edit" : "downgraded_view",
        resourceLabel: taskLabel,
      });
    }

    return { shareId, sharedUserId: target };
  },
});

export const removeShare = mutation({
  args: {
    taskId: v.id("tasks"),
    targetLoginOrUserKey: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");

    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found.");
    await assertCanManageTaskShares(ctx, task, actor);
    if (!task.organizationId) {
      throw new Error("Sharing applies to organization tasks only.");
    }

    const target = await resolveShareTargetUserKey(
      ctx,
      task.organizationId,
      args.targetLoginOrUserKey,
    );
    const removed = await removeResourceShare(ctx, {
      resourceType: "task",
      resourceId: String(args.taskId),
      sharedUserId: target,
    });
    if (removed) {
      const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
      const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
      const taskLabel = task.title?.trim() || "a task";
      await appendTaskFeed(
        ctx,
        task,
        "task_share_revoked",
        formatTaskShareActivitySummary(actorName, targetName, "view", "revoke"),
        actor,
      );
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "task",
        resourceId: String(args.taskId),
        taskId: args.taskId,
        event: "revoked",
        resourceLabel: taskLabel,
      });
    }
    return { removed };
  },
});
