import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertOrgMember,
  resolveMemberUserKey,
} from "./organizationAccess";
import { assertOrgPlanFeature } from "./organizationPlan";
import { userWorkflowRulesUseIntegrations } from "../lib/orgPlanFeatures";
import { sanitizeUserSimpleWorkflowRules } from "../lib/userWorkflowsModel";

const userWorkflowRuleV = v.object({
  id: v.string(),
  enabled: v.boolean(),
  name: v.optional(v.string()),
  trigger: v.union(
    v.object({ type: v.literal("file_created") }),
    v.object({ type: v.literal("lender_selected") }),
    v.object({ type: v.literal("lender_attached") }),
  ),
  action: v.union(
    v.object({
      type: v.literal("show_drawer_block"),
      blockId: v.string(),
    }),
    v.object({
      type: v.literal("create_task_reminder"),
      title: v.string(),
      body: v.optional(v.string()),
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
      type: v.literal("emit_automation_webhook"),
      includeFileSnapshot: v.boolean(),
    }),
  ),
});

/**
 * Load persisted simple workflows for this account (or `null`).
 */
export const getByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const trimmed = accountId.trim();
    if (!trimmed) return null;
    return await ctx.db
      .query("userSimpleWorkflows")
      .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
      .unique();
  },
});

/**
 * Replace the full rules list. Each write re-sanitizes to the whitelisted model.
 */
export const replaceRules = mutation({
  args: {
    accountId: v.string(),
    rules: v.array(userWorkflowRuleV),
    organizationId: v.optional(v.id("organizations")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, rules, organizationId, memberUserKey }) => {
    const trimmed = accountId.trim();
    if (!trimmed) {
      throw new Error("accountId is required");
    }
    const cleaned = sanitizeUserSimpleWorkflowRules(rules);
    if (organizationId) {
      const key = await resolveMemberUserKey(ctx, memberUserKey);
      await assertOrgMember(ctx, organizationId, key);
      if (cleaned.length > 0) {
        await assertOrgPlanFeature(ctx, organizationId, "automation");
      }
      if (userWorkflowRulesUseIntegrations(cleaned)) {
        await assertOrgPlanFeature(ctx, organizationId, "integrations");
      }
    }
    const now = Date.now();
    const row = {
      accountId: trimmed,
      updatedAt: now,
      formatVersion: 1 as const,
      rules: cleaned,
    };
    const existing = await ctx.db
      .query("userSimpleWorkflows")
      .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("userSimpleWorkflows", row);
  },
});
