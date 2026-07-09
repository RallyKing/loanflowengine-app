/**
 * Phase Modular-C — construction budget lines for the `constructionBudget`
 * pipeline block. File-scoped rows with a summary roll-up computed client-side.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";

const memberUserKeyArg = {
  memberUserKey: v.optional(v.string()),
};

const budgetLineStatusV = v.union(
  v.literal("planned"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("on_hold"),
);

export const listByFile = query({
  args: {
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const rows = await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file_sort", (q) => q.eq("fileId", fileId))
      .collect();
    return rows;
  },
});

export const upsertLine = mutation({
  args: {
    fileId: v.id("pipeline"),
    lineId: v.optional(v.id("constructionBudgetLines")),
    category: v.string(),
    description: v.optional(v.string()),
    budgetAmount: v.optional(v.string()),
    spentAmount: v.optional(v.string()),
    drawNumber: v.optional(v.string()),
    status: v.optional(budgetLineStatusV),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);

    const category = args.category.trim();
    if (!category) throw new Error("Budget line category is required");

    const now = Date.now();
    const patch = {
      category,
      description: args.description?.trim() || undefined,
      budgetAmount: args.budgetAmount?.trim() || undefined,
      spentAmount: args.spentAmount?.trim() || undefined,
      drawNumber: args.drawNumber?.trim() || undefined,
    };

    if (args.lineId) {
      const existing = await ctx.db.get(args.lineId);
      if (!existing || String(existing.fileId) !== String(args.fileId)) {
        throw new Error("Budget line not found on this file");
      }
      await ctx.db.patch(args.lineId, {
        ...patch,
        ...(args.status ? { status: args.status } : {}),
        updatedAt: now,
      });
      return args.lineId;
    }

    const siblings = await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
    const sortOrder =
      siblings.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

    return await ctx.db.insert("constructionBudgetLines", {
      organizationId: file.organizationId,
      fileId: args.fileId,
      ...patch,
      status: args.status ?? "planned",
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setLineStatus = mutation({
  args: {
    fileId: v.id("pipeline"),
    lineId: v.id("constructionBudgetLines"),
    status: budgetLineStatusV,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const existing = await ctx.db.get(args.lineId);
    if (!existing || String(existing.fileId) !== String(args.fileId)) {
      throw new Error("Budget line not found on this file");
    }
    await ctx.db.patch(args.lineId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const removeLine = mutation({
  args: {
    fileId: v.id("pipeline"),
    lineId: v.id("constructionBudgetLines"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const existing = await ctx.db.get(args.lineId);
    if (!existing || String(existing.fileId) !== String(args.fileId)) {
      throw new Error("Budget line not found on this file");
    }
    await ctx.db.delete(args.lineId);
    return { ok: true as const };
  },
});

export type ConstructionBudgetLineDoc = Doc<"constructionBudgetLines">;
