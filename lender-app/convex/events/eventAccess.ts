/**
 * Phase 16 — owner-scoped ACL for Events domain (no org-wide, no hierarchy inheritance).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  impersonationGrantsOrgResourceVisibility,
  removeResourceShare,
  resolveRowOwnerUserId,
  type ResourceType,
} from "../resourceAccess";
import { platformUserKeyFallback } from "../viewerIdentity";
import type { EventShareResourceType } from "./eventTypes";

export type { EventShareResourceType };

async function resolveViewerKey(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.subject?.trim()) return identity.subject.trim();
  const key = memberUserKey?.trim();
  if (key) return key;
  return platformUserKeyFallback();
}

type OwnerScopedRow = {
  _id: string;
  organizationId: Id<"organizations">;
  ownerUserId: string;
  ownerUserKey: string;
};

export type EventAccessLevel = "none" | "view" | "edit";
export type EventCollaboratorRole = "co_owner" | "editor" | "viewer";

export type EventAccessContext = {
  level: EventAccessLevel;
  isOwner: boolean;
  collaboratorRole: EventCollaboratorRole | null;
};

function rowOwnerKey(row: { ownerUserId: string; ownerUserKey: string }): string {
  return resolveRowOwnerUserId(row);
}

export async function resolveEventDomainAccess(
  ctx: QueryCtx | MutationCtx,
  args: {
    resourceType: EventShareResourceType;
    resourceId: string;
    organizationId: Id<"organizations">;
    ownerUserId: string;
    ownerUserKey: string;
    memberUserKey: string | undefined;
  },
): Promise<EventAccessContext> {
  let key: string;
  try {
    key = await resolveViewerKey(ctx, args.memberUserKey);
  } catch {
    return { level: "none", isOwner: false, collaboratorRole: null };
  }

  if (
    await impersonationGrantsOrgResourceVisibility(ctx, key, args.organizationId)
  ) {
    return { level: "edit", isOwner: false, collaboratorRole: null };
  }

  const owner = rowOwnerKey({
    ownerUserId: args.ownerUserId,
    ownerUserKey: args.ownerUserKey,
  });
  if (owner && owner === key) {
    return { level: "edit", isOwner: true, collaboratorRole: null };
  }

  const share = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource_user", (q) =>
      q
        .eq("resourceType", args.resourceType)
        .eq("resourceId", args.resourceId)
        .eq("sharedUserId", key),
    )
    .first();

  if (!share) {
    return { level: "none", isOwner: false, collaboratorRole: null };
  }

  const role = (share.collaboratorRole ?? inferRoleFromPermission(share.permission)) as
    | EventCollaboratorRole
    | null;
  const level: EventAccessLevel =
    share.permission === "edit" ? "edit" : "view";
  return { level, isOwner: false, collaboratorRole: role };
}

function inferRoleFromPermission(
  permission: "view" | "edit",
): EventCollaboratorRole {
  return permission === "edit" ? "editor" : "viewer";
}

export async function filterRowsByEventDomainAcl<T extends OwnerScopedRow>(
  ctx: QueryCtx,
  rows: T[],
  memberUserKey: string | undefined,
  resourceType: EventShareResourceType,
): Promise<T[]> {
  const key = await resolveViewerKey(ctx, memberUserKey);
  const orgId = rows[0]?.organizationId;
  if (!orgId) return [];
  if (await impersonationGrantsOrgResourceVisibility(ctx, key, orgId)) {
    return rows.filter((r) => r.organizationId === orgId);
  }

  const shares = await ctx.db
    .query("resourceShares")
    .withIndex("by_org_shared_user_type", (q) =>
      q
        .eq("organizationId", orgId)
        .eq("sharedUserId", key)
        .eq("resourceType", resourceType),
    )
    .collect();
  const viewIds = new Set<string>();
  const editIds = new Set<string>();
  for (const s of shares) {
    if (s.permission === "edit") {
      editIds.add(s.resourceId);
      viewIds.add(s.resourceId);
    } else {
      viewIds.add(s.resourceId);
    }
  }

  return rows.filter((r) => {
    if (r.organizationId !== orgId) return false;
    const owner = rowOwnerKey(r);
    if (!owner) return false;
    if (owner === key) return true;
    const id = String(r._id);
    return viewIds.has(id) || editIds.has(id);
  });
}

export async function upsertEventDomainShare(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    resourceType: EventShareResourceType;
    resourceId: string;
    sharedUserId: string;
    collaboratorRole: EventCollaboratorRole;
    createdByUserId: string;
    /** When linking event collaborators row (events only). */
    eventId?: Id<"events">;
  },
): Promise<Id<"resourceShares">> {
  const permission = args.collaboratorRole === "viewer" ? "view" : "edit";
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

  let shareId: Id<"resourceShares">;
  if (existing) {
    await ctx.db.patch(existing._id, {
      permission,
      collaboratorRole: args.collaboratorRole,
      updatedAt: now,
    });
    shareId = existing._id;
  } else {
    shareId = await ctx.db.insert("resourceShares", {
      organizationId: args.organizationId,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      sharedUserId: args.sharedUserId,
      permission,
      collaboratorRole: args.collaboratorRole,
      createdAt: now,
      createdByUserId: args.createdByUserId,
      updatedAt: now,
    });
  }

  if (args.resourceType === "event" && args.eventId) {
    const collab = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId!).eq("userId", args.sharedUserId),
      )
      .first();
    if (collab) {
      await ctx.db.patch(collab._id, {
        collaboratorRole: args.collaboratorRole,
        resourceShareId: shareId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("eventCollaborators", {
        eventId: args.eventId,
        organizationId: args.organizationId,
        userId: args.sharedUserId,
        collaboratorRole: args.collaboratorRole,
        resourceShareId: shareId,
        createdAt: now,
        updatedAt: now,
        createdByUserId: args.createdByUserId,
      });
    }
  }

  return shareId;
}

export async function removeEventDomainShare(
  ctx: MutationCtx,
  args: {
    resourceType: ResourceType;
    resourceId: string;
    sharedUserId: string;
    eventId?: Id<"events">;
  },
): Promise<boolean> {
  const removed = await removeResourceShare(ctx, args);
  if (args.eventId) {
    const collab = await ctx.db
      .query("eventCollaborators")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId!).eq("userId", args.sharedUserId),
      )
      .first();
    if (collab) await ctx.db.delete(collab._id);
  }
  return removed;
}
