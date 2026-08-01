/**
 * Owner-scoped ACL for tasks and pipeline files (Phase 12.2 Step 8B).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAuthenticatedCaller } from "./callerAuth";
import { getActiveImpersonationForInitiatorKey } from "./superuserImpersonation/runtime";
import { pickCanonicalOrgMember } from "./orgMembership";
import {
  authUserHasGlobalAdminElevation,
  tryGetAuthUserByPermissionKey,
} from "./auth/globalAdmin";
import { callerHasUnrestrictedOrgDataAccess } from "./viewerOrgAccess";
import { rowBelongsToOrganizationScope } from "./orgScopeMatching";

export type ResourceType =
  | "client"
  | "project"
  | "task"
  | "pipeline"
  | "event"
  | "event_idea"
  | "event_invitation"
  | "event_template";
export type ResourceAccessLevel = "none" | "view" | "edit";

type OwnerRow = {
  ownerUserId?: string | null;
  ownerUserKey?: string | null;
  organizationId?: Id<"organizations"> | null;
};

export function resolveRowOwnerUserId(row: OwnerRow): string {
  return row.ownerUserId?.trim() || row.ownerUserKey?.trim() || "";
}

export function ownerFieldsForInsert(
  ownerUserId: string,
): { ownerUserId: string; ownerUserKey: string } {
  const id = ownerUserId.trim();
  return { ownerUserId: id, ownerUserKey: id };
}

/** `tasks` table — schema has `ownerUserId` only (no `ownerUserKey`). */
export function ownerUserIdFieldsForInsert(
  ownerUserId: string,
): { ownerUserId: string } {
  const id = ownerUserId.trim();
  return { ownerUserId: id };
}

async function resolveViewerKey(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<string> {
  return requireAuthenticatedCaller(ctx, memberUserKey);
}

export async function impersonationGrantsOrgResourceVisibility(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  const activeImp = await getActiveImpersonationForInitiatorKey(ctx, memberUserKey);
  if (!activeImp) return false;
  return String(activeImp.targetOrganizationId) === String(organizationId);
}

type ShareIndex = { viewIds: Set<string>; editIds: Set<string> };

async function buildShareIndexForUser(
  ctx: QueryCtx | MutationCtx,
  sharedUserId: string,
  organizationId: Id<"organizations">,
  resourceType: ResourceType,
): Promise<ShareIndex> {
  const rows = await ctx.db
    .query("resourceShares")
    .withIndex("by_org_shared_user_type", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("sharedUserId", sharedUserId)
        .eq("resourceType", resourceType),
    )
    .collect();
  const viewIds = new Set<string>();
  const editIds = new Set<string>();
  for (const row of rows) {
    if (row.permission === "edit") {
      editIds.add(row.resourceId);
      viewIds.add(row.resourceId);
    } else {
      viewIds.add(row.resourceId);
    }
  }
  return { viewIds, editIds };
}

async function mergeLegacyPipelineShares(
  ctx: QueryCtx | MutationCtx,
  key: string,
  scoped: Doc<"pipeline">[],
  shares: ShareIndex,
): Promise<void> {
  const legacy = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_userKey", (q) => q.eq("userKey", key))
    .collect();
  const now = Date.now();
  for (const s of legacy) {
    const id = String(s.fileId);
    if (!scoped.some((r) => String(r._id) === id)) continue;
    if (s.expiresAtMs != null && s.expiresAtMs <= now) continue;
    const pl = s.permissionLevel;
    if (s.access === "edit" || pl === "edit" || pl === "manage") {
      shares.editIds.add(id);
      shares.viewIds.add(id);
    } else {
      shares.viewIds.add(id);
    }
  }
}

async function resolveLegacyPipelineShareLevel(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  memberUserKey: string,
): Promise<ResourceAccessLevel> {
  const share = await ctx.db
    .query("pipelineFileShares")
    .withIndex("by_file_user", (q) =>
      q.eq("fileId", fileId).eq("userKey", memberUserKey),
    )
    .first();
  if (!share) return "none";
  const now = Date.now();
  if (share.expiresAtMs != null && share.expiresAtMs <= now) return "none";
  const pl = share.permissionLevel;
  if (share.access === "edit" || pl === "edit" || pl === "manage") return "edit";
  if (share.access === "view" || pl === "view" || pl === "comment") return "view";
  return "none";
}

export async function resolveResourceShareLevel(
  ctx: QueryCtx | MutationCtx,
  args: {
    resourceType: ResourceType;
    resourceId: string;
    organizationId: Id<"organizations">;
    memberUserKey: string;
  },
): Promise<ResourceAccessLevel> {
  const row = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource_user", (q) =>
      q
        .eq("resourceType", args.resourceType)
        .eq("resourceId", args.resourceId)
        .eq("sharedUserId", args.memberUserKey),
    )
    .first();
  if (row) return row.permission === "edit" ? "edit" : "view";
  if (args.resourceType === "pipeline") {
    return resolveLegacyPipelineShareLevel(
      ctx,
      args.resourceId as Id<"pipeline">,
      args.memberUserKey,
    );
  }
  return "none";
}

export async function resolveClientAccessLevel(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"clients">,
  memberUserKey: string | undefined,
): Promise<ResourceAccessLevel> {
  let key: string;
  try {
    key = await resolveViewerKey(ctx, memberUserKey);
  } catch {
    return "none";
  }
  if (
    await impersonationGrantsOrgResourceVisibility(ctx, key, row.organizationId)
  ) {
    return "edit";
  }
  const owner = resolveRowOwnerUserId(row);
  if (!owner) return "none";
  if (owner === key) return "edit";
  return resolveResourceShareLevel(ctx, {
    resourceType: "client",
    resourceId: String(row._id),
    organizationId: row.organizationId,
    memberUserKey: key,
  });
}

export async function resolveProjectAccessLevel(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"projects">,
  memberUserKey: string | undefined,
): Promise<ResourceAccessLevel> {
  let key: string;
  try {
    key = await resolveViewerKey(ctx, memberUserKey);
  } catch {
    return "none";
  }
  if (
    await impersonationGrantsOrgResourceVisibility(ctx, key, row.organizationId)
  ) {
    return "edit";
  }
  const owner = resolveRowOwnerUserId(row);
  if (owner === key) return "edit";
  const direct = await resolveResourceShareLevel(ctx, {
    resourceType: "project",
    resourceId: String(row._id),
    organizationId: row.organizationId,
    memberUserKey: key,
  });
  if (direct !== "none") return direct;
  const client = await ctx.db.get(row.clientId);
  if (!client) return "none";
  return resolveClientAccessLevel(ctx, client, key);
}

type HierarchyVisibilityIndex = {
  ownedClientIds: Set<string>;
  ownedProjectIds: Set<string>;
  clientViewIds: Set<string>;
  clientEditIds: Set<string>;
  projectViewIds: Set<string>;
  projectEditIds: Set<string>;
  projectToClientId: Map<string, string>;
};

async function buildHierarchyVisibilityIndex(
  ctx: QueryCtx,
  memberUserKey: string,
  organizationId: Id<"organizations">,
): Promise<HierarchyVisibilityIndex> {
  const clients = await ctx.db
    .query("clients")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
  const clientShares = await buildShareIndexForUser(
    ctx,
    memberUserKey,
    organizationId,
    "client",
  );
  const projectShares = await buildShareIndexForUser(
    ctx,
    memberUserKey,
    organizationId,
    "project",
  );
  const ownedClientIds = new Set<string>();
  const ownedProjectIds = new Set<string>();
  const projectToClientId = new Map<string, string>();
  for (const c of clients) {
    if (resolveRowOwnerUserId(c) === memberUserKey) {
      ownedClientIds.add(String(c._id));
    }
  }
  for (const p of projects) {
    projectToClientId.set(String(p._id), String(p.clientId));
    if (resolveRowOwnerUserId(p) === memberUserKey) {
      ownedProjectIds.add(String(p._id));
    }
  }
  return {
    ownedClientIds,
    ownedProjectIds,
    clientViewIds: clientShares.viewIds,
    clientEditIds: clientShares.editIds,
    projectViewIds: projectShares.viewIds,
    projectEditIds: projectShares.editIds,
    projectToClientId,
  };
}

function pipelineVisibleViaHierarchy(
  row: Doc<"pipeline">,
  index: HierarchyVisibilityIndex,
): boolean {
  if (!row.clientId && !row.projectId) return false;
  const pid = row.projectId ? String(row.projectId) : null;
  const cid = row.clientId ? String(row.clientId) : null;
  if (pid) {
    if (
      index.ownedProjectIds.has(pid) ||
      index.projectViewIds.has(pid) ||
      index.projectEditIds.has(pid)
    ) {
      return true;
    }
    const parentClient = index.projectToClientId.get(pid);
    if (parentClient) {
      if (
        index.ownedClientIds.has(parentClient) ||
        index.clientViewIds.has(parentClient) ||
        index.clientEditIds.has(parentClient)
      ) {
        return true;
      }
    }
  }
  if (
    cid &&
    (index.ownedClientIds.has(cid) ||
      index.clientViewIds.has(cid) ||
      index.clientEditIds.has(cid))
  ) {
    return true;
  }
  return false;
}

async function resolveInheritedPipelineAccessLevel(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string,
): Promise<ResourceAccessLevel> {
  if (!row.organizationId || (!row.clientId && !row.projectId)) {
    return "none";
  }
  if (row.projectId) {
    const project = await ctx.db.get(row.projectId);
    if (project && project.organizationId === row.organizationId) {
      const level = await resolveProjectAccessLevel(ctx, project, memberUserKey);
      if (level !== "none") return level;
    }
  }
  if (row.clientId) {
    const client = await ctx.db.get(row.clientId);
    if (client && client.organizationId === row.organizationId) {
      return resolveClientAccessLevel(ctx, client, memberUserKey);
    }
  }
  return "none";
}

async function legacyRowAccessLevel(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<ResourceAccessLevel> {
  try {
    const key = await resolveViewerKey(ctx, memberUserKey);
    const authUser = await tryGetAuthUserByPermissionKey(ctx, key);
    return authUserHasGlobalAdminElevation(authUser) ? "edit" : "none";
  } catch {
    return "none";
  }
}

export async function resolvePipelineAccessLevel(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<ResourceAccessLevel> {
  if (!row.organizationId) return legacyRowAccessLevel(ctx, memberUserKey);
  let key: string;
  try {
    key = await resolveViewerKey(ctx, memberUserKey);
  } catch {
    return "none";
  }
  if (await impersonationGrantsOrgResourceVisibility(ctx, key, row.organizationId)) {
    return "edit";
  }
  const owner = resolveRowOwnerUserId(row);
  if (!owner) return "none";
  if (owner === key) return "edit";
  const direct = await resolveResourceShareLevel(ctx, {
    resourceType: "pipeline",
    resourceId: String(row._id),
    organizationId: row.organizationId,
    memberUserKey: key,
  });
  if (direct !== "none") return direct;
  return resolveInheritedPipelineAccessLevel(ctx, row, key);
}

export async function resolveTaskAccessLevel(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"tasks">,
  memberUserKey: string | undefined,
): Promise<ResourceAccessLevel> {
  if (!row.organizationId) return legacyRowAccessLevel(ctx, memberUserKey);
  let key: string;
  try {
    key = await resolveViewerKey(ctx, memberUserKey);
  } catch {
    return "none";
  }
  if (await impersonationGrantsOrgResourceVisibility(ctx, key, row.organizationId)) {
    return "edit";
  }
  const owner = resolveRowOwnerUserId(row);
  if (!owner) return "none";
  if (owner === key) return "edit";
  return resolveResourceShareLevel(ctx, {
    resourceType: "task",
    resourceId: String(row._id),
    organizationId: row.organizationId,
    memberUserKey: key,
  });
}

export async function filterPipelineRowsForMember(
  ctx: QueryCtx,
  rows: Doc<"pipeline">[],
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
): Promise<Doc<"pipeline">[]> {
  const key = await resolveViewerKey(ctx, memberUserKey);
  const scoped = rows.filter((r) =>
    rowBelongsToOrganizationScope(r.organizationId, organizationId),
  );
  if (await callerHasUnrestrictedOrgDataAccess(ctx, key)) {
    return scoped;
  }
  if (await impersonationGrantsOrgResourceVisibility(ctx, key, organizationId)) {
    return scoped;
  }
  const shares = await buildShareIndexForUser(ctx, key, organizationId, "pipeline");
  await mergeLegacyPipelineShares(ctx, key, scoped, shares);
  const hierarchy = await buildHierarchyVisibilityIndex(
    ctx,
    key,
    organizationId,
  );
  return scoped.filter((r) => {
    const owner = resolveRowOwnerUserId(r);
    if (!owner) return false;
    if (owner === key) return true;
    const id = String(r._id);
    if (shares.viewIds.has(id) || shares.editIds.has(id)) return true;
    return pipelineVisibleViaHierarchy(r, hierarchy);
  });
}

export async function filterTaskRowsForMember(
  ctx: QueryCtx,
  rows: Doc<"tasks">[],
  organizationId: Id<"organizations">,
  memberUserKey: string | undefined,
): Promise<Doc<"tasks">[]> {
  const key = await resolveViewerKey(ctx, memberUserKey);
  const scoped = rows.filter((r) =>
    rowBelongsToOrganizationScope(r.organizationId, organizationId),
  );
  if (await callerHasUnrestrictedOrgDataAccess(ctx, key)) {
    return scoped;
  }
  if (await impersonationGrantsOrgResourceVisibility(ctx, key, organizationId)) {
    return scoped;
  }
  const shares = await buildShareIndexForUser(ctx, key, organizationId, "task");
  return scoped.filter((r) => {
    const owner = resolveRowOwnerUserId(r);
    if (!owner) return false;
    if (owner === key) return true;
    const id = String(r._id);
    return shares.viewIds.has(id) || shares.editIds.has(id);
  });
}

export async function recordResourceAccessDenial(
  ctx: MutationCtx,
  args: {
    actorUserId: string;
    organizationId: Id<"organizations">;
    resourceType: ResourceType;
    resourceId: string;
    action: string;
    reason: string;
  },
): Promise<void> {
  await ctx.db.insert("resourceAccessDenials", {
    actorUserId: args.actorUserId,
    organizationId: args.organizationId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    action: args.action,
    reason: args.reason,
    at: Date.now(),
  });
}

export async function assertCanMutatePipelineRow(
  ctx: MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
  action = "mutate",
): Promise<void> {
  if (!row.organizationId) {
    const level = await legacyRowAccessLevel(ctx, memberUserKey);
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this pipeline file.");
    }
    return;
  }
  const key = await resolveViewerKey(ctx, memberUserKey);
  const level = await resolvePipelineAccessLevel(ctx, row, key);
  if (level !== "edit") {
    await recordResourceAccessDenial(ctx, {
      actorUserId: key,
      organizationId: row.organizationId,
      resourceType: "pipeline",
      resourceId: String(row._id),
      action,
      reason: level === "view" ? "readonly_share" : "not_owner_or_editor",
    });
    throw new Error("You do not have permission to edit this pipeline file.");
  }
}

export async function assertCanReadPipelineRow(
  ctx: QueryCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!row.organizationId) {
    const level = await legacyRowAccessLevel(ctx, memberUserKey);
    if (level === "none") {
      throw new Error("You do not have access to this pipeline file.");
    }
    return;
  }
  const level = await resolvePipelineAccessLevel(ctx, row, memberUserKey);
  if (level === "none") {
    throw new Error("You do not have access to this pipeline file.");
  }
}

/** Phase 15 Step 11 — canonical read gate for file-scoped downstream modules. */
export async function assertCanAccessFile(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"pipeline">,
  memberUserKey: string | undefined,
): Promise<Doc<"pipeline">> {
  const row = await ctx.db.get(fileId);
  if (!row) {
    throw new Error("Pipeline file not found.");
  }
  await assertCanReadPipelineRow(ctx, row, memberUserKey);
  return row;
}

export async function pipelineFileReadable(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<boolean> {
  if (!row.organizationId) {
    const level = await legacyRowAccessLevel(ctx, memberUserKey);
    return level !== "none";
  }
  const level = await resolvePipelineAccessLevel(ctx, row, memberUserKey);
  return level !== "none";
}

export async function assertCanMutateTaskRow(
  ctx: MutationCtx,
  row: Doc<"tasks">,
  memberUserKey: string | undefined,
  action = "mutate",
): Promise<void> {
  if (!row.organizationId) {
    const level = await legacyRowAccessLevel(ctx, memberUserKey);
    if (level !== "edit") {
      throw new Error("You do not have permission to edit this task.");
    }
    return;
  }
  const key = await resolveViewerKey(ctx, memberUserKey);
  const level = await resolveTaskAccessLevel(ctx, row, key);
  if (level !== "edit") {
    await recordResourceAccessDenial(ctx, {
      actorUserId: key,
      organizationId: row.organizationId,
      resourceType: "task",
      resourceId: String(row._id),
      action,
      reason: level === "view" ? "readonly_share" : "not_owner_or_editor",
    });
    throw new Error("You do not have permission to edit this task.");
  }
}

export async function assertCanReadTaskRow(
  ctx: QueryCtx,
  row: Doc<"tasks">,
  memberUserKey: string | undefined,
): Promise<void> {
  if (!row.organizationId) {
    const level = await legacyRowAccessLevel(ctx, memberUserKey);
    if (level === "none") {
      throw new Error("You do not have access to this task.");
    }
    return;
  }
  const level = await resolveTaskAccessLevel(ctx, row, memberUserKey);
  if (level === "none") {
    throw new Error("You do not have access to this task.");
  }
}

export async function upsertResourceShare(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    resourceType: ResourceType;
    resourceId: string;
    sharedUserId: string;
    permission: "view" | "edit";
    createdByUserId: string;
    collaboratorRole?: "co_owner" | "editor" | "viewer";
  },
): Promise<Id<"resourceShares">> {
  const now = Date.now();
  const existing = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource_user", (q) =>
      q
        .eq("resourceType", args.resourceType)
        .eq("resourceId", args.resourceId)
        .eq("sharedUserId", args.sharedUserId),
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      permission: args.permission,
      ...(args.collaboratorRole !== undefined
        ? { collaboratorRole: args.collaboratorRole }
        : {}),
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("resourceShares", {
    organizationId: args.organizationId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    sharedUserId: args.sharedUserId,
    permission: args.permission,
    ...(args.collaboratorRole !== undefined
      ? { collaboratorRole: args.collaboratorRole }
      : {}),
    createdAt: now,
    createdByUserId: args.createdByUserId,
    updatedAt: now,
  });
}

export async function removeResourceShare(
  ctx: MutationCtx,
  args: {
    resourceType: ResourceType;
    resourceId: string;
    sharedUserId: string;
  },
): Promise<boolean> {
  const existing = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource_user", (q) =>
      q
        .eq("resourceType", args.resourceType)
        .eq("resourceId", args.resourceId)
        .eq("sharedUserId", args.sharedUserId),
    )
    .first();
  if (!existing) return false;
  await ctx.db.delete(existing._id);
  return true;
}

/** Phase 15 Step 7 — owner or org admin/owner role (not shared editors). */
export async function viewerIsOrgAdminOrOwner(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<boolean> {
  if (
    await impersonationGrantsOrgResourceVisibility(
      ctx,
      memberUserKey,
      organizationId,
    )
  ) {
    return true;
  }
  const rows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", organizationId).eq("userKey", memberUserKey),
    )
    .collect();
  const membership = pickCanonicalOrgMember(rows);
  if (!membership || membership.isActive === false) return false;
  return membership.role === "admin" || membership.role === "owner";
}

export async function assertCanDeleteOrReassignHierarchyEntity(
  ctx: QueryCtx | MutationCtx,
  row: OwnerRow & { organizationId: Id<"organizations"> },
  memberUserKey: string | undefined,
  entityLabel: string,
): Promise<void> {
  const key = await resolveViewerKey(ctx, memberUserKey);
  const owner = resolveRowOwnerUserId(row);
  if (owner && owner === key) return;
  if (await viewerIsOrgAdminOrOwner(ctx, row.organizationId, key)) return;
  throw new Error(
    `Only the ${entityLabel} owner or an organization admin can perform this action.`,
  );
}

export async function canDeleteOrReassignHierarchyEntity(
  ctx: QueryCtx | MutationCtx,
  row: OwnerRow & { organizationId: Id<"organizations"> },
  memberUserKey: string | undefined,
): Promise<boolean> {
  try {
    await assertCanDeleteOrReassignHierarchyEntity(
      ctx,
      row,
      memberUserKey,
      "entity",
    );
    return true;
  } catch {
    return false;
  }
}
