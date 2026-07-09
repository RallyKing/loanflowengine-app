import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { PipelineFileSharedSource } from "../lib/fileSharedFields";
import {
  revenueAttributionUserKey,
  revenueTotalsFromPipelineRow,
  type FileRevenueTotals,
} from "../lib/fileRevenue";
import {
  assertCanReadPipelineRow,
  assertOrgMember,
  filterPipelineRowsForMember,
  sessionKeyIsGlobalAdmin,
} from "./organizationAccess";

function sumRevenueForRows(
  rows: Doc<"pipeline">[],
): FileRevenueTotals & { fileCount: number } {
  let fundingAmount = 0;
  let commission = 0;
  let netRevenue = 0;
  for (const r of rows) {
    const t = revenueTotalsFromPipelineRow(
      r as unknown as PipelineFileSharedSource,
    );
    fundingAmount += t.fundingAmount;
    commission += t.commission;
    netRevenue += t.netRevenue;
  }
  return { fileCount: rows.length, fundingAmount, commission, netRevenue };
}

/** Normalized revenue numbers for one file (shared data layer). */
export const forFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const row = await ctx.db.get(fileId);
    if (!row) return null;
    await assertCanReadPipelineRow(ctx, row, memberUserKey);
    const totals = revenueTotalsFromPipelineRow(
      row as unknown as PipelineFileSharedSource,
    );
    return {
      ...totals,
      attributionUserKey: revenueAttributionUserKey(row),
    };
  },
});

/**
 * Sums tracked funding / commission / net revenue for every pipeline file in the
 * org the caller can see (same visibility as `pipeline.listLight`).
 */
export const aggregateForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey ?? "");
    const god = await sessionKeyIsGlobalAdmin(ctx, args.memberUserKey);
    const rows = god
      ? await ctx.db.query("pipeline").collect()
      : await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .collect();
    const filtered = args.includeArchived
      ? rows
      : rows.filter((r) => r.archivedAt == null);
    const visible = await filterPipelineRowsForMember(
      ctx,
      filtered,
      args.organizationId,
      args.memberUserKey,
    );
    return sumRevenueForRows(visible);
  },
});

/**
 * Same as `aggregateForOrganization`, but only files attributed to
 * `attributionUserKey` (assignee, else owner).
 */
export const aggregateAttributedToUser = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    attributionUserKey: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey ?? "");
    const god = await sessionKeyIsGlobalAdmin(ctx, args.memberUserKey);
    const rows = god
      ? await ctx.db.query("pipeline").collect()
      : await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .collect();
    const filtered = args.includeArchived
      ? rows
      : rows.filter((r) => r.archivedAt == null);
    const visible = await filterPipelineRowsForMember(
      ctx,
      filtered,
      args.organizationId,
      args.memberUserKey,
    );
    const key = args.attributionUserKey.trim();
    const subset = visible.filter(
      (r) => revenueAttributionUserKey(r) === key,
    );
    return sumRevenueForRows(subset);
  },
});
