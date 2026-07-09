/**
 * Phase 13.3 — Normalized client/project list + rollup queries.
 */
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgMember } from "./organizationAccess";
import {
  filterPipelineRowsForMember,
  resolveClientAccessLevel,
  resolveProjectAccessLevel,
  resolveRowOwnerUserId,
} from "./resourceAccess";
import { resolveFileHierarchy } from "./pipelineHierarchyCompat";
import {
  computeClientRollup,
  computeProjectRollup,
} from "./pipelineHierarchyRollups";
import {
  loadPipelineFilesForClient,
  loadPipelineFilesForProject,
  loadProjectsForClient,
  resolveProjectClientAssociations,
} from "./pipelineHierarchyCompat";

const memberUserKeyArg = {
  memberUserKey: v.string(),
};

async function filterClientsForMember(
  ctx: QueryCtx,
  rows: Doc<"clients">[],
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"clients">[]> {
  const scoped = rows.filter((r) => r.organizationId === organizationId);
  const out: Doc<"clients">[] = [];
  for (const row of scoped) {
    const level = await resolveClientAccessLevel(ctx, row, memberUserKey);
    if (level !== "none") out.push(row);
  }
  return out;
}

async function filterProjectsForMember(
  ctx: QueryCtx,
  rows: Doc<"projects">[],
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"projects">[]> {
  const scoped = rows.filter((r) => r.organizationId === organizationId);
  const out: Doc<"projects">[] = [];
  for (const row of scoped) {
    const level = await resolveProjectAccessLevel(ctx, row, memberUserKey);
    if (level !== "none") out.push(row);
  }
  return out;
}

export const listClients = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const visible = await filterClientsForMember(
      ctx,
      rows,
      args.organizationId,
      args.memberUserKey,
    );
    return visible
      .map((c) => ({
        _id: c._id,
        displayName: c.displayName,
        normalizedName: c.normalizedName,
        ownerUserId: c.ownerUserId,
        primaryContactName: c.primaryContactName,
        primaryContactEmail: c.primaryContactEmail,
        primaryContactPhone: c.primaryContactPhone,
        companyName: c.companyName,
        entityType: c.entityType,
        ein: c.ein,
        stateOfIncorporation: c.stateOfIncorporation,
        dateOfFormation: c.dateOfFormation,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});

export const getClientHubDetail = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return null;
    }
    const accessLevel = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (accessLevel === "none") return null;
    return {
      client,
      canEdit: accessLevel === "edit",
    };
  },
});

/** Resolve whether a registry contact already owns a client workspace. */
export const findClientForContact = query({
  args: {
    organizationId: v.id("organizations"),
    contactId: v.id("contacts"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.organizationId !== args.organizationId) {
      return null;
    }
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const client =
      rows.find(
        (c) =>
          c.primaryContactId != null &&
          String(c.primaryContactId) === String(args.contactId),
      ) ?? null;
    if (!client) return { clientId: null as null, displayName: null as null };
    const level = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (level === "none") {
      return { clientId: null as null, displayName: null as null };
    }
    return { clientId: client._id, displayName: client.displayName };
  },
});

export const listProjectsForClient = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return [];
    }
    const level = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (level === "none") return [];
    const rows = await loadProjectsForClient(ctx, args.clientId);
    const visible = await filterProjectsForMember(
      ctx,
      rows,
      args.organizationId,
      args.memberUserKey,
    );
    return await Promise.all(
      visible.map(async (p) => {
        const associations = await resolveProjectClientAssociations(ctx, p);
        return {
          _id: p._id,
          clientId: p.clientId,
          title: p.title,
          normalizedTitle: p.normalizedTitle,
          purpose: p.purpose,
          status: p.status,
          targetFunding: p.targetFunding,
          completionPercent: p.completionPercent,
          ownerUserId: p.ownerUserId,
          linkedClients: associations.linkedClients,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }),
    ).then((rows) => rows.sort((a, b) => a.title.localeCompare(b.title)));
  },
});

export const listFilesForProject = query({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      return [];
    }
    const level = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (level === "none") return [];
    const rows = await loadPipelineFilesForProject(ctx, args.projectId);
    const visible = await filterPipelineRowsForMember(
      ctx,
      rows,
      args.organizationId,
      args.memberUserKey,
    );
    return await Promise.all(
      visible.map(async (f) => {
        const hierarchy = await resolveFileHierarchy(ctx, f);
        return {
          _id: f._id,
          fileName: f.fileName,
          status: f.status,
          fundingAmount: f.fundingAmount,
          clientId: f.clientId,
          projectId: f.projectId,
          ownerUserId: resolveRowOwnerUserId(f),
          hierarchy,
          linkedClients: hierarchy.linkedClients,
          updatedAt: f.updatedAt,
        };
      }),
    );
  },
});

export const getClientRollup = query({
  args: {
    organizationId: v.id("organizations"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return null;
    }
    const level = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (level === "none") return null;
    const rollup = await computeClientRollup(ctx, args.clientId, client);
    return {
      ...rollup,
      displayName: client.displayName,
      accessLevel: level,
    };
  },
});

/** Resolve client/project for a loan file (FK or legacy virtual). */
export const resolvePipelineFileHierarchy = query({
  args: {
    fileId: v.id("pipeline"),
    organizationId: v.id("organizations"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.organizationId !== args.organizationId) {
      return null;
    }
    const visible = await filterPipelineRowsForMember(
      ctx,
      [file],
      args.organizationId,
      args.memberUserKey,
    );
    if (visible.length === 0) return null;
    return resolveFileHierarchy(ctx, file);
  },
});

export const getProjectRollup = query({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      return null;
    }
    const level = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (level === "none") return null;
    const rollup = await computeProjectRollup(ctx, args.projectId, project);
    return {
      ...rollup,
      title: project.title,
      clientId: project.clientId,
      status: project.status,
      accessLevel: level,
    };
  },
});
