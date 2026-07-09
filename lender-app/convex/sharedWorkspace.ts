/**
 * Phase 13.1 — unified shared workspace feed (query composition on resourceShares ACL).
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanReadPipelineRow,
  assertCanReadTaskRow,
  assertOrgScopeArgs,
  resolveMemberUserKey,
} from "./organizationAccess";
import { resolveRowOwnerUserId } from "./resourceAccess";
import { resolveDisplayUsernameForUserKey } from "./auth/displayIdentity";
import {
  buildPipelineOwnershipPresentation,
  buildTaskOwnershipPresentation,
} from "./resourceOwnershipPresentation";
import type { ResourceOwnershipBadgeKind } from "../lib/resourceOwnershipUi";

const feedModeV = v.union(v.literal("with_me"), v.literal("by_me"));

export type SharedFeedRow = {
  shareId: Id<"resourceShares">;
  resourceType: "task" | "pipeline";
  resourceId: string;
  title: string;
  permission: "view" | "edit";
  ownerUserId: string;
  ownerDisplayUsername: string;
  ownershipLine: string;
  ownershipBadge: ResourceOwnershipBadgeKind | null;
  sharedUserId: string;
  sharedDisplayUsername: string;
  updatedAt: number;
};

async function collectOrgShares(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
) {
  return ctx.db
    .query("resourceShares")
    .withIndex("by_org_shared_user_type", (q) =>
      q.eq("organizationId", organizationId),
    )
    .collect();
}

async function collectSharesWithMe(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
) {
  const taskRows = await ctx.db
    .query("resourceShares")
    .withIndex("by_org_shared_user_type", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("sharedUserId", memberUserKey)
        .eq("resourceType", "task"),
    )
    .collect();
  const pipelineRows = await ctx.db
    .query("resourceShares")
    .withIndex("by_org_shared_user_type", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("sharedUserId", memberUserKey)
        .eq("resourceType", "pipeline"),
    )
    .collect();
  return [...taskRows, ...pipelineRows];
}

async function hydrateShareRow(
  ctx: QueryCtx,
  share: Doc<"resourceShares">,
  viewerKey: string,
  mode: "with_me" | "by_me",
): Promise<SharedFeedRow | null> {
  if (share.resourceType !== "task" && share.resourceType !== "pipeline") {
    return null;
  }
  const resourceType = share.resourceType;
  let doc: Doc<"tasks"> | Doc<"pipeline"> | null = null;
  let title = "";

  if (resourceType === "task") {
    doc = await ctx.db.get(share.resourceId as Id<"tasks">);
    if (!doc || (doc as Doc<"tasks">).status === "archived") return null;
    title = doc.title?.trim() || "Untitled task";
  } else {
    doc = await ctx.db.get(share.resourceId as Id<"pipeline">);
    if (!doc || doc.archivedAt != null) return null;
    title = doc.fileName?.trim() || "Untitled file";
  }

  const ownerUserId = resolveRowOwnerUserId(doc);
  if (!ownerUserId) return null;

  if (mode === "with_me") {
    if (share.sharedUserId !== viewerKey) return null;
    if (ownerUserId === viewerKey) return null;
    try {
      if (resourceType === "task") {
        await assertCanReadTaskRow(ctx, doc as Doc<"tasks">, viewerKey);
      } else {
        await assertCanReadPipelineRow(ctx, doc as Doc<"pipeline">, viewerKey);
      }
    } catch {
      return null;
    }
  } else {
    if (ownerUserId !== viewerKey) return null;
  }

  const docUpdated =
    resourceType === "task"
      ? ((doc as Doc<"tasks">).updatedAt ?? doc._creationTime)
      : ((doc as Doc<"pipeline">).updatedAt ?? doc._creationTime);

  const ownership =
    resourceType === "task"
      ? await buildTaskOwnershipPresentation(
          ctx,
          doc as Doc<"tasks">,
          viewerKey,
        )
      : await buildPipelineOwnershipPresentation(
          ctx,
          doc as Doc<"pipeline">,
          viewerKey,
        );
  const ownerDisplayUsername = await resolveDisplayUsernameForUserKey(
    ctx,
    ownerUserId,
  );

  return {
    shareId: share._id,
    resourceType,
    resourceId: share.resourceId,
    title,
    permission: share.permission,
    ownerUserId,
    ownerDisplayUsername,
    ownershipLine:
      ownership?.ownershipLine ?? `Owned by ${ownerDisplayUsername}`,
    ownershipBadge: ownership?.badge ?? null,
    sharedUserId: share.sharedUserId,
    sharedDisplayUsername: await resolveDisplayUsernameForUserKey(
      ctx,
      share.sharedUserId,
    ),
    updatedAt: Math.max(share.updatedAt, docUpdated),
  };
}

export async function buildSharedFeedList(
  ctx: QueryCtx | MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey: string;
    mode: "with_me" | "by_me";
  },
): Promise<SharedFeedRow[]> {
  const shares =
    args.mode === "with_me"
      ? await collectSharesWithMe(ctx, args.organizationId, args.memberUserKey)
      : await collectOrgShares(ctx, args.organizationId);

  const rows: SharedFeedRow[] = [];
  for (const share of shares) {
    const row = await hydrateShareRow(
      ctx,
      share,
      args.memberUserKey,
      args.mode,
    );
    if (row) rows.push(row);
  }

  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows;
}

export const listFeed = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    mode: feedModeV,
  },
  handler: async (ctx, { organizationId, memberUserKey, mode }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    const viewerKey = await resolveMemberUserKey(ctx, memberUserKey);
    return buildSharedFeedList(ctx, {
      organizationId,
      memberUserKey: viewerKey,
      mode,
    });
  },
});
