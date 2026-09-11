import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrgPermission } from "./organizationAccess";
import { assertOrgPlanFeature } from "./organizationPlan";
import { sanitizeOrganizationIntegrationRules } from "../lib/orgIntegrationWorkflowsModel";

const orgIntegrationRuleV = v.object({
  id: v.string(),
  enabled: v.boolean(),
  name: v.optional(v.string()),
  connectorPublicId: v.optional(v.string()),
  action: v.union(
    v.object({
      type: v.literal("create_org_task"),
      title: v.string(),
      body: v.optional(v.string()),
    }),
    v.object({
      type: v.literal("create_file_task"),
      relatedFileId: v.string(),
      title: v.string(),
      body: v.optional(v.string()),
      triageLabelId: v.optional(v.string()),
      triageLabelName: v.optional(v.string()),
      category: v.optional(v.literal("call")),
      status: v.optional(v.literal("todo")),
    }),
    v.object({
      type: v.literal("enqueue_integration_job"),
      category: v.union(
        v.literal("crm"),
        v.literal("email"),
        v.literal("messaging"),
      ),
      providerKey: v.string(),
      kind: v.union(v.literal("action"), v.literal("sync_push")),
      connectorPublicId: v.optional(v.string()),
    }),
    v.object({
      type: v.literal("upsert_pipeline_lead"),
      defaultStatus: v.optional(v.string()),
    }),
  ),
});

export const getByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    return await ctx.db
      .query("organizationIntegrationWorkflows")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
  },
});

/**
 * Replace org integration automation rules (inbound webhook side effects).
 */
export const replaceRules = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    rules: v.array(orgIntegrationRuleV),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const cleaned = sanitizeOrganizationIntegrationRules(args.rules);
    if (cleaned.length > 0) {
      await assertOrgPlanFeature(ctx, args.organizationId, "integrations");
    }
    const now = Date.now();
    const row = {
      organizationId: args.organizationId,
      updatedAt: now,
      formatVersion: 1 as const,
      rules: cleaned,
    };
    const existing = await ctx.db
      .query("organizationIntegrationWorkflows")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("organizationIntegrationWorkflows", row);
  },
});
