/**
 * Pipeline file sharing — resourceShares ACL only (Phase 13.1A).
 * Legacy `pipelineFileShares` rows are not written; pending emails use `pipelineSharePendingInvites`.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { appendPipelineFileActivity } from "./pipelineFileActivity";
import { resyncFileTeamEdgesFromPipeline } from "./indexedGraphEdgeSync";
import {
  assertOrgMember,
  resolveOrgPipelineFileAccessLevel,
} from "./organizationAccess";
import {
  removeResourceShare,
  resolveRowOwnerUserId,
  upsertResourceShare,
} from "./resourceAccess";
import { resolveShareTargetUserKey } from "./shareTargetResolve";
import { resolveDisplayUsernameForUserKey } from "./auth/displayIdentity";
import {
  canonicalEmailKey,
  findAuthUserForShareResolution,
} from "./auth/canonicalIdentity";
import { pickCanonicalOrgMember } from "./orgMembership";
import {
  formatShareActivitySummary,
  notifyResourceShareEvent,
} from "./resourceOwnershipPresentation";

const sharePermissionV = v.union(v.literal("view"), v.literal("edit"));

async function assertCanManageShares(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  actorKey: string,
): Promise<void> {
  if (!file.organizationId) {
    throw new Error("Sharing applies to organization pipeline files only.");
  }
  await assertOrgMember(ctx, file.organizationId, actorKey);
  const owner = resolveRowOwnerUserId(file);
  if (!owner) {
    throw new Error("File owner is required before managing sharing.");
  }
  if (owner !== actorKey) {
    throw new Error("Only the file owner can manage sharing.");
  }
}

async function listResourceSharesForFile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
) {
  const rows = await ctx.db
    .query("resourceShares")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", "pipeline").eq("resourceId", String(file._id)),
    )
    .collect();
  return file.organizationId
    ? rows.filter((r) => r.organizationId === file.organizationId)
    : rows;
}

async function listPendingInvitesForFile(ctx: MutationCtx, fileId: Id<"pipeline">) {
  return ctx.db
    .query("pipelineSharePendingInvites")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .collect();
}

export const listForFile = query({
  args: {
    fileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file?.organizationId) {
      return {
        ownerUserId: "",
        ownerDisplayUsername: "",
        shares: [],
        pendingInvites: [],
      };
    }
    const key = (memberUserKey ?? "").trim();
    if (!key) {
      return {
        ownerUserId: "",
        ownerDisplayUsername: "",
        shares: [],
        pendingInvites: [],
      };
    }
    const level = await resolveOrgPipelineFileAccessLevel(ctx, file, key);
    if (level === "none") {
      return {
        ownerUserId: "",
        ownerDisplayUsername: "",
        shares: [],
        pendingInvites: [],
      };
    }

    const ownerUserId = resolveRowOwnerUserId(file);
    const ownerDisplayUsername = ownerUserId
      ? await resolveDisplayUsernameForUserKey(ctx, ownerUserId)
      : "";

    const resourceRows = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "pipeline").eq("resourceId", String(fileId)),
      )
      .collect();
    const scopedResourceRows = resourceRows.filter(
      (r) => r.organizationId === file.organizationId,
    );

    const shares = [];
    for (const rs of scopedResourceRows) {
      shares.push({
        shareId: rs._id,
        sharedUserId: rs.sharedUserId,
        sharedDisplayUsername: await resolveDisplayUsernameForUserKey(
          ctx,
          rs.sharedUserId,
        ),
        permission: rs.permission,
        createdAt: rs.createdAt,
        updatedAt: rs.updatedAt,
      });
    }

    const isOwner = ownerUserId === key;
    const pendingInvites = isOwner
      ? (await ctx.db
          .query("pipelineSharePendingInvites")
          .withIndex("by_file", (q) => q.eq("fileId", fileId))
          .collect()
        ).map((inv) => ({
          inviteId: inv._id,
          inviteEmail: inv.inviteEmail,
          permission: inv.permission,
          createdAt: inv.createdAt,
          updatedAt: inv.updatedAt,
        }))
      : [];

    return {
      ownerUserId,
      ownerDisplayUsername,
      shares,
      pendingInvites,
    };
  },
});

type ShareFileArgs = {
  fileId: Id<"pipeline">;
  targetUserKey?: string;
  targetLoginOrEmail?: string;
  permission: "view" | "edit";
  memberUserKey?: string;
};

export async function shareFileImpl(ctx: MutationCtx, args: ShareFileArgs) {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found.");
    await assertCanManageShares(ctx, file, actor);
    const orgId = file.organizationId!;

    const targetInput =
      args.targetLoginOrEmail?.trim() || args.targetUserKey?.trim() || "";
    if (!targetInput) throw new Error("Share target is required.");

    const owner = resolveRowOwnerUserId(file);
    if (!owner) throw new Error("File owner is required.");

    const emailKey = targetInput.includes("@")
      ? canonicalEmailKey(targetInput)
      : undefined;

    if (emailKey) {
      const authUser = await findAuthUserForShareResolution(ctx, emailKey);
      if (!authUser) {
        const now = Date.now();
        const existing = await ctx.db
          .query("pipelineSharePendingInvites")
          .withIndex("by_file_email", (q) =>
            q.eq("fileId", args.fileId).eq("inviteEmail", emailKey),
          )
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            permission: args.permission,
            updatedAt: now,
            createdByUserId: actor,
          });
          return { kind: "pending" as const, inviteId: existing._id };
        }
        const inviteId = await ctx.db.insert("pipelineSharePendingInvites", {
          fileId: args.fileId,
          organizationId: orgId,
          inviteEmail: emailKey,
          permission: args.permission,
          createdByUserId: actor,
          createdAt: now,
          updatedAt: now,
        });
        const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
        await appendPipelineFileActivity(ctx, {
          fileId: args.fileId,
          at: now,
          kind: "share_grant",
          actorUserKey: actor,
          summary: clampActivitySummary(
            `${actorName} invited ${emailKey} (${args.permission} access)`,
          ),
        });
        return { kind: "pending" as const, inviteId };
      }
    }

    const target = await resolveShareTargetUserKey(ctx, orgId, targetInput);
    if (actor === target) {
      throw new Error("You cannot share a file with yourself.");
    }
    if (owner === target) {
      throw new Error("The owner already has full access.");
    }

    const now = Date.now();
    const priorShare = (
      await listResourceSharesForFile(ctx, file)
    ).find((r) => r.sharedUserId === target);
    const shareId = await upsertResourceShare(ctx, {
      organizationId: orgId,
      resourceType: "pipeline",
      resourceId: String(args.fileId),
      sharedUserId: target,
      permission: args.permission,
      createdByUserId: actor,
    });

    const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
    const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
    const fileLabel = file.fileName?.trim() || "a pipeline file";

    if (emailKey) {
      const pending = await ctx.db
        .query("pipelineSharePendingInvites")
        .withIndex("by_file_email", (q) =>
          q.eq("fileId", args.fileId).eq("inviteEmail", emailKey),
        )
        .first();
      if (pending) await ctx.db.delete(pending._id);
    }

    const activityKind = priorShare ? "share_update" : "share_grant";
    await appendPipelineFileActivity(ctx, {
      fileId: args.fileId,
      at: now,
      kind: activityKind,
      shareTargetUserKey: target,
      shareAccess: args.permission,
      actorUserKey: actor,
      summary: clampActivitySummary(
        formatShareActivitySummary(
          actorName,
          targetName,
          args.permission,
          priorShare ? "update" : "grant",
        ),
      ),
    });

    if (!priorShare) {
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "pipeline",
        resourceId: String(args.fileId),
        fileId: args.fileId,
        event: "shared",
        resourceLabel: fileLabel,
      });
    } else if (priorShare.permission !== args.permission) {
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "pipeline",
        resourceId: String(args.fileId),
        fileId: args.fileId,
        event:
          args.permission === "edit" ? "upgraded_edit" : "downgraded_view",
        resourceLabel: fileLabel,
      });
    }

    const refreshed = (await ctx.db.get(args.fileId))!;
    await resyncFileTeamEdgesFromPipeline(ctx, refreshed, actor);

    return { kind: "active" as const, shareId, sharedUserId: target };
}

export const shareFile = mutation({
  args: {
    fileId: v.id("pipeline"),
    targetUserKey: v.optional(v.string()),
    targetLoginOrEmail: v.optional(v.string()),
    permission: sharePermissionV,
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => shareFileImpl(ctx, args),
});

export const updateSharePermission = mutation({
  args: {
    fileId: v.id("pipeline"),
    sharedUserId: v.string(),
    permission: sharePermissionV,
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found.");
    await assertCanManageShares(ctx, file, actor);
    if (!file.organizationId) {
      throw new Error("Sharing applies to organization files only.");
    }

    const target = args.sharedUserId.trim();
    if (!target) throw new Error("Share target is required.");

    const existing = (
      await listResourceSharesForFile(ctx, file)
    ).find((r) => r.sharedUserId === target);
    if (!existing) {
      throw new Error("No active share for that user.");
    }

    const priorPermission = existing.permission;
    const now = Date.now();
    await upsertResourceShare(ctx, {
      organizationId: file.organizationId,
      resourceType: "pipeline",
      resourceId: String(args.fileId),
      sharedUserId: target,
      permission: args.permission,
      createdByUserId: actor,
    });
    const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
    const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
    const fileLabel = file.fileName?.trim() || "a pipeline file";
    await appendPipelineFileActivity(ctx, {
      fileId: args.fileId,
      at: now,
      kind: "share_update",
      shareTargetUserKey: target,
      shareAccess: args.permission,
      actorUserKey: actor,
      summary: clampActivitySummary(
        formatShareActivitySummary(
          actorName,
          targetName,
          args.permission,
          "update",
        ),
      ),
    });
    if (priorPermission !== args.permission) {
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "pipeline",
        resourceId: String(args.fileId),
        fileId: args.fileId,
        event:
          args.permission === "edit" ? "upgraded_edit" : "downgraded_view",
        resourceLabel: fileLabel,
      });
    }
    return { shareId: existing._id, permission: args.permission };
  },
});

type RevokeShareArgs = {
  fileId: Id<"pipeline">;
  sharedUserId?: string;
  targetLoginOrEmail?: string;
  inviteId?: Id<"pipelineSharePendingInvites">;
  memberUserKey?: string;
};

async function revokeShareImpl(ctx: MutationCtx, args: RevokeShareArgs) {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");

    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found.");
    await assertCanManageShares(ctx, file, actor);

    if (args.inviteId) {
      const inv = await ctx.db.get(args.inviteId);
      if (inv && inv.fileId === args.fileId) {
        await ctx.db.delete(inv._id);
        return { removed: true as const, kind: "pending" as const };
      }
    }

    if (!file.organizationId) {
      throw new Error("Sharing applies to organization files only.");
    }

    const targetInput =
      args.targetLoginOrEmail?.trim() || args.sharedUserId?.trim() || "";
    if (!targetInput) throw new Error("Revoke target is required.");

    const emailKey = targetInput.includes("@")
      ? canonicalEmailKey(targetInput)
      : undefined;
    if (emailKey) {
      const pending = await ctx.db
        .query("pipelineSharePendingInvites")
        .withIndex("by_file_email", (q) =>
          q.eq("fileId", args.fileId).eq("inviteEmail", emailKey),
        )
        .first();
      if (pending) {
        await ctx.db.delete(pending._id);
        return { removed: true as const, kind: "pending" as const };
      }
    }

    const target = await resolveShareTargetUserKey(
      ctx,
      file.organizationId,
      targetInput,
    );
    const removed = await removeResourceShare(ctx, {
      resourceType: "pipeline",
      resourceId: String(args.fileId),
      sharedUserId: target,
    });
    if (removed) {
      const now = Date.now();
      const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
      const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
      const fileLabel = file.fileName?.trim() || "a pipeline file";
      await appendPipelineFileActivity(ctx, {
        fileId: args.fileId,
        at: now,
        kind: "share_revoke",
        shareTargetUserKey: target,
        actorUserKey: actor,
        summary: clampActivitySummary(
          formatShareActivitySummary(actorName, targetName, "view", "revoke"),
        ),
      });
      await notifyResourceShareEvent(ctx, {
        recipientUserKey: target,
        actorUserKey: actor,
        resourceType: "pipeline",
        resourceId: String(args.fileId),
        fileId: args.fileId,
        event: "revoked",
        resourceLabel: fileLabel,
      });
      const refreshed = (await ctx.db.get(args.fileId))!;
      await resyncFileTeamEdgesFromPipeline(ctx, refreshed, actor);
    }
    return { removed, kind: "active" as const };
}

export const revokeShare = mutation({
  args: {
    fileId: v.id("pipeline"),
    sharedUserId: v.optional(v.string()),
    targetLoginOrEmail: v.optional(v.string()),
    inviteId: v.optional(v.id("pipelineSharePendingInvites")),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => revokeShareImpl(ctx, args),
});

/** Legacy name — forwards to `shareFile` (resourceShares only). */
export const upsertShare = mutation({
  args: {
    fileId: v.id("pipeline"),
    targetUserKey: v.string(),
    targetLoginOrEmail: v.optional(v.string()),
    access: v.union(v.literal("view"), v.literal("edit")),
    memberUserKey: v.optional(v.string()),
    permissionLevel: v.optional(v.union(
      v.literal("view"),
      v.literal("comment"),
      v.literal("edit"),
      v.literal("manage"),
    )),
    shareKind: v.optional(v.string()),
    expiresAtMs: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const permission: "view" | "edit" =
      args.permissionLevel === "view" || args.permissionLevel === "comment"
        ? "view"
        : args.access;
    return shareFileImpl(ctx, {
      fileId: args.fileId,
      targetUserKey: args.targetUserKey,
      targetLoginOrEmail: args.targetLoginOrEmail,
      permission,
      memberUserKey: args.memberUserKey,
    });
  },
});

/** Legacy name — forwards to `revokeShare`. */
export const removeShare = mutation({
  args: {
    fileId: v.id("pipeline"),
    targetUserKey: v.string(),
    targetLoginOrEmail: v.optional(v.string()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return revokeShareImpl(ctx, {
      fileId: args.fileId,
      sharedUserId: args.targetUserKey,
      targetLoginOrEmail: args.targetLoginOrEmail,
      memberUserKey: args.memberUserKey,
    });
  },
});
