/**
 * Phase 16.3 — event sharing via canonical resourceShares + eventCollaborators.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventCollaboratorRoleV } from "./eventValidators";
import {
  assertCanManageEventCollaborators,
  assertCanReadEvent,
} from "./eventPermissions";
import { appendEventShellActivity } from "./eventHelpers";
import {
  removeEventDomainShare,
  upsertEventDomainShare,
  type EventCollaboratorRole,
} from "./eventAccess";
import { resolveShareTargetUserKey } from "../shareTargetResolve";
import { resolveDisplayUsernameForUserKey } from "../auth/displayIdentity";
import {
  canonicalEmailKey,
  findAuthUserForShareResolution,
} from "../auth/canonicalIdentity";
import { resolveRowOwnerUserId } from "../resourceAccess";

export const listForEvent = query({
  args: {
    eventId: v.id("events"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, memberUserKey }) => {
    const event = await ctx.db.get(eventId);
    if (!event) {
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
    try {
      await assertCanReadEvent(ctx, event, key);
    } catch {
      return {
        ownerUserId: "",
        ownerDisplayUsername: "",
        shares: [],
        pendingInvites: [],
      };
    }

    const ownerUserId = resolveRowOwnerUserId(event);
    const ownerDisplayUsername = ownerUserId
      ? await resolveDisplayUsernameForUserKey(ctx, ownerUserId)
      : "";

    const resourceRows = await ctx.db
      .query("resourceShares")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "event").eq("resourceId", String(eventId)),
      )
      .collect();

    const shares = [];
    for (const r of resourceRows.filter(
      (row) => row.organizationId === event.organizationId,
    )) {
      shares.push({
        _id: r._id,
        sharedUserId: r.sharedUserId,
        sharedDisplayUsername: await resolveDisplayUsernameForUserKey(
          ctx,
          r.sharedUserId,
        ),
        collaboratorRole: (r.collaboratorRole ?? "editor") as EventCollaboratorRole,
        permission: r.permission,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      });
    }

    const pres = await assertCanReadEvent(ctx, event, key);
    const pendingInvites = pres.canManageCollaborators
      ? (
          await ctx.db
            .query("eventSharePendingInvites")
            .withIndex("by_event", (q) => q.eq("eventId", eventId))
            .collect()
        ).map((p) => ({
          _id: p._id,
          inviteEmail: p.inviteEmail,
          collaboratorRole: p.collaboratorRole,
          createdAt: p.createdAt,
        }))
      : [];

    return { ownerUserId, ownerDisplayUsername, shares, pendingInvites };
  },
});

export const upsertShare = mutation({
  args: {
    eventId: v.id("events"),
    targetLoginOrUserKey: v.string(),
    collaboratorRole: eventCollaboratorRoleV,
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanManageEventCollaborators(ctx, event, actor);

    const targetInput = args.targetLoginOrUserKey.trim();
    if (!targetInput) throw new Error("Share target is required.");
    const owner = resolveRowOwnerUserId(event);
    const emailKey = targetInput.includes("@")
      ? canonicalEmailKey(targetInput)
      : undefined;

    if (emailKey) {
      const authUser = await findAuthUserForShareResolution(ctx, emailKey);
      if (!authUser) {
        const now = Date.now();
        const existing = await ctx.db
          .query("eventSharePendingInvites")
          .withIndex("by_event_email", (q) =>
            q.eq("eventId", args.eventId).eq("inviteEmail", emailKey),
          )
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            collaboratorRole: args.collaboratorRole,
            updatedAt: now,
            createdByUserId: actor,
          });
          return { kind: "pending" as const, inviteId: existing._id };
        }
        const inviteId = await ctx.db.insert("eventSharePendingInvites", {
          eventId: args.eventId,
          organizationId: event.organizationId,
          inviteEmail: emailKey,
          collaboratorRole: args.collaboratorRole,
          createdByUserId: actor,
          createdAt: now,
          updatedAt: now,
        });
        const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
        await appendEventShellActivity(ctx, {
          eventId: args.eventId,
          organizationId: event.organizationId,
          kind: "share_pending",
          summary: `${actorName} invited ${emailKey} (${args.collaboratorRole})`,
          actorUserKey: actor,
        });
        return { kind: "pending" as const, inviteId };
      }
    }

    const target = await resolveShareTargetUserKey(
      ctx,
      event.organizationId,
      targetInput,
    );
    if (target === actor) throw new Error("You cannot share an event with yourself.");
    if (owner === target) throw new Error("The owner already has full access.");

    if (emailKey) {
      const pending = await ctx.db
        .query("eventSharePendingInvites")
        .withIndex("by_event_email", (q) =>
          q.eq("eventId", args.eventId).eq("inviteEmail", emailKey),
        )
        .first();
      if (pending) await ctx.db.delete(pending._id);
    }

    const shareId = await upsertEventDomainShare(ctx, {
      organizationId: event.organizationId,
      resourceType: "event",
      resourceId: String(args.eventId),
      sharedUserId: target,
      collaboratorRole: args.collaboratorRole,
      createdByUserId: actor,
      eventId: args.eventId,
    });

    const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
    const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
    await appendEventShellActivity(ctx, {
      eventId: args.eventId,
      organizationId: event.organizationId,
      kind: "share_grant",
      summary: `${actorName} shared with ${targetName} as ${args.collaboratorRole}`,
      actorUserKey: actor,
    });

    return { kind: "share" as const, shareId, sharedUserId: target };
  },
});

export const removeShare = mutation({
  args: {
    eventId: v.id("events"),
    targetLoginOrUserKey: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanManageEventCollaborators(ctx, event, actor);

    const target = await resolveShareTargetUserKey(
      ctx,
      event.organizationId,
      args.targetLoginOrUserKey,
    );
    const removed = await removeEventDomainShare(ctx, {
      resourceType: "event",
      resourceId: String(args.eventId),
      sharedUserId: target,
      eventId: args.eventId,
    });
    if (removed) {
      const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
      const targetName = await resolveDisplayUsernameForUserKey(ctx, target);
      await appendEventShellActivity(ctx, {
        eventId: args.eventId,
        organizationId: event.organizationId,
        kind: "share_revoke",
        summary: `${actorName} revoked access for ${targetName}`,
        actorUserKey: actor,
      });
    }
    return { removed };
  },
});

export const removePendingInvite = mutation({
  args: {
    inviteId: v.id("eventSharePendingInvites"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found.");
    const event = await ctx.db.get(invite.eventId);
    if (!event) throw new Error("Event not found.");
    await assertCanManageEventCollaborators(ctx, event, actor);
    await ctx.db.delete(invite._id);
    return { removed: true };
  },
});

export const transferOwnership = mutation({
  args: {
    eventId: v.id("events"),
    newOwnerLoginOrUserKey: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = (args.memberUserKey ?? "").trim();
    if (!actor) throw new Error("Actor is required.");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found.");
    const priorOwner = resolveRowOwnerUserId(event);
    if (priorOwner !== actor) {
      throw new Error("Only the event owner can transfer ownership.");
    }

    const newOwner = await resolveShareTargetUserKey(
      ctx,
      event.organizationId,
      args.newOwnerLoginOrUserKey,
    );
    if (newOwner === priorOwner) {
      throw new Error("Choose a different owner.");
    }

    const now = Date.now();
    await ctx.db.patch(args.eventId, {
      ownerUserId: newOwner,
      ownerUserKey: newOwner,
      updatedAt: now,
    });

    await removeEventDomainShare(ctx, {
      resourceType: "event",
      resourceId: String(args.eventId),
      sharedUserId: newOwner,
      eventId: args.eventId,
    });

    if (priorOwner) {
      await upsertEventDomainShare(ctx, {
        organizationId: event.organizationId,
        resourceType: "event",
        resourceId: String(args.eventId),
        sharedUserId: priorOwner,
        collaboratorRole: "editor",
        createdByUserId: actor,
        eventId: args.eventId,
      });
    }

    const actorName = await resolveDisplayUsernameForUserKey(ctx, actor);
    const newName = await resolveDisplayUsernameForUserKey(ctx, newOwner);
    await appendEventShellActivity(ctx, {
      eventId: args.eventId,
      organizationId: event.organizationId,
      kind: "ownership_transfer",
      summary: `${actorName} transferred ownership to ${newName}`,
      actorUserKey: actor,
    });

    return { newOwnerUserId: newOwner };
  },
});
