import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  assertOrgMember,
  assertOrgPermission,
} from "./organizationAccess";

/**
 * Org-private lenders plus global catalog rows (`organizationId` unset), merged by recency.
 */
export const listLendersForIntegration = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.number(),
  },
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await assertOrgMember(ctx, organizationId, memberUserKey);
    const cap = Math.min(Math.max(limit, 1), 500);

    const orgRows = await ctx.db
      .query("lenders")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(cap);

    const need = cap - orgRows.length;
    let globalSlice: Doc<"lenders">[] = [];
    if (need > 0) {
      const globalCandidates = await ctx.db
        .query("lenders")
        .filter((q) => q.eq(q.field("organizationId"), undefined))
        .order("desc")
        .take(Math.max(need * 3, need));
      globalSlice = globalCandidates.slice(0, need);
    }

    const merged = [...orgRows, ...globalSlice].sort(
      (a, b) => b._creationTime - a._creationTime,
    );
    return merged.slice(0, cap);
  },
});

const taskStatusV = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
  v.literal("archived"),
);

/**
 * Organization tasks only (`organizationId` matches). Personal/global tasks without org are excluded.
 */
export const listTasksForIntegration = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.number(),
    status: v.optional(taskStatusV),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "files.view",
    );
    const cap = Math.min(Math.max(args.limit, 1), 500);
    const take = args.status ? cap * 3 : cap;
    let rows = await ctx.db
      .query("tasks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(take);
    if (args.status) {
      rows = rows.filter((r) => r.status === args.status).slice(0, cap);
    }
    return rows;
  },
});
