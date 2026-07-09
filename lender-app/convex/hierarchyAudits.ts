/**
 * Phase 1 — Orphan detection for Client → Project → File hierarchy integrity.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertOrgMember, assertOrgPermission } from "./organizationAccess";
import {
  normalizePipelineClientId,
  normalizePipelineProjectId,
} from "./hubDeletionTargets";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

const DEFAULT_CAP = 200;
const MAX_CAP = 500;

type OrphanedFileReason = "missing_project" | "invalid_project";
type OrphanedProjectReason = "missing_client" | "invalid_client";

export type OrphanedFileRow = {
  _id: Id<"pipeline">;
  fileName: string;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  reason: OrphanedFileReason;
};

export type OrphanedProjectRow = {
  _id: Id<"projects">;
  title: string;
  clientId?: Id<"clients">;
  reason: OrphanedProjectReason;
};

export type GhostClientRow = {
  _id: Id<"clients">;
  displayName: string;
  primaryContactId: Id<"contacts">;
};

async function scanOrphanedFiles(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cap: number,
): Promise<OrphanedFileRow[]> {
  const rows = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .take(Math.min(cap * 4, 2000));

  const out: OrphanedFileRow[] = [];
  for (const row of rows) {
    if (out.length >= cap) break;
    if (row.archivedAt != null) continue;

    const normalizedProjectId = normalizePipelineProjectId(
      ctx,
      row.projectId ? String(row.projectId) : null,
    );

    if (!row.projectId || normalizedProjectId == null) {
      out.push({
        _id: row._id,
        fileName: row.fileName,
        clientId: row.clientId,
        projectId: row.projectId,
        reason: row.projectId ? "invalid_project" : "missing_project",
      });
      continue;
    }

    const project = await ctx.db.get(normalizedProjectId);
    if (!project || project.organizationId !== organizationId) {
      out.push({
        _id: row._id,
        fileName: row.fileName,
        clientId: row.clientId,
        projectId: normalizedProjectId,
        reason: "invalid_project",
      });
    }
  }
  return out;
}

async function scanOrphanedProjects(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cap: number,
): Promise<OrphanedProjectRow[]> {
  const rows = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  const out: OrphanedProjectRow[] = [];
  for (const project of rows) {
    if (out.length >= cap) break;

    const normalizedClientId = normalizePipelineClientId(
      ctx,
      String(project.clientId),
    );

    if (!project.clientId || normalizedClientId == null) {
      out.push({
        _id: project._id,
        title: project.title,
        clientId: project.clientId,
        reason: project.clientId ? "invalid_client" : "missing_client",
      });
      continue;
    }

    const client = await ctx.db.get(normalizedClientId);
    if (!client || client.organizationId !== organizationId) {
      out.push({
        _id: project._id,
        title: project.title,
        clientId: normalizedClientId,
        reason: "invalid_client",
      });
    }
  }
  return out;
}

async function scanGhostClients(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cap: number,
): Promise<GhostClientRow[]> {
  const rows = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  const out: GhostClientRow[] = [];
  for (const client of rows) {
    if (out.length >= cap) break;
    if (!client.primaryContactId) continue;
    const contact = await ctx.db.get(client.primaryContactId);
    if (!contact) {
      out.push({
        _id: client._id,
        displayName: client.displayName,
        primaryContactId: client.primaryContactId,
      });
    }
  }
  return out;
}

export const getOrphanedRecords = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "contacts.view",
    );

    const cap = Math.min(
      MAX_CAP,
      Math.max(1, args.limit ?? DEFAULT_CAP),
    );
    const scannedAt = Date.now();

    const [orphanedFiles, orphanedProjects, ghostClients] = await Promise.all([
      scanOrphanedFiles(ctx, args.organizationId, cap),
      scanOrphanedProjects(ctx, args.organizationId, cap),
      scanGhostClients(ctx, args.organizationId, cap),
    ]);

    return {
      scannedAt,
      cap,
      orphanedFiles,
      orphanedProjects,
      ghostClients,
      summary: {
        orphanedFileCount: orphanedFiles.length,
        orphanedProjectCount: orphanedProjects.length,
        ghostClientCount: ghostClients.length,
      },
    };
  },
});
