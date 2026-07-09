/**
 * Phase 14 Step 1 — projectClients / loanClients loaders and primary sync.
 * Relationship links do not grant ACL; ownership and resourceShares unchanged.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  compareClientLinks,
  type ClientRelationshipType,
  type LinkedClientSummary,
} from "../lib/pipelineClientRelationships";
import { syncPrimaryFileClientEdge } from "./indexedGraphEdgeSync";

const PRIMARY_SORT = 0;

export async function findProjectClientLink(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  clientId: Id<"clients">,
): Promise<Doc<"projectClients"> | null> {
  return (
    (await ctx.db
      .query("projectClients")
      .withIndex("by_project_client", (q) =>
        q.eq("projectId", projectId).eq("clientId", clientId),
      )
      .first()) ?? null
  );
}

export async function findLoanClientLink(
  ctx: QueryCtx | MutationCtx,
  pipelineId: Id<"pipeline">,
  clientId: Id<"clients">,
): Promise<Doc<"loanClients"> | null> {
  return (
    (await ctx.db
      .query("loanClients")
      .withIndex("by_pipeline_client", (q) =>
        q.eq("pipelineId", pipelineId).eq("clientId", clientId),
      )
      .first()) ?? null
  );
}

export async function listProjectClientLinks(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projectClients">[]> {
  return await ctx.db
    .query("projectClients")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
}

export async function listLoanClientLinks(
  ctx: QueryCtx | MutationCtx,
  pipelineId: Id<"pipeline">,
): Promise<Doc<"loanClients">[]> {
  return await ctx.db
    .query("loanClients")
    .withIndex("by_pipeline", (q) => q.eq("pipelineId", pipelineId))
    .collect();
}

async function clientSummary(
  ctx: QueryCtx | MutationCtx,
  clientId: Id<"clients">,
  relationshipType: ClientRelationshipType,
  sortOrder: number,
  isAuthoritativePrimary: boolean,
): Promise<LinkedClientSummary | null> {
  const client = await ctx.db.get(clientId);
  if (!client) return null;
  return {
    clientId: String(client._id),
    displayName: client.displayName,
    normalizedName: client.normalizedName,
    relationshipType,
    sortOrder,
    isAuthoritativePrimary,
  };
}

export async function resolveProjectLinkedClients(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
): Promise<LinkedClientSummary[]> {
  const links = await listProjectClientLinks(ctx, project._id);
  const summaries: LinkedClientSummary[] = [];
  for (const link of links) {
    const summary = await clientSummary(
      ctx,
      link.clientId,
      link.relationshipType,
      link.sortOrder,
      String(link.clientId) === String(project.clientId) &&
        link.relationshipType === "primary",
    );
    if (summary) summaries.push(summary);
  }
  if (summaries.length === 0) {
    const primary = await clientSummary(
      ctx,
      project.clientId,
      "primary",
      PRIMARY_SORT,
      true,
    );
    if (primary) summaries.push(primary);
  }
  return summaries.sort(compareClientLinks);
}

export async function resolveLoanLinkedClients(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
): Promise<LinkedClientSummary[]> {
  const links = await listLoanClientLinks(ctx, row._id);
  const fileEdges = await ctx.db
    .query("fileClients")
    .withIndex("by_file", (q) => q.eq("fileId", row._id))
    .collect();

  const merged = new Map<
    string,
    {
      clientId: Id<"clients">;
      relationshipType: ClientRelationshipType;
      sortOrder: number;
    }
  >();

  for (const edge of fileEdges) {
    merged.set(String(edge.clientId), {
      clientId: edge.clientId,
      relationshipType: edge.relationshipType,
      sortOrder: edge.sortOrder,
    });
  }
  for (const link of links) {
    merged.set(String(link.clientId), {
      clientId: link.clientId,
      relationshipType: link.relationshipType,
      sortOrder: link.sortOrder,
    });
  }

  const summaries: LinkedClientSummary[] = [];
  for (const entry of merged.values()) {
    const summary = await clientSummary(
      ctx,
      entry.clientId,
      entry.relationshipType,
      entry.sortOrder,
      row.clientId != null &&
        String(entry.clientId) === String(row.clientId) &&
        entry.relationshipType === "primary",
    );
    if (summary) summaries.push(summary);
  }

  if (summaries.length === 0 && row.clientId) {
    const primary = await clientSummary(
      ctx,
      row.clientId,
      "primary",
      PRIMARY_SORT,
      true,
    );
    if (primary) summaries.push(primary);
  }
  return summaries.sort(compareClientLinks);
}

export async function linkedClientDisplayNamesForPipeline(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
): Promise<string[]> {
  const linked = await resolveLoanLinkedClients(ctx, row);
  return linked.map((l) => l.displayName);
}

export async function ensurePrimaryProjectClientLink(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<"inserted" | "exists" | "skipped"> {
  const existing = await findProjectClientLink(
    ctx,
    project._id,
    project.clientId,
  );
  const now = Date.now();
  if (existing) {
    if (
      existing.relationshipType !== "primary" ||
      existing.sortOrder !== PRIMARY_SORT
    ) {
      await ctx.db.patch(existing._id, {
        relationshipType: "primary",
        sortOrder: PRIMARY_SORT,
        updatedAt: now,
      });
      return "exists";
    }
    return "exists";
  }
  await ctx.db.insert("projectClients", {
    organizationId: project.organizationId,
    projectId: project._id,
    clientId: project.clientId,
    relationshipType: "primary",
    sortOrder: PRIMARY_SORT,
    createdAt: now,
    updatedAt: now,
  });
  return "inserted";
}

export async function ensurePrimaryLoanClientLink(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
): Promise<"inserted" | "exists" | "skipped"> {
  if (!row.clientId || !row.organizationId) return "skipped";
  const existing = await findLoanClientLink(ctx, row._id, row.clientId);
  const now = Date.now();
  if (existing) {
    if (
      existing.relationshipType !== "primary" ||
      existing.sortOrder !== PRIMARY_SORT
    ) {
      await ctx.db.patch(existing._id, {
        relationshipType: "primary",
        sortOrder: PRIMARY_SORT,
        updatedAt: now,
      });
      await syncPrimaryFileClientEdge(ctx, row);
      return "exists";
    }
    return "exists";
  }
  await ctx.db.insert("loanClients", {
    organizationId: row.organizationId,
    pipelineId: row._id,
    clientId: row.clientId,
    relationshipType: "primary",
    sortOrder: PRIMARY_SORT,
    createdAt: now,
    updatedAt: now,
  });
  await syncPrimaryFileClientEdge(ctx, row);
  return "inserted";
}

export async function loadProjectsForClientExpanded(
  ctx: QueryCtx,
  clientId: Id<"clients">,
): Promise<Doc<"projects">[]> {
  const byFk = await ctx.db
    .query("projects")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  const seen = new Set(byFk.map((p) => String(p._id)));
  const junction = await ctx.db
    .query("projectClients")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  const out = [...byFk];
  for (const link of junction) {
    const id = String(link.projectId);
    if (seen.has(id)) continue;
    const project = await ctx.db.get(link.projectId);
    if (project) {
      seen.add(id);
      out.push(project);
    }
  }
  return out;
}

export async function loadPipelineFilesForClientExpanded(
  ctx: QueryCtx,
  clientId: Id<"clients">,
): Promise<Doc<"pipeline">[]> {
  const byFk = await ctx.db
    .query("pipeline")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .collect();
  const seen = new Set(byFk.map((f) => String(f._id)));
  const junction = await ctx.db
    .query("loanClients")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  const out = [...byFk];
  for (const link of junction) {
    const id = String(link.pipelineId);
    if (seen.has(id)) continue;
    const file = await ctx.db.get(link.pipelineId);
    if (file) {
      seen.add(id);
      out.push(file);
    }
  }
  return out;
}

export type MultiClientDriftIssue = {
  kind: "project_primary_mismatch" | "loan_primary_mismatch" | "duplicate_project_client" | "duplicate_loan_client" | "orphan_primary_project" | "orphan_primary_loan";
  id: string;
  detail: string;
};

export async function detectMultiClientDrift(
  ctx: QueryCtx | MutationCtx,
): Promise<MultiClientDriftIssue[]> {
  const issues: MultiClientDriftIssue[] = [];

  const projects = await ctx.db.query("projects").collect();
  for (const project of projects) {
    const links = await listProjectClientLinks(ctx, project._id);
    const keyCounts = new Map<string, number>();
    for (const link of links) {
      const key = String(link.clientId);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of keyCounts) {
      if (count > 1) {
        issues.push({
          kind: "duplicate_project_client",
          id: String(project._id),
          detail: `client ${key} linked ${count} times`,
        });
      }
    }
    const primaryLinks = links.filter((l) => l.relationshipType === "primary");
    const authPrimary = links.find(
      (l) => String(l.clientId) === String(project.clientId),
    );
    if (authPrimary && authPrimary.relationshipType !== "primary") {
      issues.push({
        kind: "project_primary_mismatch",
        id: String(project._id),
        detail: "authoritative clientId link is not typed primary",
      });
    }
    if (
      primaryLinks.length > 0 &&
      !primaryLinks.some((l) => String(l.clientId) === String(project.clientId))
    ) {
      issues.push({
        kind: "project_primary_mismatch",
        id: String(project._id),
        detail: "primary junction clientId does not match projects.clientId",
      });
    }
    if (links.length > 0 && !authPrimary) {
      issues.push({
        kind: "orphan_primary_project",
        id: String(project._id),
        detail: "junction rows exist but none mirror projects.clientId",
      });
    }
  }

  const files = await ctx.db.query("pipeline").collect();
  for (const file of files) {
    if (!file.clientId) continue;
    const links = await listLoanClientLinks(ctx, file._id);
    const keyCounts = new Map<string, number>();
    for (const link of links) {
      const key = String(link.clientId);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of keyCounts) {
      if (count > 1) {
        issues.push({
          kind: "duplicate_loan_client",
          id: String(file._id),
          detail: `client ${key} linked ${count} times`,
        });
      }
    }
    const primaryLinks = links.filter((l) => l.relationshipType === "primary");
    const authPrimary = links.find(
      (l) => String(l.clientId) === String(file.clientId),
    );
    if (authPrimary && authPrimary.relationshipType !== "primary") {
      issues.push({
        kind: "loan_primary_mismatch",
        id: String(file._id),
        detail: "authoritative clientId link is not typed primary",
      });
    }
    if (
      primaryLinks.length > 0 &&
      !primaryLinks.some((l) => String(l.clientId) === String(file.clientId))
    ) {
      issues.push({
        kind: "loan_primary_mismatch",
        id: String(file._id),
        detail: "primary junction clientId does not match pipeline.clientId",
      });
    }
  }

  return issues;
}
