/**
 * Phase 37.8.U — unified read-model for Tab 6 Underwriting Ledger action queue.
 * Read-only aggregation over `tasks` + open `clientPortalRequests`.
 */
import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertCanReadPipelineRow } from "./organizationAccess";
import { isGrantUsable } from "./clientPortalShared";
import {
  sortUnderwritingActionItems,
  type UnderwritingActionItem,
} from "../lib/pipeline/underwritingLedger";

const underwritingActionItemV = v.object({
  id: v.string(),
  type: v.union(v.literal("task"), v.literal("client_request")),
  title: v.string(),
  status: v.string(),
  createdAt: v.number(),
  dueDate: v.optional(v.number()),
  assignedToKey: v.optional(v.string()),
  clientEmail: v.optional(v.string()),
});

function isActionableTask(task: Doc<"tasks">): boolean {
  return task.status === "todo" || task.status === "in_progress";
}

function taskToActionItem(task: Doc<"tasks">): UnderwritingActionItem {
  const assignedToKey =
    task.assigneeId?.trim() || task.ownerUserId?.trim() || undefined;
  return {
    id: String(task._id),
    type: "task",
    title: task.title,
    status: task.status,
    createdAt: task.createdAt,
    dueDate: task.dueDate,
    assignedToKey,
  };
}

function clientRequestToActionItem(
  request: Doc<"clientPortalRequests">,
  grant: Doc<"clientPortalGrants">,
): UnderwritingActionItem {
  return {
    id: String(request._id),
    type: "client_request",
    title: request.title,
    status: request.status,
    createdAt: request.createdAt,
    clientEmail: grant.emailKey,
  };
}

async function fetchActionableTasks(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
  organizationId: Id<"organizations"> | undefined,
): Promise<UnderwritingActionItem[]> {
  const rows = await ctx.db
    .query("tasks")
    .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
    .collect();

  return rows
    .filter(
      (task) =>
        isActionableTask(task) &&
        (organizationId == null || task.organizationId === organizationId),
    )
    .map(taskToActionItem);
}

async function fetchOpenClientRequests(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<UnderwritingActionItem[]> {
  const grants = await ctx.db
    .query("clientPortalGrants")
    .withIndex("by_file", (q) => q.eq("pipelineFileId", fileId))
    .collect();

  const activeGrants = grants.filter(isGrantUsable);
  if (activeGrants.length === 0) return [];

  const grantById = new Map(activeGrants.map((g) => [g._id, g] as const));

  const requestBatches = await Promise.all(
    activeGrants.map((grant) =>
      ctx.db
        .query("clientPortalRequests")
        .withIndex("by_grant", (q) => q.eq("grantId", grant._id))
        .collect(),
    ),
  );

  const items: UnderwritingActionItem[] = [];
  for (const batch of requestBatches) {
    for (const request of batch) {
      if (request.status !== "open") continue;
      const grant = grantById.get(request.grantId);
      if (!grant) continue;
      items.push(clientRequestToActionItem(request, grant));
    }
  }
  return items;
}

export const listForFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return [];

    await assertCanReadPipelineRow(ctx, file, memberUserKey);

    const [taskItems, clientRequestItems] = await Promise.all([
      fetchActionableTasks(ctx, fileId, file.organizationId),
      fetchOpenClientRequests(ctx, fileId),
    ]);

    return sortUnderwritingActionItems([...taskItems, ...clientRequestItems]);
  },
});

export type { UnderwritingActionItem };

/** Exported for tests / future validators — mirrors query return shape. */
export const underwritingActionItemValidator = underwritingActionItemV;
