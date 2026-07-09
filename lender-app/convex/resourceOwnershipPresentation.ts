/**
 * Phase 13.2 — canonical ownership lines, badges, collaborators, share notifications.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
  resolveTaskAccessLevel,
  type ResourceAccessLevel,
  type ResourceType,
} from "./resourceAccess";
import {
  resolveDisplayUsernameForUserKey,
  resolveDisplayUsernameMap,
} from "./auth/displayIdentity";
import { dispatchUserNotification } from "./notifications";
import type { NotificationCategory } from "../lib/notificationPreferences";
import { platformUserKeyFallback } from "./viewerIdentity";
import type { ResourceOwnershipBadgeKind } from "../lib/resourceOwnershipUi";
import {
  assertCanReadPipelineRow,
  assertCanReadTaskRow,
} from "./organizationAccess";

export type { ResourceOwnershipBadgeKind };

export type ResourceCollaborator = {
  userId: string;
  displayUsername: string;
  permission: "view" | "edit";
};

export type ResourceOwnershipPresentation = {
  ownershipLine: string;
  badge: ResourceOwnershipBadgeKind | null;
  ownerUserId: string;
  ownerDisplayUsername: string;
  viewerAccessLevel: ResourceAccessLevel;
  isOwner: boolean;
  isSharedViewer: boolean;
  collaboratorCount: number;
  hierarchyAccessLabel?: PipelineHierarchyAccessLabel | null;
};

const SHARE_NOTIFY_CATEGORY: NotificationCategory = "assignment_change";

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

async function sharePermissionForViewer(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  resourceType: ResourceType,
  resourceId: string,
  viewerKey: string,
): Promise<"view" | "edit" | null> {
  const rows = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", resourceType).eq("resourceId", resourceId),
    )
    .collect();
  const hit = rows.find(
    (r) =>
      r.organizationId === organizationId && r.sharedUserId === viewerKey,
  );
  return hit?.permission ?? null;
}

export async function listResourceCollaborators(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  resourceType: ResourceType,
  resourceId: string,
  ownerUserId: string,
): Promise<ResourceCollaborator[]> {
  const rows = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", resourceType).eq("resourceId", resourceId),
    )
    .collect();
  const scoped = rows.filter((r) => r.organizationId === organizationId);
  const out: ResourceCollaborator[] = [];
  for (const r of scoped) {
    if (r.sharedUserId === ownerUserId) continue;
    out.push({
      userId: r.sharedUserId,
      displayUsername: await resolveDisplayUsernameForUserKey(
        ctx,
        r.sharedUserId,
      ),
      permission: r.permission,
    });
  }
  out.sort((a, b) =>
    a.displayUsername.localeCompare(b.displayUsername, undefined, {
      sensitivity: "base",
    }),
  );
  return out;
}

export type PipelineHierarchyAccessLabel =
  | "Explicit Loan Share"
  | "Inherited from Project"
  | "Inherited from Client";

export async function resolvePipelineHierarchyAccessLabel(
  ctx: QueryCtx | MutationCtx,
  file: Doc<"pipeline">,
  viewerKey: string,
): Promise<PipelineHierarchyAccessLabel | null> {
  const owner = resolveRowOwnerUserId(file);
  if (!owner || owner === viewerKey) return null;
  const orgId = file.organizationId;
  if (!orgId) return null;

  const fileShare = await sharePermissionForViewer(
    ctx,
    orgId,
    "pipeline",
    String(file._id),
    viewerKey,
  );
  if (fileShare) return "Explicit Loan Share";

  if (file.projectId) {
    const projectShare = await sharePermissionForViewer(
      ctx,
      orgId,
      "project",
      String(file.projectId),
      viewerKey,
    );
    if (projectShare) return "Inherited from Project";
    const project = await ctx.db.get(file.projectId);
    if (project) {
      const clientShare = await sharePermissionForViewer(
        ctx,
        orgId,
        "client",
        String(project.clientId),
        viewerKey,
      );
      if (clientShare) return "Inherited from Client";
    }
  } else if (file.clientId) {
    const clientShare = await sharePermissionForViewer(
      ctx,
      orgId,
      "client",
      String(file.clientId),
      viewerKey,
    );
    if (clientShare) return "Inherited from Client";
  }

  const level = await resolvePipelineAccessLevel(ctx, file, viewerKey);
  if (level === "none") return null;
  if (file.projectId) return "Inherited from Project";
  if (file.clientId) return "Inherited from Client";
  return null;
}

export async function buildPipelineOwnershipPresentation(
  ctx: QueryCtx | MutationCtx,
  file: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<ResourceOwnershipPresentation | null> {
  const viewerKey = await resolveViewerKey(ctx, memberUserKey);
  const ownerUserId = resolveRowOwnerUserId(file);
  if (!ownerUserId) return null;
  const ownerDisplayUsername = await resolveDisplayUsernameForUserKey(
    ctx,
    ownerUserId,
  );
  const level = await resolvePipelineAccessLevel(ctx, file, memberUserKey);
  const isOwner = ownerUserId === viewerKey;
  const orgId = file.organizationId;
  const sharePerm =
    orgId && !isOwner
      ? await sharePermissionForViewer(
          ctx,
          orgId,
          "pipeline",
          String(file._id),
          viewerKey,
        )
      : null;
  const isSharedViewer = sharePerm != null;
  const collaborators =
    orgId != null
      ? await listResourceCollaborators(
          ctx,
          orgId,
          "pipeline",
          String(file._id),
          ownerUserId,
        )
      : [];

  let badge: ResourceOwnershipBadgeKind | null = null;
  let ownershipLine: string;
  if (isOwner) {
    badge = "owner";
    ownershipLine = `Owned by ${ownerDisplayUsername}`;
  } else if (isSharedViewer) {
    badge = sharePerm === "edit" ? "shared_edit" : "shared_view";
    ownershipLine = `Shared by ${ownerDisplayUsername}`;
  } else {
    ownershipLine = `Owned by ${ownerDisplayUsername}`;
  }

  const hierarchyAccessLabel =
    orgId != null
      ? await resolvePipelineHierarchyAccessLabel(ctx, file, viewerKey)
      : null;

  return {
    ownershipLine,
    badge,
    ownerUserId,
    ownerDisplayUsername,
    viewerAccessLevel: level,
    isOwner,
    isSharedViewer,
    collaboratorCount: collaborators.length,
    hierarchyAccessLabel,
  };
}

export async function buildTaskOwnershipPresentation(
  ctx: QueryCtx | MutationCtx,
  task: Doc<"tasks">,
  memberUserKey: string | undefined,
): Promise<ResourceOwnershipPresentation | null> {
  const viewerKey = await resolveViewerKey(ctx, memberUserKey);
  const ownerUserId = resolveRowOwnerUserId(task);
  if (!ownerUserId) return null;
  const ownerDisplayUsername = await resolveDisplayUsernameForUserKey(
    ctx,
    ownerUserId,
  );
  const level = await resolveTaskAccessLevel(ctx, task, memberUserKey);
  const isOwner = ownerUserId === viewerKey;
  const orgId = task.organizationId;
  const sharePerm =
    orgId && !isOwner
      ? await sharePermissionForViewer(
          ctx,
          orgId,
          "task",
          String(task._id),
          viewerKey,
        )
      : null;
  const isSharedViewer = sharePerm != null;
  const collaborators =
    orgId != null
      ? await listResourceCollaborators(
          ctx,
          orgId,
          "task",
          String(task._id),
          ownerUserId,
        )
      : [];

  let badge: ResourceOwnershipBadgeKind | null = null;
  let ownershipLine: string;
  if (isOwner) {
    badge = "owner";
    ownershipLine = `Owned by ${ownerDisplayUsername}`;
  } else if (isSharedViewer) {
    badge = sharePerm === "edit" ? "shared_edit" : "shared_view";
    ownershipLine = `Shared by ${ownerDisplayUsername}`;
  } else {
    ownershipLine = `Owned by ${ownerDisplayUsername}`;
  }

  return {
    ownershipLine,
    badge,
    ownerUserId,
    ownerDisplayUsername,
    viewerAccessLevel: level,
    isOwner,
    isSharedViewer,
    collaboratorCount: collaborators.length,
  };
}

export function formatShareActivitySummary(
  actorUsername: string,
  targetUsername: string,
  permission: "view" | "edit",
  kind: "grant" | "update" | "revoke",
): string {
  const a = actorUsername.trim() || "Someone";
  const t = targetUsername.trim() || "someone";
  switch (kind) {
    case "grant":
      return `${a} shared this file with ${t} (${permission} access)`;
    case "update":
      return `${a} updated ${t}'s access to ${permission}`;
    case "revoke":
      return `${a} revoked ${t}'s access`;
  }
}

export function formatTaskShareActivitySummary(
  actorUsername: string,
  targetUsername: string,
  permission: "view" | "edit",
  kind: "grant" | "update" | "revoke",
): string {
  const a = actorUsername.trim() || "Someone";
  const t = targetUsername.trim() || "someone";
  switch (kind) {
    case "grant":
      return `${a} shared this task with ${t} (${permission} access)`;
    case "update":
      return `${a} updated ${t}'s access to ${permission}`;
    case "revoke":
      return `${a} revoked ${t}'s access`;
  }
}

export async function notifyResourceShareEvent(
  ctx: MutationCtx,
  args: {
    recipientUserKey: string;
    actorUserKey: string;
    resourceType: ResourceType;
    resourceId: string;
    fileId?: Id<"pipeline">;
    taskId?: Id<"tasks">;
    event: "shared" | "upgraded_edit" | "downgraded_view" | "revoked";
    resourceLabel: string;
  },
): Promise<void> {
  const actorName = await resolveDisplayUsernameForUserKey(
    ctx,
    args.actorUserKey,
  );
  let summary: string;
  switch (args.event) {
    case "shared":
      summary = `${actorName} shared ${args.resourceLabel} with you`;
      break;
    case "upgraded_edit":
      summary = `${actorName}: access upgraded to Edit on ${args.resourceLabel}`;
      break;
    case "downgraded_view":
      summary = `${actorName}: access downgraded to View on ${args.resourceLabel}`;
      break;
    case "revoked":
      summary = `${actorName}: access revoked on ${args.resourceLabel}`;
      break;
  }
  const dedupeKey = `share:${args.resourceType}:${args.resourceId}:${args.recipientUserKey}:${args.event}:${Date.now()}`;
  await dispatchUserNotification(ctx, {
    userKey: args.recipientUserKey,
    category: SHARE_NOTIFY_CATEGORY,
    summary,
    actorUserKey: args.actorUserKey,
    fileId: args.fileId,
    taskId: args.taskId,
    dedupeKey,
  });
}

export const forPipelineFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return null;
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    return buildPipelineOwnershipPresentation(ctx, file, memberUserKey);
  },
});

export const forTask = query({
  args: {
    taskId: v.id("tasks"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, memberUserKey }) => {
    const task = await ctx.db.get(taskId);
    if (!task) return null;
    await assertCanReadTaskRow(ctx, task, memberUserKey);
    return buildTaskOwnershipPresentation(ctx, task, memberUserKey);
  },
});

export const collaboratorsForResource = query({
  args: {
    resourceType: v.union(v.literal("task"), v.literal("pipeline")),
    resourceId: v.string(),
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewerKey = await resolveViewerKey(ctx, args.memberUserKey);
    let ownerUserId = "";
    if (args.resourceType === "pipeline") {
      const file = await ctx.db.get(args.resourceId as Id<"pipeline">);
      if (!file?.organizationId) return { collaborators: [], viewerKey };
      ownerUserId = resolveRowOwnerUserId(file);
      const level = await resolvePipelineAccessLevel(ctx, file, args.memberUserKey);
      if (level === "none") return { collaborators: [], viewerKey };
    } else {
      const task = await ctx.db.get(args.resourceId as Id<"tasks">);
      if (!task?.organizationId) return { collaborators: [], viewerKey };
      ownerUserId = resolveRowOwnerUserId(task);
      const level = await resolveTaskAccessLevel(ctx, task, args.memberUserKey);
      if (level === "none") return { collaborators: [], viewerKey };
    }
    const collaborators = await listResourceCollaborators(
      ctx,
      args.organizationId,
      args.resourceType,
      args.resourceId,
      ownerUserId,
    );
    const labelMap = await resolveDisplayUsernameMap(
      ctx,
      collaborators.map((c) => c.userId),
    );
    return {
      viewerKey,
      ownerUserId,
      ownerDisplayUsername: ownerUserId
        ? await resolveDisplayUsernameForUserKey(ctx, ownerUserId)
        : "",
      collaborators: collaborators.map((c) => ({
        ...c,
        displayUsername: labelMap[c.userId] ?? c.displayUsername,
      })),
    };
  },
});
