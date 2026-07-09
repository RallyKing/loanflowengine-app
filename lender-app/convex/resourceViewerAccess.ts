/**
 * Phase 13.1B — viewer access banner context from canonical ACL (resourceShares).
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  assertCanReadPipelineRow,
  assertCanReadTaskRow,
  resolvePipelineAccessLevel,
  resolveRowOwnerUserId,
  resolveTaskAccessLevel,
  type ResourceAccessLevel,
} from "./resourceAccess";
import { resolveDisplayUsernameForUserKey } from "./auth/displayIdentity";
import { platformUserKeyFallback } from "./viewerIdentity";

export type ResourceAccessBannerMode = "none" | "view" | "edit";

export type ResourceViewerAccess = {
  bannerMode: ResourceAccessBannerMode;
  canMutate: boolean;
  isOwner: boolean;
  ownerUserId: string;
  ownerDisplayUsername: string;
  accessLevel: ResourceAccessLevel;
};

async function resolveViewerMemberKey(
  ctx: QueryCtx,
  memberUserKey: string | undefined,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.subject?.trim()) return identity.subject.trim();
  const key = memberUserKey?.trim();
  if (key) return key;
  return platformUserKeyFallback();
}

function bannerModeFromAccess(
  isOwner: boolean,
  level: ResourceAccessLevel,
): ResourceAccessBannerMode {
  if (isOwner || level === "none") return "none";
  if (level === "view") return "view";
  return "edit";
}

export async function buildPipelineViewerAccess(
  ctx: QueryCtx,
  file: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<ResourceViewerAccess> {
  const key = await resolveViewerMemberKey(ctx, memberUserKey);
  const ownerUserId = resolveRowOwnerUserId(file);
  const level = await resolvePipelineAccessLevel(ctx, file, memberUserKey);
  const isOwner = !!ownerUserId && ownerUserId === key;
  const bannerMode = bannerModeFromAccess(isOwner, level);
  const ownerDisplayUsername = ownerUserId
    ? await resolveDisplayUsernameForUserKey(ctx, ownerUserId)
    : "";
  return {
    bannerMode,
    canMutate: level === "edit",
    isOwner,
    ownerUserId,
    ownerDisplayUsername,
    accessLevel: level,
  };
}

export async function buildTaskViewerAccess(
  ctx: QueryCtx,
  task: Doc<"tasks">,
  memberUserKey: string | undefined,
): Promise<ResourceViewerAccess> {
  const key = await resolveViewerMemberKey(ctx, memberUserKey);
  const ownerUserId = resolveRowOwnerUserId(task);
  const level = await resolveTaskAccessLevel(ctx, task, memberUserKey);
  const isOwner = !!ownerUserId && ownerUserId === key;
  const bannerMode = bannerModeFromAccess(isOwner, level);
  const ownerDisplayUsername = ownerUserId
    ? await resolveDisplayUsernameForUserKey(ctx, ownerUserId)
    : "";
  return {
    bannerMode,
    canMutate: level === "edit",
    isOwner,
    ownerUserId,
    ownerDisplayUsername,
    accessLevel: level,
  };
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
    return buildPipelineViewerAccess(ctx, file, memberUserKey);
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
    return buildTaskViewerAccess(ctx, task, memberUserKey);
  },
});
