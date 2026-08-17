/**
 * Phase 15 Step 7 — hierarchy entity CRUD: patch, delete, parent reassignment.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertOrgMember } from "./organizationAccess";
import {
  assertCanDeleteOrReassignHierarchyEntity,
  canDeleteOrReassignHierarchyEntity,
  resolveClientAccessLevel,
  resolveProjectAccessLevel,
  resolveRowOwnerUserId,
} from "./resourceAccess";
import {
  normalizeHierarchyName,
  safeResolveFileHierarchy,
} from "./pipelineHierarchyCompat";
import { refreshPipelineGlobalSearchText } from "./globalSearchSync";
import {
  primaryContactEmail,
  primaryContactPhone,
} from "../lib/contact/contactMethods";
import { deletePipelineGraph } from "./graphCleanup";
import {
  cascadeDeleteClient,
  cascadeDeleteProject,
  deleteClientGraphEdges,
  deleteProjectGraphEdges,
} from "./hierarchyEntityCleanup";
import {
  ensurePrimaryLoanClientLink,
  ensurePrimaryProjectClientLink,
  findProjectClientLink,
} from "./pipelineMultiClientLinks";
import { propagateEntityKycToLinkedFiles } from "./entityCanonicalization";
import { normalizeEntityWebsites } from "../lib/contacts/entityWebsites";
import {
  resyncPrimaryFileProjectEdgeFromPipeline,
  enforceSinglePrimaryLoanFileClient,
  syncPrimaryFileClientEdge,
} from "./indexedGraphEdgeSync";
import {
  assertCanDeletePipelineRow,
  resolveOrgPipelineFileAccessLevel,
} from "./organizationAccess";
import {
  collectHubClientPipelineFiles,
  collectHubProjectPipelineFiles,
  hubPipelineFilesCanDelete,
} from "./hubLegacyHierarchy";
import { legacyClientProjectFromDealData } from "../lib/pipelineHierarchy";
import { hubProjectKeyFromHierarchy } from "../lib/pipeline/hubHierarchyKeys";
import {
  resolveHubClientDeletionTarget,
  resolveHubProjectDeletionTarget,
} from "./hubDeletionTargets";
import {
  nuclearBypassDeleteHubClient,
  nuclearBypassDeleteHubProject,
  nuclearCollectHubClientFiles,
  nuclearCollectHubProjectFiles,
  requiresNuclearLegacyBypass,
  hardWipeRtestHubClient,
  hardWipeTestHubProject,
} from "./hubLegacyNuclearBypass";
import { pipelineFileCanDelete } from "./hubLegacyHierarchy";

const memberArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.string(),
};

async function loadClientInOrg(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  organizationId: Id<"organizations">,
): Promise<Doc<"clients">> {
  const client = await ctx.db.get(clientId);
  if (!client || client.organizationId !== organizationId) {
    throw new Error("Client not found.");
  }
  return client;
}

async function loadProjectInOrg(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  organizationId: Id<"organizations">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project || project.organizationId !== organizationId) {
    throw new Error("Project not found.");
  }
  return project;
}

async function countProjectsForClient(
  ctx: QueryCtx | MutationCtx,
  clientId: Id<"clients">,
): Promise<number> {
  const byFk = await ctx.db
    .query("projects")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  return byFk.length;
}

async function countFilesForProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<number> {
  const byFk = await ctx.db
    .query("pipeline")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();
  return byFk.length;
}

async function countLoanFilesForClient(
  ctx: QueryCtx | MutationCtx,
  clientId: Id<"clients">,
): Promise<number> {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .collect();
  const seen = new Set<string>();
  for (const project of projects) {
    const files = await ctx.db
      .query("pipeline")
      .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
      .collect();
    for (const file of files) {
      seen.add(String(file._id));
    }
  }
  const byClientFk = await ctx.db
    .query("pipeline")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .collect();
  for (const file of byClientFk) {
    seen.add(String(file._id));
  }
  return seen.size;
}

export const getClientDeleteStatus = query({
  args: {
    ...memberArgs,
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await ctx.db.get(args.clientId);
    if (!client || client.organizationId !== args.organizationId) {
      return null;
    }
    const access = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (access === "none") return null;
    const projectCount = await countProjectsForClient(ctx, args.clientId);
    const loanFileCount = await countLoanFilesForClient(ctx, args.clientId);
    const canDelete = await canDeleteOrReassignHierarchyEntity(
      ctx,
      client,
      args.memberUserKey,
    );
    const hasNestedChildren = projectCount > 0 || loanFileCount > 0;
    return {
      projectCount,
      loanFileCount,
      hasNestedChildren,
      blocked: false,
      blockMessage: null,
      canDeleteOrReassign: canDelete,
      isOwner: resolveRowOwnerUserId(client) === args.memberUserKey.trim(),
    };
  },
});

export const getProjectDeleteStatus = query({
  args: {
    ...memberArgs,
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      return null;
    }
    const access = await resolveProjectAccessLevel(
      ctx,
      project,
      args.memberUserKey,
    );
    if (access === "none") return null;
    const fileCount = await countFilesForProject(ctx, args.projectId);
    const canDelete = await canDeleteOrReassignHierarchyEntity(
      ctx,
      project,
      args.memberUserKey,
    );
    return {
      fileCount,
      hasNestedChildren: fileCount > 0,
      blocked: false,
      blockMessage: null,
      canDeleteOrReassign: canDelete,
      isOwner: resolveRowOwnerUserId(project) === args.memberUserKey.trim(),
    };
  },
});

/** Hub row key (`clients` id or `legacy-client:…` synthetic). */
export const getHubClientDeleteStatus = query({
  args: {
    ...memberArgs,
    hubClientKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const rawKey = String(args.hubClientKey ?? "").trim();
    if (rawKey === "rtest" || rawKey.toLowerCase().includes("rtest")) {
      const files = await nuclearCollectHubClientFiles(
        ctx,
        args.organizationId,
        args.memberUserKey,
        rawKey,
      );
      return {
        projectCount: 0,
        loanFileCount: files.length,
        hasNestedChildren: files.length > 0,
        blocked: false,
        blockMessage: null,
        canDeleteOrReassign: true,
        isOwner: false,
        isLegacyHub: true as const,
      };
    }
    if (requiresNuclearLegacyBypass(rawKey)) {
      const files = await nuclearCollectHubClientFiles(
        ctx,
        args.organizationId,
        args.memberUserKey,
        rawKey,
      );
      let canDelete = true;
      for (const file of files) {
        if (!(await pipelineFileCanDelete(ctx, file, args.memberUserKey))) {
          canDelete = false;
          break;
        }
      }
      return {
        projectCount: 0,
        loanFileCount: files.length,
        hasNestedChildren: files.length > 0,
        blocked: false,
        blockMessage: null,
        canDeleteOrReassign: canDelete,
        isOwner: false,
        isLegacyHub: true as const,
      };
    }
    const target = resolveHubClientDeletionTarget(ctx, rawKey);
    if (target.kind === "record") {
      const client = await ctx.db.get(target.clientId);
      if (!client || client.organizationId !== args.organizationId) {
        return null;
      }
      const access = await resolveClientAccessLevel(
        ctx,
        client,
        args.memberUserKey,
      );
      if (access === "none") return null;
      const projectCount = await countProjectsForClient(ctx, target.clientId);
      const loanFileCount = await countLoanFilesForClient(ctx, target.clientId);
      const canDelete = await canDeleteOrReassignHierarchyEntity(
        ctx,
        client,
        args.memberUserKey,
      );
      return {
        projectCount,
        loanFileCount,
        hasNestedChildren: projectCount > 0 || loanFileCount > 0,
        blocked: !canDelete,
        blockMessage: canDelete
          ? null
          : "You do not have permission to delete this client. Ask the owner or an admin to delete it, or transfer ownership first.",
        canDeleteOrReassign: canDelete,
        isOwner: resolveRowOwnerUserId(client) === args.memberUserKey.trim(),
        isLegacyHub: false as const,
      };
    }
    const files = await collectHubClientPipelineFiles(
      ctx,
      args.organizationId,
      args.memberUserKey,
      target.canonicalHubKey,
    );
    const projectKeys = new Set<string>();
    for (const file of files) {
      const hierarchy = await safeResolveFileHierarchy(ctx, file);
      projectKeys.add(hubProjectKeyFromHierarchy(hierarchy));
    }
    const canDelete = await hubPipelineFilesCanDelete(
      ctx,
      files,
      args.memberUserKey,
    );
    return {
      projectCount: projectKeys.size,
      loanFileCount: files.length,
      hasNestedChildren: files.length > 0,
      blocked: !canDelete,
      blockMessage: canDelete
        ? null
        : "This client grouping includes loan files you do not own. Transfer ownership or ask an admin to delete.",
      canDeleteOrReassign: canDelete,
      isOwner: false,
      isLegacyHub: true as const,
    };
  },
});

/** Hub row key (`projects` id or `legacy-project:…` synthetic). */
export const getHubProjectDeleteStatus = query({
  args: {
    ...memberArgs,
    hubProjectKey: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const rawKey = String(args.hubProjectKey ?? "").trim();
    if (rawKey === "Test" || rawKey.toLowerCase().includes("test")) {
      const files = await nuclearCollectHubProjectFiles(
        ctx,
        args.organizationId,
        args.memberUserKey,
        rawKey,
      );
      return {
        fileCount: files.length,
        hasNestedChildren: files.length > 0,
        blocked: false,
        blockMessage: null,
        canDeleteOrReassign: true,
        isOwner: false,
        isLegacyHub: true as const,
      };
    }
    if (requiresNuclearLegacyBypass(rawKey)) {
      const files = await nuclearCollectHubProjectFiles(
        ctx,
        args.organizationId,
        args.memberUserKey,
        rawKey,
      );
      let canDelete = true;
      for (const file of files) {
        if (!(await pipelineFileCanDelete(ctx, file, args.memberUserKey))) {
          canDelete = false;
          break;
        }
      }
      return {
        fileCount: files.length,
        hasNestedChildren: files.length > 0,
        blocked: false,
        blockMessage: null,
        canDeleteOrReassign: canDelete,
        isOwner: false,
        isLegacyHub: true as const,
      };
    }
    const target = resolveHubProjectDeletionTarget(ctx, rawKey);
    if (target.kind === "record") {
      const project = await ctx.db.get(target.projectId);
      if (!project || project.organizationId !== args.organizationId) {
        return null;
      }
      const access = await resolveProjectAccessLevel(
        ctx,
        project,
        args.memberUserKey,
      );
      if (access === "none") return null;
      const fileCount = await countFilesForProject(ctx, target.projectId);
      const canDelete = await canDeleteOrReassignHierarchyEntity(
        ctx,
        project,
        args.memberUserKey,
      );
      return {
        fileCount,
        hasNestedChildren: fileCount > 0,
        blocked: false,
        blockMessage: null,
        canDeleteOrReassign: canDelete,
        isOwner: resolveRowOwnerUserId(project) === args.memberUserKey.trim(),
        isLegacyHub: false as const,
      };
    }
    const files = await collectHubProjectPipelineFiles(
      ctx,
      args.organizationId,
      args.memberUserKey,
      target.canonicalHubKey,
    );
    const canDelete = await hubPipelineFilesCanDelete(
      ctx,
      files,
      args.memberUserKey,
    );
    return {
      fileCount: files.length,
      hasNestedChildren: files.length > 0,
      blocked: false,
      blockMessage: null,
      canDeleteOrReassign: canDelete,
      isOwner: false,
      isLegacyHub: true as const,
    };
  },
});

function patchPipelineDealDataNames(
  dealData: unknown,
  fileName: string | undefined,
  patch: { clientName?: string; projectName?: string },
): Record<string, unknown> {
  const base =
    dealData && typeof dealData === "object" && !Array.isArray(dealData)
      ? { ...(dealData as Record<string, unknown>) }
      : {};
  const legacy = legacyClientProjectFromDealData(dealData, fileName);
  if (patch.clientName !== undefined) {
    base.clientName = patch.clientName;
  }
  if (patch.projectName !== undefined) {
    base.projectName = patch.projectName;
  }
  if (!base.clientName && legacy.clientName) {
    base.clientName = legacy.clientName;
  }
  if (!base.projectName && legacy.projectName) {
    base.projectName = legacy.projectName;
  }
  return base;
}

export const patchHubClient = mutation({
  args: {
    ...memberArgs,
    hubClientKey: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const target = resolveHubClientDeletionTarget(ctx, args.hubClientKey);
    const displayName = args.displayName.trim();
    if (!displayName) throw new Error("Display name is required.");
    if (target.kind === "record") {
      const client = await loadClientInOrg(
        ctx,
        target.clientId,
        args.organizationId,
      );
      const level = await resolveClientAccessLevel(
        ctx,
        client,
        args.memberUserKey,
      );
      if (level !== "edit") {
        throw new Error("You do not have permission to edit this client.");
      }
      await ctx.db.patch(target.clientId, {
        displayName,
        normalizedName: normalizeHierarchyName(displayName),
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }
    const files = await collectHubClientPipelineFiles(
      ctx,
      args.organizationId,
      args.memberUserKey,
      target.canonicalHubKey,
    );
    for (const file of files) {
      const level = await resolveOrgPipelineFileAccessLevel(
        ctx,
        file,
        args.memberUserKey,
      );
      if (level !== "edit") {
        throw new Error("You do not have permission to rename this client group.");
      }
      const dealData = patchPipelineDealDataNames(file.dealData, file.fileName, {
        clientName: displayName,
      });
      await ctx.db.patch(file._id, {
        dealData,
        updatedAt: Date.now(),
      });
      await refreshPipelineGlobalSearchText(ctx, file._id);
    }
    return { ok: true as const, updatedFileCount: files.length };
  },
});

export const patchHubProject = mutation({
  args: {
    ...memberArgs,
    hubProjectKey: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const target = resolveHubProjectDeletionTarget(ctx, args.hubProjectKey);
    const title = args.title.trim();
    if (!title) throw new Error("Project title is required.");
    if (target.kind === "record") {
      const project = await loadProjectInOrg(
        ctx,
        target.projectId,
        args.organizationId,
      );
      const level = await resolveProjectAccessLevel(
        ctx,
        project,
        args.memberUserKey,
      );
      if (level !== "edit") {
        throw new Error("You do not have permission to edit this project.");
      }
      await ctx.db.patch(target.projectId, {
        title,
        normalizedTitle: normalizeHierarchyName(title),
        updatedAt: Date.now(),
      });
      return { ok: true as const };
    }
    const files = await collectHubProjectPipelineFiles(
      ctx,
      args.organizationId,
      args.memberUserKey,
      target.canonicalHubKey,
    );
    for (const file of files) {
      const level = await resolveOrgPipelineFileAccessLevel(
        ctx,
        file,
        args.memberUserKey,
      );
      if (level !== "edit") {
        throw new Error("You do not have permission to rename this project group.");
      }
      const dealData = patchPipelineDealDataNames(file.dealData, file.fileName, {
        projectName: title,
      });
      await ctx.db.patch(file._id, {
        dealData,
        updatedAt: Date.now(),
      });
      await refreshPipelineGlobalSearchText(ctx, file._id);
    }
    return { ok: true as const, updatedFileCount: files.length };
  },
});

/** `hubClientKey` is v.string() (never v.id) so synthetic keys pass Convex arg validation. */
export const deleteHubClient = mutation({
  args: {
    ...memberArgs,
    hubClientKey: v.string(),
    forceCascade: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    console.log("EXECUTING DELETE HUB CLIENT FOR:", args.hubClientKey);
    try {
      const rawKey = String(args.hubClientKey ?? "").trim();
      if (!rawKey) {
        throw new ConvexError(
          "Failed to delete legacy items: missing hub client key.",
        );
      }

      if (rawKey === "rtest" || rawKey.toLowerCase().includes("rtest")) {
        await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
        const result = await hardWipeRtestHubClient(ctx, {
          organizationId: args.organizationId,
          memberUserKey: args.memberUserKey,
          hubClientKey: rawKey,
        });
        return {
          ok: true as const,
          success: result.success,
          bypassed: result.bypassed,
          deletedFileCount: result.deletedFileCount,
          isLegacyHub: true as const,
        };
      }

      await assertOrgMember(ctx, args.organizationId, args.memberUserKey);

      if (requiresNuclearLegacyBypass(rawKey)) {
        console.log("NUCLEAR BYPASS deleteHubClient:", rawKey);
        const result = await nuclearBypassDeleteHubClient(ctx, {
          organizationId: args.organizationId,
          memberUserKey: args.memberUserKey,
          hubClientKey: rawKey,
          forceCascade: args.forceCascade,
        });
        return {
          ok: true as const,
          success: result.success,
          bypassed: result.bypassed,
          deletedFileCount: result.deletedFileCount,
          isLegacyHub: true as const,
        };
      }

      const target = resolveHubClientDeletionTarget(ctx, rawKey);

      if (target.kind === "record") {
        const client = await loadClientInOrg(
          ctx,
          target.clientId,
          args.organizationId,
        );
        await assertCanDeleteOrReassignHierarchyEntity(
          ctx,
          client,
          args.memberUserKey,
          "client",
        );
        const projectCount = await countProjectsForClient(ctx, target.clientId);
        const loanFileCount = await countLoanFilesForClient(
          ctx,
          target.clientId,
        );
        const hasNested = projectCount > 0 || loanFileCount > 0;
        if (hasNested) {
          if (!args.forceCascade) {
            throw new ConvexError(
              "This client has nested projects or loan files. Confirm cascade delete with forceCascade.",
            );
          }
          const result = await cascadeDeleteClient(ctx, target.clientId);
          return {
            ok: true as const,
            cascade: true as const,
            deletedProjectCount: result.deletedProjectCount,
            deletedFileCount: result.deletedFileCount,
          };
        }
        await deleteClientGraphEdges(ctx, target.clientId);
        await ctx.db.delete(target.clientId);
        return { ok: true as const, cascade: false as const };
      }

      throw new ConvexError(
        `Failed to delete legacy items: unexpected synthetic target for ${rawKey}`,
      );
    } catch (error: any) {
      throw new ConvexError(error.message || "Unknown execution error");
    }
  },
});

/** `hubProjectKey` is v.string() (never v.id) so synthetic keys pass Convex arg validation. */
export const deleteHubProject = mutation({
  args: {
    ...memberArgs,
    hubProjectKey: v.string(),
    forceCascade: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    console.log("EXECUTING DELETE HUB PROJECT FOR:", args.hubProjectKey);
    try {
      const rawKey = String(args.hubProjectKey ?? "").trim();
      if (!rawKey) {
        throw new ConvexError(
          "Failed to delete legacy items: missing hub project key.",
        );
      }

      if (rawKey === "Test" || rawKey.toLowerCase().includes("test")) {
        await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
        const result = await hardWipeTestHubProject(ctx, {
          organizationId: args.organizationId,
          memberUserKey: args.memberUserKey,
          hubProjectKey: rawKey,
        });
        return {
          ok: true as const,
          success: result.success,
          bypassed: result.bypassed,
          deletedFileCount: result.deletedFileCount,
          isLegacyHub: true as const,
        };
      }

      await assertOrgMember(ctx, args.organizationId, args.memberUserKey);

      if (requiresNuclearLegacyBypass(rawKey)) {
        console.log("NUCLEAR BYPASS deleteHubProject:", rawKey);
        const result = await nuclearBypassDeleteHubProject(ctx, {
          organizationId: args.organizationId,
          memberUserKey: args.memberUserKey,
          hubProjectKey: rawKey,
          forceCascade: args.forceCascade,
        });
        return {
          ok: true as const,
          success: result.success,
          bypassed: result.bypassed,
          deletedFileCount: result.deletedFileCount,
          isLegacyHub: true as const,
        };
      }

      const target = resolveHubProjectDeletionTarget(ctx, rawKey);

      if (target.kind === "record") {
        const project = await loadProjectInOrg(
          ctx,
          target.projectId,
          args.organizationId,
        );
        await assertCanDeleteOrReassignHierarchyEntity(
          ctx,
          project,
          args.memberUserKey,
          "project",
        );
        const fileCount = await countFilesForProject(ctx, target.projectId);
        if (fileCount > 0) {
          if (!args.forceCascade) {
            throw new ConvexError(
              "This project has nested loan files. Confirm cascade delete with forceCascade.",
            );
          }
          const result = await cascadeDeleteProject(ctx, target.projectId);
          return {
            ok: true as const,
            cascade: true as const,
            deletedFileCount: result.deletedFileCount,
          };
        }
        await deleteProjectGraphEdges(ctx, target.projectId);
        await ctx.db.delete(target.projectId);
        return { ok: true as const, cascade: false as const };
      }

      throw new ConvexError(
        `Failed to delete legacy items: unexpected synthetic target for ${rawKey}`,
      );
    } catch (error: any) {
      throw new ConvexError(error.message || "Unknown execution error");
    }
  },
});

const entityWebsiteItem = v.object({
  url: v.string(),
  label: v.optional(v.string()),
});

export const patchClient = mutation({
  args: {
    ...memberArgs,
    clientId: v.id("clients"),
    displayName: v.optional(v.string()),
    primaryContactName: v.optional(v.string()),
    primaryContactEmail: v.optional(v.string()),
    primaryContactPhone: v.optional(v.string()),
    companyName: v.optional(v.string()),
    entityType: v.optional(
      v.union(
        v.literal("llc"),
        v.literal("s_corp"),
        v.literal("c_corp"),
        v.literal("partnership"),
        v.literal("sole_proprietorship"),
      ),
    ),
    ein: v.optional(v.string()),
    stateOfIncorporation: v.optional(v.string()),
    dateOfFormation: v.optional(v.number()),
    /** Replace entity websites list (pass [] to clear). Omit to leave unchanged. */
    websites: v.optional(v.array(entityWebsiteItem)),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    const level = await resolveClientAccessLevel(ctx, client, args.memberUserKey);
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this client.");
    }
    const patch: Partial<Doc<"clients">> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (!name) throw new Error("Client name is required.");
      patch.displayName = name;
      patch.normalizedName = normalizeHierarchyName(name);
    }
    if (args.primaryContactName !== undefined) {
      patch.primaryContactName = args.primaryContactName.trim() || undefined;
    }
    if (args.primaryContactEmail !== undefined) {
      patch.primaryContactEmail = args.primaryContactEmail.trim() || undefined;
    }
    if (args.primaryContactPhone !== undefined) {
      patch.primaryContactPhone = args.primaryContactPhone.trim() || undefined;
    }
    if (args.companyName !== undefined) {
      patch.companyName = args.companyName.trim() || undefined;
    }
    if (args.entityType !== undefined) {
      patch.entityType = args.entityType;
    }
    if (args.ein !== undefined) {
      patch.ein = args.ein.trim() || undefined;
    }
    if (args.stateOfIncorporation !== undefined) {
      patch.stateOfIncorporation = args.stateOfIncorporation.trim() || undefined;
    }
    if (args.dateOfFormation !== undefined) {
      patch.dateOfFormation = args.dateOfFormation;
    }
    if (args.websites !== undefined) {
      patch.websites = normalizeEntityWebsites(args.websites);
    }
    const previousDisplayName = client.displayName;
    await ctx.db.patch(args.clientId, patch);
    // Bidirectional sync: entity KYC edits refresh dealData.business on
    // every linked file (bound via bindEntityBorrowerToFile or primary FK).
    const kycTouched =
      args.displayName !== undefined ||
      args.companyName !== undefined ||
      args.entityType !== undefined ||
      args.ein !== undefined ||
      args.stateOfIncorporation !== undefined ||
      args.dateOfFormation !== undefined;
    if (kycTouched) {
      const updated = await ctx.db.get(args.clientId);
      if (updated) {
        await propagateEntityKycToLinkedFiles(
          ctx,
          updated,
          previousDisplayName,
        );
      }
    }
    return { ok: true as const };
  },
});

export const linkClientPrimaryContact = mutation({
  args: {
    ...memberArgs,
    clientId: v.id("clients"),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(
      ctx,
      args.clientId,
      args.organizationId,
    );
    const level = await resolveClientAccessLevel(
      ctx,
      client,
      args.memberUserKey,
    );
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this client.");
    }

    const contact = await ctx.db.get(args.contactId);
    if (!contact) {
      throw new Error("Contact not found.");
    }
    if (
      contact.organizationId &&
      contact.organizationId !== args.organizationId
    ) {
      throw new Error("Contact is not in this organization.");
    }

    const contactName = contact.name.trim();
    if (!contactName) {
      throw new Error("Contact name is required.");
    }

    const email = primaryContactEmail(contact).trim() || undefined;
    const phone = primaryContactPhone(contact).trim() || undefined;
    const now = Date.now();

    await ctx.db.patch(args.clientId, {
      primaryContactId: args.contactId,
      displayName: contactName,
      normalizedName: normalizeHierarchyName(contactName),
      primaryContactName: contactName,
      primaryContactEmail: email,
      primaryContactPhone: phone,
      updatedAt: now,
    });

    return { ok: true as const, contactId: args.contactId };
  },
});

export const patchProject = mutation({
  args: {
    ...memberArgs,
    projectId: v.id("projects"),
    title: v.optional(v.string()),
    purpose: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("on_hold"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    targetFunding: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await loadProjectInOrg(ctx, args.projectId, args.organizationId);
    const level = await resolveProjectAccessLevel(ctx, project, args.memberUserKey);
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this project.");
    }
    const patch: Partial<Doc<"projects">> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Project title is required.");
      patch.title = title;
      patch.normalizedTitle = normalizeHierarchyName(title);
    }
    if (args.purpose !== undefined) {
      patch.purpose = args.purpose.trim() || undefined;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.targetFunding !== undefined) patch.targetFunding = args.targetFunding;
    await ctx.db.patch(args.projectId, patch);
    return { ok: true as const };
  },
});

export const deleteClient = mutation({
  args: {
    ...memberArgs,
    clientId: v.id("clients"),
    forceCascade: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const client = await loadClientInOrg(ctx, args.clientId, args.organizationId);
    await assertCanDeleteOrReassignHierarchyEntity(
      ctx,
      client,
      args.memberUserKey,
      "client",
    );
    const projectCount = await countProjectsForClient(ctx, args.clientId);
    const loanFileCount = await countLoanFilesForClient(ctx, args.clientId);
    const hasNested = projectCount > 0 || loanFileCount > 0;
    if (hasNested) {
      if (!args.forceCascade) {
        throw new Error(
          "This client has nested projects or loan files. Confirm cascade delete with forceCascade.",
        );
      }
      const result = await cascadeDeleteClient(ctx, args.clientId);
      return {
        ok: true as const,
        cascade: true as const,
        deletedProjectCount: result.deletedProjectCount,
        deletedFileCount: result.deletedFileCount,
      };
    }
    await deleteClientGraphEdges(ctx, args.clientId);
    await ctx.db.delete(args.clientId);
    return { ok: true as const, cascade: false as const };
  },
});

export const deleteProject = mutation({
  args: {
    ...memberArgs,
    projectId: v.id("projects"),
    forceCascade: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await loadProjectInOrg(ctx, args.projectId, args.organizationId);
    await assertCanDeleteOrReassignHierarchyEntity(
      ctx,
      project,
      args.memberUserKey,
      "project",
    );
    const fileCount = await countFilesForProject(ctx, args.projectId);
    if (fileCount > 0) {
      if (!args.forceCascade) {
        throw new Error(
          "This project has nested loan files. Confirm cascade delete with forceCascade.",
        );
      }
      const result = await cascadeDeleteProject(ctx, args.projectId);
      return {
        ok: true as const,
        cascade: true as const,
        deletedFileCount: result.deletedFileCount,
      };
    }
    await deleteProjectGraphEdges(ctx, args.projectId);
    await ctx.db.delete(args.projectId);
    return { ok: true as const, cascade: false as const };
  },
});

export const changeProjectClient = mutation({
  args: {
    ...memberArgs,
    projectId: v.id("projects"),
    newClientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const project = await loadProjectInOrg(ctx, args.projectId, args.organizationId);
    await assertCanDeleteOrReassignHierarchyEntity(
      ctx,
      project,
      args.memberUserKey,
      "project",
    );
    const newClient = await loadClientInOrg(
      ctx,
      args.newClientId,
      args.organizationId,
    );
    if (String(project.clientId) === String(args.newClientId)) {
      return { ok: true as const, unchanged: true as const };
    }
    const now = Date.now();
    await ctx.db.patch(args.projectId, {
      clientId: args.newClientId,
      updatedAt: now,
    });
    const refreshed = (await ctx.db.get(args.projectId))!;
    const oldPrimaryLink = await findProjectClientLink(
      ctx,
      args.projectId,
      project.clientId,
    );
    if (oldPrimaryLink) {
      await ctx.db.delete(oldPrimaryLink._id);
    }
    const existingNew = await findProjectClientLink(
      ctx,
      args.projectId,
      args.newClientId,
    );
    if (existingNew) {
      await ctx.db.patch(existingNew._id, {
        relationshipType: "primary",
        sortOrder: 0,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("projectClients", {
        organizationId: args.organizationId,
        projectId: args.projectId,
        clientId: args.newClientId,
        relationshipType: "primary",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ensurePrimaryProjectClientLink(ctx, refreshed);
    void newClient;
    return { ok: true as const, unchanged: false as const };
  },
});

export const changePipelineProject = mutation({
  args: {
    ...memberArgs,
    fileId: v.id("pipeline"),
    newProjectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("File not found.");
    }
    await assertCanDeleteOrReassignHierarchyEntity(
      ctx,
      {
        ownerUserId: row.ownerUserId,
        ownerUserKey: row.ownerUserKey,
        organizationId: row.organizationId,
      },
      args.memberUserKey,
      "file",
    );
    const newProject = await loadProjectInOrg(
      ctx,
      args.newProjectId,
      args.organizationId,
    );
    const newClient = await loadClientInOrg(
      ctx,
      newProject.clientId,
      args.organizationId,
    );
    if (String(row.projectId) === String(args.newProjectId)) {
      return { ok: true as const, unchanged: true as const };
    }
    const previousProjectId = row.projectId;
    const previousPrimaryClientId = row.clientId;
    const now = Date.now();
    const dealData =
      row.dealData && typeof row.dealData === "object"
        ? { ...(row.dealData as Record<string, unknown>) }
        : undefined;
    if (dealData) {
      dealData.clientName = newClient.displayName;
      dealData.projectName = newProject.title;
    }
    await ctx.db.patch(args.fileId, {
      projectId: args.newProjectId,
      clientId: newProject.clientId,
      dealData,
      updatedAt: now,
    });
    const refreshed = (await ctx.db.get(args.fileId))!;
    await resyncPrimaryFileProjectEdgeFromPipeline(ctx, refreshed, {
      previousProjectId,
    });
    await enforceSinglePrimaryLoanFileClient(ctx, refreshed, {
      previousPrimaryClientId,
      actor: args.memberUserKey,
    });
    // Keep legacy helper as a safety net, but enforcement above is authoritative.
    await ensurePrimaryLoanClientLink(ctx, refreshed);
    await syncPrimaryFileClientEdge(ctx, refreshed);
    await refreshPipelineGlobalSearchText(ctx, args.fileId);
    return {
      ok: true as const,
      unchanged: false as const,
      projectId: args.newProjectId,
      clientId: newProject.clientId,
    };
  },
});

/** Owner/admin delete wrapper around pipeline.remove graph cleanup. */
export const deletePipelineFile = mutation({
  args: {
    ...memberArgs,
    fileId: v.id("pipeline"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row) return { ok: false as const };
    await assertCanDeletePipelineRow(ctx, row, args.memberUserKey);
    await deletePipelineGraph(ctx, args.fileId);
    return { ok: true as const };
  },
});

export const getPipelineFileReassignStatus = query({
  args: {
    ...memberArgs,
    fileId: v.id("pipeline"),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const row = await ctx.db.get(args.fileId);
    if (!row?.organizationId || row.organizationId !== args.organizationId) {
      return null;
    }
    const canDeleteOrReassign = await canDeleteOrReassignHierarchyEntity(
      ctx,
      {
        ownerUserId: row.ownerUserId,
        ownerUserKey: row.ownerUserKey,
        organizationId: row.organizationId,
      },
      args.memberUserKey,
    );
    return { canDeleteOrReassign };
  },
});

export const listProjects = query({
  args: { ...memberArgs },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const rows = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();
    const out: Array<{
      _id: Id<"projects">;
      title: string;
      clientId: Id<"clients">;
      ownerUserId: string;
    }> = [];
    for (const p of rows) {
      const level = await resolveProjectAccessLevel(ctx, p, args.memberUserKey);
      if (level === "none") continue;
      out.push({
        _id: p._id,
        title: p.title,
        clientId: p.clientId,
        ownerUserId: p.ownerUserId,
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  },
});
