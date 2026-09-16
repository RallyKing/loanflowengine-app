/**
 * Phase 13.3 — Resolve client/project for a loan file (FK or legacy virtual).
 * Phase 14 Step 1 — expanded client/project association via junction tables.
 */

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  legacyClientProjectFromDealData,
  normalizeHierarchyName,
  toResolvedClientFromLegacy,
  toResolvedProjectFromLegacy,
  type ResolvedFileHierarchy,
  type ResolvedProjectClients,
} from "../lib/pipelineHierarchy";
import {
  loadPipelineFilesForClientExpanded,
  loadProjectsForClientExpanded,
  resolveLoanLinkedClients,
  resolveProjectLinkedClients,
} from "./pipelineMultiClientLinks";
import {
  normalizePipelineClientId,
  normalizePipelineProjectId,
} from "./hubDeletionTargets";

/** Optional preloaded docs so hub first-paint avoids per-file project/client re-gets. */
export type HierarchyDocCaches = {
  projectById?: Map<string, Doc<"projects">>;
  clientById?: Map<string, Doc<"clients">>;
};

function resolveFileHierarchyFromLegacyFields(
  row: Doc<"pipeline">,
  linkedClients: ResolvedFileHierarchy["linkedClients"] = [],
): ResolvedFileHierarchy {
  const legacy = legacyClientProjectFromDealData(row.dealData, row.fileName);
  return {
    resolution: legacy.resolution,
    client: toResolvedClientFromLegacy(legacy.clientName),
    project: toResolvedProjectFromLegacy(
      legacy.projectName,
      legacy.clientName,
    ),
    linkedClients,
  };
}

async function getProjectCached(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  caches?: HierarchyDocCaches,
): Promise<Doc<"projects"> | null> {
  const cached = caches?.projectById?.get(String(projectId));
  if (cached) return cached;
  return await ctx.db.get(projectId);
}

async function getClientCached(
  ctx: QueryCtx,
  clientId: Id<"clients">,
  caches?: HierarchyDocCaches,
): Promise<Doc<"clients"> | null> {
  const cached = caches?.clientById?.get(String(clientId));
  if (cached) return cached;
  return await ctx.db.get(clientId);
}

/** Avoids Convex invalid-id throws when FK fields contain synthetic strings. */
export async function safeResolveFileHierarchy(
  ctx: QueryCtx,
  row: Doc<"pipeline">,
  linkedClientsOverride?: ResolvedFileHierarchy["linkedClients"],
  caches?: HierarchyDocCaches,
): Promise<ResolvedFileHierarchy> {
  try {
    const hasInvalidFk =
      (row.projectId != null &&
        normalizePipelineProjectId(ctx, String(row.projectId)) == null) ||
      (row.clientId != null &&
        normalizePipelineClientId(ctx, String(row.clientId)) == null);
    if (hasInvalidFk) {
      const linkedClients =
        linkedClientsOverride ??
        (await resolveLoanLinkedClients(ctx, row).catch(() => []));
      return resolveFileHierarchyFromLegacyFields(row, linkedClients);
    }
    return await resolveFileHierarchy(
      ctx,
      row,
      linkedClientsOverride,
      caches,
    );
  } catch {
    const linkedClients =
      linkedClientsOverride ??
      (await resolveLoanLinkedClients(ctx, row).catch(() => []));
    return resolveFileHierarchyFromLegacyFields(row, linkedClients);
  }
}

export async function resolveFileHierarchy(
  ctx: QueryCtx,
  row: Doc<"pipeline">,
  linkedClientsOverride?: ResolvedFileHierarchy["linkedClients"],
  caches?: HierarchyDocCaches,
): Promise<ResolvedFileHierarchy> {
  const linkedClients =
    linkedClientsOverride ?? (await resolveLoanLinkedClients(ctx, row));

  const normalizedProjectId = normalizePipelineProjectId(
    ctx,
    row.projectId ? String(row.projectId) : null,
  );
  if (normalizedProjectId) {
    const project = await getProjectCached(ctx, normalizedProjectId, caches);
    if (project) {
      const client = await getClientCached(ctx, project.clientId, caches);
      if (client) {
        return {
          resolution: "foreign_keys",
          client: {
            kind: "record",
            clientId: String(client._id),
            displayName: client.displayName,
            normalizedName: client.normalizedName,
            ownerUserId: client.ownerUserId,
          },
          project: {
            kind: "record",
            projectId: String(project._id),
            clientId: String(client._id),
            title: project.title,
            normalizedTitle: project.normalizedTitle,
            ownerUserId: project.ownerUserId,
            status: project.status,
          },
          linkedClients,
        };
      }
    }
  }

  const normalizedClientId = normalizePipelineClientId(
    ctx,
    row.clientId ? String(row.clientId) : null,
  );
  if (normalizedClientId) {
    const client = await getClientCached(ctx, normalizedClientId, caches);
    if (client) {
      const legacy = legacyClientProjectFromDealData(row.dealData, row.fileName);
      return {
        resolution: "foreign_keys",
        client: {
          kind: "record",
          clientId: String(client._id),
          displayName: client.displayName,
          normalizedName: client.normalizedName,
          ownerUserId: client.ownerUserId,
        },
        project: toResolvedProjectFromLegacy(
          legacy.projectName,
          legacy.clientName,
        ),
        linkedClients,
      };
    }
  }

  const legacy = legacyClientProjectFromDealData(row.dealData, row.fileName);
  return {
    resolution: legacy.resolution,
    client: toResolvedClientFromLegacy(legacy.clientName),
    project: toResolvedProjectFromLegacy(
      legacy.projectName,
      legacy.clientName,
    ),
    linkedClients: linkedClientsOverride ?? [],
  };
}

export async function resolveProjectClientAssociations(
  ctx: QueryCtx,
  project: Doc<"projects">,
): Promise<ResolvedProjectClients> {
  const linkedClients = await resolveProjectLinkedClients(ctx, project);
  return {
    projectId: String(project._id),
    primaryClientId: String(project.clientId),
    linkedClients,
  };
}

export function hierarchyIdentityKey(h: ResolvedFileHierarchy): string {
  if (h.client.kind === "record" && h.project.kind === "record") {
    return `fk:${h.client.clientId}:${h.project.projectId}`;
  }
  return `legacy:${h.client.normalizedName}:${h.project.normalizedTitle}`;
}

export async function loadPipelineFilesForProject(
  ctx: QueryCtx,
  projectId: Id<"projects">,
): Promise<Doc<"pipeline">[]> {
  return await ctx.db
    .query("pipeline")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();
}

/** FK `pipeline.clientId` plus `loanClients` junction (deduped). */
export async function loadPipelineFilesForClient(
  ctx: QueryCtx,
  clientId: Id<"clients">,
): Promise<Doc<"pipeline">[]> {
  return loadPipelineFilesForClientExpanded(ctx, clientId);
}

/** FK `projects.clientId` plus `projectClients` junction (deduped). */
export async function loadProjectsForClient(
  ctx: QueryCtx,
  clientId: Id<"clients">,
): Promise<Doc<"projects">[]> {
  return loadProjectsForClientExpanded(ctx, clientId);
}

export { normalizeHierarchyName };
