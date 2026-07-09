/**
 * Phase 15 Step 7 — cascade graph + junction cleanup for hierarchy deletes.
 * Phase 15 Step 10 — transactional cascade delete for projects/clients.
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { deletePipelineGraph } from "./graphCleanup";

export async function deleteResourceSharesForEntity(
  ctx: MutationCtx,
  resourceType: "client" | "project" | "pipeline",
  resourceId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", resourceType).eq("resourceId", resourceId),
    )
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

/** Remove all indexed + junction edges for a pipeline file (before row delete). */
export async function deleteIndexedGraphEdgesForFile(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<void> {
  const tables = [
    "fileClients",
    "fileProjects",
    "fileLenders",
    "fileReferralPartners",
    "fileTeamMembers",
    "fileTasks",
  ] as const;

  for (const table of tables) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }

  const loanClients = await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline", (q) => q.eq("pipelineId", fileId))
    .collect();
  for (const row of loanClients) {
    await ctx.db.delete(row._id);
  }
}

/** Cascade-delete project-scoped graph edges and junction rows. */
export async function deleteProjectGraphEdges(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<void> {
  const projectTables = [
    "projectClients",
    "projectLenders",
    "projectReferralPartners",
    "projectTeamMembers",
    "projectTasks",
  ] as const;

  for (const table of projectTables) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }

  for (const table of [
    "projectCapitalRequirements",
    "projectCapitalSources",
    "projectCapitalAllocations",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }

  await deleteResourceSharesForEntity(ctx, "project", String(projectId));
}

/** Cascade-delete client-scoped junction rows (client must have zero projects). */
export async function deleteClientGraphEdges(
  ctx: MutationCtx,
  clientId: Id<"clients">,
): Promise<void> {
  const projectLinks = await ctx.db
    .query("projectClients")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  for (const row of projectLinks) {
    await ctx.db.delete(row._id);
  }

  const loanLinks = await ctx.db
    .query("loanClients")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  for (const row of loanLinks) {
    await ctx.db.delete(row._id);
  }

  const fileLinks = await ctx.db
    .query("fileClients")
    .withIndex("by_entity", (q) => q.eq("clientId", clientId))
    .collect();
  for (const row of fileLinks) {
    await ctx.db.delete(row._id);
  }

  const entityLinksAsParent = await ctx.db
    .query("clientEntityLinks")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  for (const row of entityLinksAsParent) {
    await ctx.db.delete(row._id);
  }

  const entityLinksAsChild = await ctx.db
    .query("clientEntityLinks")
    .withIndex("by_linked_client", (q) => q.eq("linkedClientId", clientId))
    .collect();
  for (const row of entityLinksAsChild) {
    await ctx.db.delete(row._id);
  }

  const clientContactLinks = await ctx.db
    .query("clientContactLinks")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  for (const row of clientContactLinks) {
    await ctx.db.delete(row._id);
  }

  const entityContactLinksByClient = await ctx.db
    .query("entityContactLinks")
    .withIndex("by_entity", (q) => q.eq("entityId", clientId))
    .collect();
  for (const row of entityContactLinksByClient) {
    await ctx.db.delete(row._id);
  }

  await deleteResourceSharesForEntity(ctx, "client", String(clientId));
}

/** Delete all loan files for a project (does not delete the project row). */
export async function deleteAllPipelineFilesForProject(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<number> {
  const files = await ctx.db
    .query("pipeline")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();
  for (const file of files) {
    await deletePipelineGraph(ctx, file._id);
  }
  return files.length;
}

/**
 * Phase 15 Step 10 — delete project + nested loan files + project graph edges.
 * Runs in a single Convex mutation (transactional).
 */
export async function cascadeDeleteProject(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<{ deletedFileCount: number }> {
  const deletedFileCount = await deleteAllPipelineFilesForProject(ctx, projectId);
  await deleteProjectGraphEdges(ctx, projectId);
  await ctx.db.delete(projectId);
  return { deletedFileCount };
}

/**
 * Phase 15 Step 10 — delete client, all owned projects, and nested loan files.
 * Runs in a single Convex mutation (transactional).
 */
export async function cascadeDeleteClient(
  ctx: MutationCtx,
  clientId: Id<"clients">,
): Promise<{ deletedProjectCount: number; deletedFileCount: number }> {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();

  let deletedFileCount = 0;
  for (const project of projects) {
    deletedFileCount += await deleteAllPipelineFilesForProject(ctx, project._id);
    await deleteProjectGraphEdges(ctx, project._id);
    await ctx.db.delete(project._id);
  }

  const remainingFiles = await ctx.db
    .query("pipeline")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .collect();
  for (const file of remainingFiles) {
    await deletePipelineGraph(ctx, file._id);
    deletedFileCount += 1;
  }

  await deleteClientGraphEdges(ctx, clientId);
  await ctx.db.delete(clientId);
  return { deletedProjectCount: projects.length, deletedFileCount };
}
