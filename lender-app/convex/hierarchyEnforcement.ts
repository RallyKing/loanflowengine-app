/**
 * Phase 1 — Client → Project → File hierarchy enforcement for pipeline creates.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const pipelineHierarchyFkArgs = {
  clientId: v.optional(v.id("clients")),
  projectId: v.optional(v.id("projects")),
  /**
   * Legacy intake / deal-data-only file creation. When true, clientId and
   * projectId may be omitted. New hierarchy-native flows must omit this flag.
   */
  allowLegacyHierarchyBypass: v.optional(v.boolean()),
};

export type PipelineHierarchyFkInput = {
  organizationId?: Id<"organizations">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  allowLegacyHierarchyBypass?: boolean;
};

export type ResolvedPipelineHierarchyFks = {
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
};

async function assertClientInOrg(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  organizationId: Id<"organizations"> | undefined,
): Promise<Doc<"clients">> {
  const client = await ctx.db.get(clientId);
  if (!client) {
    throw new Error("Client not found.");
  }
  if (organizationId && client.organizationId !== organizationId) {
    throw new Error("Client does not belong to this organization.");
  }
  return client;
}

async function assertProjectBelongsToClient(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  clientId: Id<"clients">,
  organizationId: Id<"organizations"> | undefined,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }
  if (organizationId && project.organizationId !== organizationId) {
    throw new Error("Project does not belong to this organization.");
  }
  if (String(project.clientId) !== String(clientId)) {
    throw new Error("Project does not belong to the specified client.");
  }
  return project;
}

/**
 * Validates hierarchy FKs for a new pipeline row.
 * Default: requires clientId + projectId. Legacy flows pass allowLegacyHierarchyBypass.
 */
export async function resolvePipelineHierarchyForCreate(
  ctx: MutationCtx,
  args: PipelineHierarchyFkInput,
): Promise<ResolvedPipelineHierarchyFks> {
  const bypass = args.allowLegacyHierarchyBypass === true;
  const hasClient = args.clientId != null;
  const hasProject = args.projectId != null;

  if (hasClient && hasProject) {
    await assertClientInOrg(ctx, args.clientId!, args.organizationId);
    await assertProjectBelongsToClient(
      ctx,
      args.projectId!,
      args.clientId!,
      args.organizationId,
    );
    return { clientId: args.clientId, projectId: args.projectId };
  }

  if (bypass) {
    return {};
  }

  throw new Error(
    "clientId and projectId are required for new loan files. Pass allowLegacyHierarchyBypass: true only for legacy intake flows.",
  );
}
