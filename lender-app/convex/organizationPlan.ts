import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrgMember, resolveMemberUserKey } from "./organizationAccess";
import {
  adminRequiredReferencesAdvanced,
  layoutExposesAdvancedBlock,
  normalizeOrganizationPlan,
  planHasFeature,
  stripAdvancedBlocksHiddenForPlan,
  type OrgFeatureKey,
  type OrganizationPlan,
} from "../lib/orgPlanFeatures";
import {
  maxOrgMembersForPlan,
  maxPipelineFilesForPlan,
  PLAN_LIMIT_UPGRADE_PATH,
} from "../lib/orgPlanLimits";
import {
  countOrgMembers,
  countOrgPipelineFiles,
} from "./orgPlanLimits";
import type { PipelineDrawerLayoutV1 } from "../lib/pipelineDrawerLayoutStorage";
import { finalizeFileDrawerLayoutForPersist } from "./pipelineGlobalBlockConfigHelpers";

export async function resolveOrganizationPlanForCtx(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<OrganizationPlan> {
  if (!organizationId) return "enterprise";
  const org = await ctx.db.get(organizationId);
  return normalizeOrganizationPlan(org?.plan);
}

export async function assertOrgPlanFeature(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  feature: OrgFeatureKey,
): Promise<void> {
  if (!organizationId) return;
  const org = await ctx.db.get(organizationId);
  const plan = normalizeOrganizationPlan(org?.plan);
  if (!planHasFeature(plan, feature)) {
    throw new Error(planFeatureErrorMessage(feature));
  }
}

function planFeatureErrorMessage(feature: OrgFeatureKey): string {
  switch (feature) {
    case "advanced_blocks":
      return `Advanced pipeline sections require Pro or Enterprise. ${PLAN_LIMIT_UPGRADE_PATH}`;
    case "automation":
      return `Automation (workflows, scheduled actions) requires Pro or Enterprise. ${PLAN_LIMIT_UPGRADE_PATH}`;
    case "integrations":
      return `Integration connectors and jobs require Enterprise. ${PLAN_LIMIT_UPGRADE_PATH}`;
  }
}

export async function assertDrawerLayoutAllowedForOrgPlan(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  layout: PipelineDrawerLayoutV1,
): Promise<void> {
  if (!organizationId) return;
  if (!layoutExposesAdvancedBlock(layout)) return;
  await assertOrgPlanFeature(ctx, organizationId, "advanced_blocks");
}

/** Finalize server layout and hide advanced blocks for orgs without that entitlement. */
export async function finalizeDrawerLayoutRespectingOrgPlan(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
  layout: PipelineDrawerLayoutV1,
): Promise<PipelineDrawerLayoutV1> {
  const plan = await resolveOrganizationPlanForCtx(ctx, organizationId);
  const stripped = stripAdvancedBlocksHiddenForPlan(layout, plan);
  return finalizeFileDrawerLayoutForPersist(ctx, stripped);
}

const organizationPlanV = v.union(
  v.literal("basic"),
  v.literal("pro"),
  v.literal("enterprise"),
);

export const featureEntitlements = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    await assertOrgMember(ctx, organizationId, key);
    const plan = await resolveOrganizationPlanForCtx(ctx, organizationId);
    const maxPipelineFiles = maxPipelineFilesForPlan(plan);
    const maxMembers = maxOrgMembersForPlan(plan);
    const [pipelineFileCount, memberCount] = await Promise.all([
      countOrgPipelineFiles(ctx, organizationId),
      countOrgMembers(ctx, organizationId),
    ]);
    return {
      plan,
      advanced_blocks: planHasFeature(plan, "advanced_blocks"),
      automation: planHasFeature(plan, "automation"),
      integrations: planHasFeature(plan, "integrations"),
      limits: {
        maxPipelineFiles,
        maxMembers,
      },
      usage: {
        pipelineFileCount,
        memberCount,
      },
      atPipelineFileLimit:
        maxPipelineFiles !== null && pipelineFileCount >= maxPipelineFiles,
      atMemberLimit: maxMembers !== null && memberCount >= maxMembers,
    };
  },
});

/**
 * Manual plan assignment only (no billing). Requires product role permission
 * `org.roles.manage`.
 */
export const setOrganizationPlan = mutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    plan: organizationPlanV,
  },
  handler: async (ctx, { organizationId, actorUserKey, plan }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      actorUserKey,
      "org.roles.manage",
    );
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found.");
    const st = (org.subscriptionStatus ?? "").trim();
    if (
      org.planSource === "stripe" &&
      org.stripeSubscriptionId?.trim() &&
      ["active", "trialing", "past_due", "paused"].includes(st)
    ) {
      throw new Error(
        "This team's plan is managed by Stripe. Open Billing to change your subscription.",
      );
    }
    await ctx.db.patch(organizationId, {
      plan,
      planSource: "manual",
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const assertOrgScopedGlobalBlockConfigAllowed = async (
  ctx: MutationCtx,
  rbacOrganizationId: Id<"organizations">,
  layout: PipelineDrawerLayoutV1,
  adminRequiredBlockIds: string[],
): Promise<void> => {
  const exposesAdvanced =
    layoutExposesAdvancedBlock(layout) ||
    adminRequiredReferencesAdvanced(adminRequiredBlockIds);
  if (exposesAdvanced) {
    await assertOrgPlanFeature(ctx, rbacOrganizationId, "advanced_blocks");
  }
};

export const assertGlobalTemplateSyncAllowedForOrg = async (
  ctx: MutationCtx,
  rbacOrganizationId: Id<"organizations">,
  templateLayout: PipelineDrawerLayoutV1,
): Promise<void> => {
  if (layoutExposesAdvancedBlock(templateLayout)) {
    await assertOrgPlanFeature(ctx, rbacOrganizationId, "advanced_blocks");
  }
};
