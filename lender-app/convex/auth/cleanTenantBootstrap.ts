/**
 * Clean tenant bootstrap for new self-service accounts — org shell only, no business data.
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { seedDefaultOrgPipelineStages } from "../organizationPipelineStagesHelpers";
import {
  seedSystemRolesForOrganization,
  syncSystemRolePermissions,
} from "../organizationRbac";

export type CleanBootstrapResult = {
  organizationId: Id<"organizations">;
  adminRoleId: Id<"organizationRoles">;
  pipelineStagesSeeded: number;
};

/**
 * Creates organization + RBAC roles + default pipeline stage config only.
 * Does NOT create tasks, pipeline files, activity, contacts, lenders, or saved views.
 */
export async function bootstrapCleanNewTenant(
  ctx: MutationCtx,
  args: {
    organizationName: string;
    ownerUserKey: string;
  },
): Promise<CleanBootstrapResult> {
  const now = Date.now();
  const name = args.organizationName.trim() || "Workspace";

  const organizationId = await ctx.db.insert("organizations", {
    name,
    plan: "basic",
    createdAt: now,
    updatedAt: now,
  });

  const { adminId } = await seedSystemRolesForOrganization(ctx, organizationId);
  await syncSystemRolePermissions(ctx, organizationId);

  const stageSeed = await seedDefaultOrgPipelineStages(
    ctx,
    organizationId,
    args.ownerUserKey,
  );

  return {
    organizationId,
    adminRoleId: adminId,
    pipelineStagesSeeded: stageSeed.stageCount,
  };
}

export async function countOrgBusinessData(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  const scopeId = String(organizationId);
  const pipeline = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const contacts = await ctx.db
    .query("contacts")
    .withIndex("by_organization_updatedAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const lenders = await ctx.db
    .query("lenders")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const savedViews = await ctx.db
    .query("savedFilterPresets")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();
  const activity = await ctx.db
    .query("activityFeed")
    .withIndex("by_scope_at", (q) =>
      q.eq("scopeKind", "org").eq("scopeId", scopeId),
    )
    .collect();

  return {
    pipelineFiles: pipeline.length,
    tasks: tasks.length,
    contacts: contacts.length,
    lenders: lenders.length,
    savedViews: savedViews.length,
    activityOrgScoped: activity.length,
  };
}
