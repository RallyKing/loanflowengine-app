/**
 * Phase 14 Step 2 — multi-client link CRUD (ACL unchanged; links do not grant access).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertOrgMember } from "./organizationAccess";
import {
  resolvePipelineAccessLevel,
  resolveProjectAccessLevel,
  ownerFieldsForInsert,
} from "./resourceAccess";
import { normalizeHierarchyName } from "./pipelineHierarchyCompat";
import {
  ensurePrimaryLoanClientLink,
  ensurePrimaryProjectClientLink,
  findLoanClientLink,
  findProjectClientLink,
  listLoanClientLinks,
  listProjectClientLinks,
  resolveLoanLinkedClients,
  resolveProjectLinkedClients,
} from "./pipelineMultiClientLinks";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import {
  addLoanFileClientLink,
  findFileClientEdge,
  enforceSinglePrimaryLoanFileClient,
  removeLoanFileClientLink,
  syncPrimaryFileClientEdge,
  syncPrimaryFileProjectEdge,
  updateLoanFileClientLink,
  upsertFileClientEdge,
} from "./indexedGraphEdgeSync";

const memberUserKeyArg = { memberUserKey: v.string() };

const relationshipTypeArg = v.union(
  v.literal("primary"),
  v.literal("coborrower"),
  v.literal("guarantor"),
  v.literal("entity"),
  v.literal("sponsor"),
  v.literal("partner"),
  v.literal("other"),
);

async function assertProjectEdit(
  ctx: MutationCtx,
  project: Doc<"projects">,
  memberUserKey: string,
) {
  const level = await resolveProjectAccessLevel(ctx, project, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this project's clients.");
  }
}

async function assertPipelineEdit(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string,
) {
  const level = await resolvePipelineAccessLevel(ctx, row, memberUserKey);
  if (level !== "edit") {
    throw new Error("You do not have permission to edit this file's clients.");
  }
}

function nextSortOrder(links: Array<{ sortOrder: number }>): number {
  if (links.length === 0) return 1;
  return Math.max(...links.map((l) => l.sortOrder)) + 1;
}

export const getProjectClientEditor = query({
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
    const accessLevel = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (accessLevel === "none") return null;
    return {
      projectId: String(project._id),
      primaryClientId: String(project.clientId),
      accessLevel,
      canEdit: accessLevel === "edit",
      linkedClients: await resolveProjectLinkedClients(ctx, project),
    };
  },
});

export const getLoanClientEditor = query({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      return null;
    }
    const accessLevel = await resolvePipelineAccessLevel(
      ctx,
      row,
      args.memberUserKey,
    );
    if (accessLevel === "none") return null;
    let projectLinkedClients: Awaited<
      ReturnType<typeof resolveProjectLinkedClients>
    > = [];
    if (row.projectId) {
      const project = await ctx.db.get(row.projectId);
      if (project) {
        projectLinkedClients = await resolveProjectLinkedClients(ctx, project);
      }
    }
    const loanLinked = await resolveLoanLinkedClients(ctx, row);
  const loanClientIds = new Set(loanLinked.map((l) => l.clientId));
  const inheritsProject =
    loanLinked.length <= 1 &&
    projectLinkedClients.length > 0 &&
    projectLinkedClients.every((p) => loanClientIds.has(p.clientId));
    return {
      fileId: String(row._id),
      projectId: row.projectId ? String(row.projectId) : null,
      primaryClientId: row.clientId ? String(row.clientId) : null,
      accessLevel,
      canEdit: accessLevel === "edit",
      linkedClients: loanLinked,
      projectLinkedClients,
      inheritsProject,
    };
  },
});

export const createOrgClient = mutation({
  args: {
    organizationId: v.id("organizations"),
    displayName: v.string(),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const displayName = args.displayName.trim();
    if (!displayName) throw new Error("Client name is required.");
    const now = Date.now();
    const clientId = await ctx.db.insert("clients", {
      organizationId: args.organizationId,
      displayName,
      normalizedName: normalizeHierarchyName(displayName),
      ...ownerFieldsForInsert(args.memberUserKey),
      createdAt: now,
      updatedAt: now,
    });
    return { clientId };
  },
});

export const addProjectClientLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    clientId: v.id("clients"),
    relationshipType: v.optional(relationshipTypeArg),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      throw new Error("Client not found.");
    }
    const existing = await findProjectClientLink(
      ctx,
      project._id,
      args.clientId,
    );
    if (existing) throw new Error("Client is already linked to this project.");
    const rel = args.relationshipType ?? "coborrower";
    if (rel === "primary") {
      throw new Error("Use promoteProjectClientToPrimary to set primary.");
    }
    const links = await listProjectClientLinks(ctx, project._id);
    const now = Date.now();
    await ctx.db.insert("projectClients", {
      organizationId: args.organizationId,
      projectId: project._id,
      clientId: args.clientId,
      relationshipType: rel,
      sortOrder: nextSortOrder(links),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const updateProjectClientLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    clientId: v.id("clients"),
    relationshipType: relationshipTypeArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    if (
      args.relationshipType === "primary" &&
      String(args.clientId) !== String(project.clientId)
    ) {
      throw new Error("Use promoteProjectClientToPrimary to set primary.");
    }
    if (
      String(args.clientId) === String(project.clientId) &&
      args.relationshipType !== "primary"
    ) {
      throw new Error("Primary project client must stay typed primary.");
    }
    const link = await findProjectClientLink(ctx, project._id, args.clientId);
    if (!link) throw new Error("Client link not found.");
    await ctx.db.patch(link._id, {
      relationshipType: args.relationshipType,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const removeProjectClientLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    if (String(args.clientId) === String(project.clientId)) {
      throw new Error("Cannot remove the primary project client.");
    }
    const link = await findProjectClientLink(ctx, project._id, args.clientId);
    if (!link) throw new Error("Client link not found.");
    await ctx.db.delete(link._id);
    return { ok: true };
  },
});

export const reorderProjectClientLinks = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    orderedClientIds: v.array(v.id("clients")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
    const links = await listProjectClientLinks(ctx, project._id);
    const linkByClient = new Map(links.map((l) => [String(l.clientId), l]));
    const now = Date.now();
    let order = 0;
    for (const clientId of args.orderedClientIds) {
      const link = linkByClient.get(String(clientId));
      if (!link) continue;
      await ctx.db.patch(link._id, {
        sortOrder:
          String(clientId) === String(project.clientId) ? 0 : order++ || 1,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const promoteProjectClientToPrimary = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project not found.");
    }
    await assertProjectEdit(ctx, project, args.memberUserKey);
  if (String(args.clientId) === String(project.clientId)) {
    return { ok: true, primaryClientId: String(project.clientId) };
  }
    let link = await findProjectClientLink(ctx, project._id, args.clientId);
    const now = Date.now();
    if (!link) {
      const links = await listProjectClientLinks(ctx, project._id);
      await ctx.db.insert("projectClients", {
        organizationId: args.organizationId,
        projectId: project._id,
        clientId: args.clientId,
        relationshipType: "primary",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    const oldPrimaryId = project.clientId;
    await ctx.db.patch(project._id, {
      clientId: args.clientId,
      updatedAt: now,
    });
    const refreshed = (await ctx.db.get(project._id))!;
    await ensurePrimaryProjectClientLink(ctx, refreshed);
    const oldLink = await findProjectClientLink(ctx, project._id, oldPrimaryId);
    if (oldLink && String(oldPrimaryId) !== String(args.clientId)) {
      await ctx.db.patch(oldLink._id, {
        relationshipType: "coborrower",
        sortOrder: nextSortOrder(await listProjectClientLinks(ctx, project._id)),
        updatedAt: now,
      });
    }
    link = await findProjectClientLink(ctx, project._id, args.clientId);
    if (link) {
      await ctx.db.patch(link._id, {
        relationshipType: "primary",
        sortOrder: 0,
        updatedAt: now,
      });
    }
    return { ok: true, primaryClientId: String(args.clientId) };
  },
});

export const addLoanClientLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    clientId: v.id("clients"),
    relationshipType: v.optional(relationshipTypeArg),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertPipelineEdit(ctx, row, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      throw new Error("Client not found.");
    }
    const existing = await findLoanClientLink(ctx, row._id, args.clientId);
    const existingFile = await findFileClientEdge(ctx, row._id, args.clientId);
    if (existing || existingFile) {
      throw new Error("Client is already linked to this file.");
    }
    const rel = args.relationshipType ?? "coborrower";
    if (rel === "primary") {
      throw new Error("Use promoteLoanClientToPrimary to set primary.");
    }
    const links = await listLoanClientLinks(ctx, row._id);
    await addLoanFileClientLink(ctx, {
      organizationId: args.organizationId,
      row,
      clientId: args.clientId,
      relationshipType: rel,
      sortOrder: nextSortOrder(links),
      memberUserKey: args.memberUserKey,
    });
    await refreshPipelineGlobalSearchText(ctx, row._id);
    return { ok: true };
  },
});

export const updateLoanClientLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    clientId: v.id("clients"),
    relationshipType: relationshipTypeArg,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertPipelineEdit(ctx, row, args.memberUserKey);
    if (
      args.relationshipType === "primary" &&
      row.clientId &&
      String(args.clientId) !== String(row.clientId)
    ) {
      throw new Error("Use promoteLoanClientToPrimary to set primary.");
    }
    const link = await findLoanClientLink(ctx, row._id, args.clientId);
    const fileEdge = await findFileClientEdge(ctx, row._id, args.clientId);
    if (!link && !fileEdge) throw new Error("Client link not found.");
    await updateLoanFileClientLink(ctx, {
      row,
      clientId: args.clientId,
      relationshipType: args.relationshipType,
    });
    await refreshPipelineGlobalSearchText(ctx, row._id);
    return { ok: true };
  },
});

export const removeLoanClientLink = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertPipelineEdit(ctx, row, args.memberUserKey);
    await removeLoanFileClientLink(ctx, row, args.clientId, args.memberUserKey);
    await refreshPipelineGlobalSearchText(ctx, row._id);
    return { ok: true };
  },
});

export const reorderLoanClientLinks = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    orderedClientIds: v.array(v.id("clients")),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertPipelineEdit(ctx, row, args.memberUserKey);
    const links = await listLoanClientLinks(ctx, row._id);
    const linkByClient = new Map(links.map((l) => [String(l.clientId), l]));
    const now = Date.now();
    let order = 1;
    for (const clientId of args.orderedClientIds) {
      const link = linkByClient.get(String(clientId));
      const isPrimary =
        row.clientId && String(clientId) === String(row.clientId);
      const sortOrder = isPrimary ? 0 : order++;
      if (link) {
        await ctx.db.patch(link._id, {
          sortOrder,
          updatedAt: now,
        });
      }
      const fileEdge = await findFileClientEdge(ctx, row._id, clientId);
      if (fileEdge) {
        await ctx.db.patch(fileEdge._id, { sortOrder, updatedAt: now });
      }
    }
    return { ok: true };
  },
});

export const promoteLoanClientToPrimary = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    clientId: v.id("clients"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertPipelineEdit(ctx, row, args.memberUserKey);
    if (row.projectId) {
      throw new Error(
        "Primary client is derived from the file’s Project. Use Change Project to change the primary client.",
      );
    }
    if (row.clientId && String(args.clientId) === String(row.clientId)) {
      return { ok: true, primaryClientId: String(row.clientId) };
    }
    const now = Date.now();
    let link = await findLoanClientLink(ctx, row._id, args.clientId);
    if (!link) {
      await ctx.db.insert("loanClients", {
        organizationId: args.organizationId,
        pipelineId: row._id,
        clientId: args.clientId,
        relationshipType: "primary",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      await upsertFileClientEdge(ctx, {
        organizationId: args.organizationId,
        fileId: row._id,
        clientId: args.clientId,
        relationshipType: "primary",
        sortOrder: 0,
        actor: args.memberUserKey,
      });
    }
    const oldPrimaryId = row.clientId;
    await ctx.db.patch(row._id, {
      clientId: args.clientId,
      updatedAt: now,
    });
    const refreshed = (await ctx.db.get(row._id))!;
    await enforceSinglePrimaryLoanFileClient(ctx, refreshed, {
      previousPrimaryClientId: oldPrimaryId,
      actor: args.memberUserKey,
    });
    await ensurePrimaryLoanClientLink(ctx, refreshed);
    await syncPrimaryFileClientEdge(ctx, refreshed);
    if (oldPrimaryId && String(oldPrimaryId) !== String(args.clientId)) {
      const oldLink = await findLoanClientLink(ctx, row._id, oldPrimaryId);
      if (oldLink) {
        await ctx.db.patch(oldLink._id, {
          relationshipType: "coborrower",
          sortOrder: nextSortOrder(await listLoanClientLinks(ctx, row._id)),
          updatedAt: now,
        });
      }
      await upsertFileClientEdge(ctx, {
        organizationId: args.organizationId,
        fileId: row._id,
        clientId: oldPrimaryId,
        relationshipType: "coborrower",
        sortOrder: nextSortOrder(await listLoanClientLinks(ctx, row._id)),
        actor: args.memberUserKey,
      });
    }
    link = await findLoanClientLink(ctx, row._id, args.clientId);
    if (link) {
      await ctx.db.patch(link._id, {
        relationshipType: "primary",
        sortOrder: 0,
        updatedAt: now,
      });
    }
    await refreshPipelineGlobalSearchText(ctx, row._id);
    return { ok: true, primaryClientId: String(args.clientId) };
  },
});

/** Copy project client links onto a loan file (skips duplicates; keeps loan-only links). */
export const syncLoanClientsFromProject = mutation({
  args: {
    organizationId: v.id("organizations"),
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertPipelineEdit(ctx, row, args.memberUserKey);
    if (!row.projectId) throw new Error("File has no project to inherit from.");
    const project = await ctx.db.get(row.projectId);
    if (!project) throw new Error("Project not found.");
    const projectLinks = await listProjectClientLinks(ctx, project._id);
    const now = Date.now();
    let added = 0;
    for (const pl of projectLinks) {
      const existing = await findLoanClientLink(ctx, row._id, pl.clientId);
      const existingFile = await findFileClientEdge(ctx, row._id, pl.clientId);
      if (existing && existingFile) continue;
      let didAdd = false;
      if (!existing) {
        await ctx.db.insert("loanClients", {
          organizationId: args.organizationId,
          pipelineId: row._id,
          clientId: pl.clientId,
          relationshipType: pl.relationshipType,
          sortOrder: pl.sortOrder,
          createdAt: now,
          updatedAt: now,
        });
        didAdd = true;
      }
      if (!existingFile) {
        await upsertFileClientEdge(ctx, {
          organizationId: args.organizationId,
          fileId: row._id,
          clientId: pl.clientId,
          relationshipType: pl.relationshipType,
          sortOrder: pl.sortOrder,
          actor: args.memberUserKey,
        });
        didAdd = true;
      }
      if (didAdd) added += 1;
    }
    if (project.clientId) {
      const previousPrimaryClientId = row.clientId;
      await ctx.db.patch(row._id, {
        clientId: project.clientId,
        updatedAt: now,
      });
      const refreshed = (await ctx.db.get(row._id))!;
      await enforceSinglePrimaryLoanFileClient(ctx, refreshed, {
        previousPrimaryClientId,
        actor: args.memberUserKey,
      });
      await ensurePrimaryLoanClientLink(ctx, refreshed);
      await syncPrimaryFileClientEdge(ctx, refreshed);
      await syncPrimaryFileProjectEdge(ctx, refreshed);
    }
    await refreshPipelineGlobalSearchText(ctx, row._id);
    return { ok: true, added };
  },
});
