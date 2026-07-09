import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  maxOrgMembersForPlan,
  maxPipelineFilesForPlan,
  PLAN_LIMIT_UPGRADE_PATH,
} from "../lib/orgPlanLimits";
import { normalizeOrganizationPlan, type OrganizationPlan } from "../lib/orgPlanFeatures";

async function planForOrg(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<OrganizationPlan> {
  const org = await ctx.db.get(organizationId);
  return normalizeOrganizationPlan(org?.plan);
}

export async function countOrgPipelineFiles(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  return rows.length;
}

export async function countOrgMembers(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<number> {
  const rows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  return rows.length;
}

/** Call before inserting a new `pipeline` row with this `organizationId`. */
export async function assertCanAddOrgPipelineFile(
  ctx: MutationCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<void> {
  if (!organizationId) return;
  const plan = await planForOrg(ctx, organizationId);
  const max = maxPipelineFilesForPlan(plan);
  if (max === null) return;
  const n = await countOrgPipelineFiles(ctx, organizationId);
  if (n >= max) {
    throw new Error(
      `Pipeline file limit reached: this team has ${n} of ${max} files allowed on the ${plan} plan. ${PLAN_LIMIT_UPGRADE_PATH}`,
    );
  }
}

/** Call before inserting a new `organizationMembers` row (not updates). */
export async function assertOrgHasAvailableMemberSeat(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
): Promise<void> {
  const plan = await planForOrg(ctx, organizationId);
  const max = maxOrgMembersForPlan(plan);
  if (max === null) return;
  const n = await countOrgMembers(ctx, organizationId);
  if (n >= max) {
    throw new Error(
      `Member limit reached: this team has ${n} of ${max} seats on the ${plan} plan. Remove a member or upgrade — ${PLAN_LIMIT_UPGRADE_PATH}`,
    );
  }
}
