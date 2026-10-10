/**
 * Platform-wide signup / account administration.
 * Gated exclusively to the primary platform admin identity
 * (`authUserIsPrimaryPlatformAdmin` — joshua@DirectLendingConnection.com aliases).
 */
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireAuthenticatedCaller } from "../callerAuth";
import { dispatchUserNotification } from "../notifications";
import { pickCanonicalOrgMember } from "../orgMembership";
import { findPrimaryPlatformAuthUser } from "./findPrimaryPlatformUser";
import { tryGetAuthUserByPermissionKey } from "./globalAdmin";
import { authUserIsPrimaryPlatformAdmin } from "./primaryPlatformAdmin";
import {
  effectiveSignupAccessStatus,
  type SignupAccessStatus,
} from "./signupAccess";
import {
  bumpCredentialForUserKey,
  revokeAllSessionsForUserId,
} from "./sessionInvalidate";
import {
  recordPlatformAccountAudit,
  type PlatformAccountEventType,
} from "./platformAccountAudit";

const accessStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("disabled"),
);

async function requirePrimaryPlatformAdminCaller(
  ctx: QueryCtx | MutationCtx,
  memberUserKey: string | undefined,
): Promise<Doc<"authUsers">> {
  const key = await requireAuthenticatedCaller(ctx, memberUserKey);
  const user = await tryGetAuthUserByPermissionKey(ctx, key);
  if (!user || !authUserIsPrimaryPlatformAdmin(user)) {
    throw new Error("Unauthorized");
  }
  return user;
}

function toAdminUserDto(
  user: Doc<"authUsers">,
  orgName: string | null,
  membershipActive: boolean | null,
) {
  return {
    userId: user._id,
    userKey: user._id as string,
    displayUsername: user.displayUsername,
    normalizedUsername: user.normalizedUsername,
    email: user.email ?? null,
    accessStatus: effectiveSignupAccessStatus(user),
    defaultOrganizationId: user.defaultOrganizationId ?? null,
    organizationName: orgName,
    membershipActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    accessStatusUpdatedAt: user.accessStatusUpdatedAt ?? null,
    isPrimaryPlatformAdmin: authUserIsPrimaryPlatformAdmin(user),
  };
}

async function loadOrgName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations"> | undefined,
): Promise<string | null> {
  if (!organizationId) return null;
  const org = await ctx.db.get(organizationId);
  return org?.name ?? null;
}

async function setDefaultMembershipActive(
  ctx: MutationCtx,
  user: Doc<"authUsers">,
  isActive: boolean,
): Promise<void> {
  const orgId = user.defaultOrganizationId;
  if (!orgId) return;
  const rows = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", orgId).eq("userKey", user._id as string),
    )
    // bounded: single org+userKey membership keys (dedupe only)
    .collect();
  const mem = pickCanonicalOrgMember(rows);
  if (!mem) return;
  if (mem.isActive === isActive) return;
  await ctx.db.patch(mem._id, { isActive });
  await ctx.db.patch(orgId, { updatedAt: Date.now() });
}

/** Whether the signed-in caller may open platform user admin UI. */
export const callerCanManagePlatformUsers = query({
  args: { memberUserKey: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    try {
      await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  },
});

/**
 * Platform-wide account directory (pending + approved + rejected + disabled).
 * Slim DTO — never returns password hashes.
 */
export const listPlatformUsers = query({
  args: {
    memberUserKey: v.optional(v.string()),
    accessStatus: v.optional(accessStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);

    // Indexed filter for statuses that are always written on new rows.
    // "approved" + unset legacy rows: paginate full table and filter effective status.
    const useIndex =
      args.accessStatus === "pending" ||
      args.accessStatus === "rejected" ||
      args.accessStatus === "disabled";

    const page = useIndex
      ? await ctx.db
          .query("authUsers")
          .withIndex("by_accessStatus_createdAt", (q) =>
            q.eq("accessStatus", args.accessStatus!),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("authUsers")
          .order("desc")
          .paginate(args.paginationOpts);

    const users = [];
    for (const user of page.page) {
      if (
        args.accessStatus === "approved" &&
        effectiveSignupAccessStatus(user) !== "approved"
      ) {
        continue;
      }
      const orgName = await loadOrgName(ctx, user.defaultOrganizationId);
      let membershipActive: boolean | null = null;
      if (user.defaultOrganizationId) {
        const rows = await ctx.db
          .query("organizationMembers")
          .withIndex("by_org_user", (q) =>
            q
              .eq("organizationId", user.defaultOrganizationId!)
              .eq("userKey", user._id as string),
          )
          // bounded: single org+userKey membership keys (dedupe only)
          .collect();
        const mem = pickCanonicalOrgMember(rows);
        membershipActive = mem ? mem.isActive !== false : null;
      }
      users.push(toAdminUserDto(user, orgName, membershipActive));
    }

    return {
      ...page,
      page: users,
    };
  },
});

/** Pending signup count for in-app banner / Settings badge (reactive, bounded). */
export const countPendingSignups = query({
  args: { memberUserKey: v.optional(v.string()) },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);
    // bounded: admin inbox; take hard cap so a flood cannot unbounded-collect
    const pending = await ctx.db
      .query("authUsers")
      .withIndex("by_accessStatus_createdAt", (q) =>
        q.eq("accessStatus", "pending"),
      )
      .take(500);
    return { count: pending.length };
  },
});

async function applyAccessStatus(
  ctx: MutationCtx,
  args: {
    actor: Doc<"authUsers">;
    targetUserId: Id<"authUsers">;
    next: SignupAccessStatus;
    activateMembership: boolean;
    revokeSessions: boolean;
    revokeReason: string;
  },
): Promise<{ ok: true; accessStatus: SignupAccessStatus }> {
  const target = await ctx.db.get(args.targetUserId);
  if (!target) throw new Error("User not found.");
  if (authUserIsPrimaryPlatformAdmin(target)) {
    throw new Error("Cannot change access for the primary platform administrator.");
  }

  const now = Date.now();
  await ctx.db.patch(target._id, {
    accessStatus: args.next,
    accessStatusUpdatedAt: now,
    accessStatusUpdatedByUserId: args.actor._id,
    updatedAt: now,
  });

  const refreshed = (await ctx.db.get(target._id))!;
  await setDefaultMembershipActive(ctx, refreshed, args.activateMembership);

  if (args.revokeSessions) {
    await bumpCredentialForUserKey(ctx, target._id as string);
    await revokeAllSessionsForUserId(ctx, target._id, args.revokeReason);
  }

  let eventType: PlatformAccountEventType;
  let summary: string;
  if (args.revokeReason === "account_reenabled") {
    eventType = "account_reenabled";
    summary = "Account re-enabled";
  } else if (args.next === "approved") {
    eventType = "signup_approved";
    summary = "Signup approved";
  } else if (args.next === "rejected") {
    eventType = "signup_rejected";
    summary = "Signup rejected";
  } else if (args.next === "disabled") {
    eventType = "account_disabled";
    summary = "Account disabled";
  } else {
    eventType = "signup";
    summary = "Access status updated";
  }
  await recordPlatformAccountAudit(ctx, {
    subjectUserId: target._id,
    actorUserId: args.actor._id,
    eventType,
    summary,
  });

  return { ok: true as const, accessStatus: args.next };
}

export const approveSignup = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    targetUserId: v.id("authUsers"),
  },
  returns: v.object({
    ok: v.literal(true),
    accessStatus: accessStatusValidator,
  }),
  handler: async (ctx, args) => {
    const actor = await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);
    return await applyAccessStatus(ctx, {
      actor,
      targetUserId: args.targetUserId,
      next: "approved",
      activateMembership: true,
      revokeSessions: false,
      revokeReason: "signup_approved",
    });
  },
});

export const rejectSignup = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    targetUserId: v.id("authUsers"),
  },
  returns: v.object({
    ok: v.literal(true),
    accessStatus: accessStatusValidator,
  }),
  handler: async (ctx, args) => {
    const actor = await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);
    return await applyAccessStatus(ctx, {
      actor,
      targetUserId: args.targetUserId,
      next: "rejected",
      activateMembership: false,
      revokeSessions: true,
      revokeReason: "signup_rejected",
    });
  },
});

export const disableAccount = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    targetUserId: v.id("authUsers"),
  },
  returns: v.object({
    ok: v.literal(true),
    accessStatus: accessStatusValidator,
  }),
  handler: async (ctx, args) => {
    const actor = await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);
    return await applyAccessStatus(ctx, {
      actor,
      targetUserId: args.targetUserId,
      next: "disabled",
      activateMembership: false,
      revokeSessions: true,
      revokeReason: "account_disabled",
    });
  },
});

/** Re-enable a previously disabled or rejected account (sets approved + active). */
export const reenableAccount = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    targetUserId: v.id("authUsers"),
  },
  returns: v.object({
    ok: v.literal(true),
    accessStatus: accessStatusValidator,
  }),
  handler: async (ctx, args) => {
    const actor = await requirePrimaryPlatformAdminCaller(ctx, args.memberUserKey);
    return await applyAccessStatus(ctx, {
      actor,
      targetUserId: args.targetUserId,
      next: "approved",
      activateMembership: true,
      revokeSessions: false,
      revokeReason: "account_reenabled",
    });
  },
});

/** Notify primary platform admin of a new pending signup (resource-safe, no polling). */
export async function notifyPrimaryAdminOfPendingSignup(
  ctx: MutationCtx,
  args: {
    newUserId: Id<"authUsers">;
    displayUsername: string;
    organizationName: string;
    email?: string;
  },
): Promise<void> {
  const admin = await findPrimaryPlatformAuthUser(ctx);
  if (!admin) return;
  const detailParts = [
    `Username: ${args.displayUsername}`,
    `Workspace: ${args.organizationName}`,
  ];
  if (args.email) detailParts.push(`Email: ${args.email}`);
  await dispatchUserNotification(ctx, {
    userKey: admin._id as string,
    category: "status_change",
    summary: "New signup awaiting review",
    detail: detailParts.join(" · "),
    dedupeKey: `signup-pending:${args.newUserId}`,
  });
}
