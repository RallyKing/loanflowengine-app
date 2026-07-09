/**
 * Phase 12 — team administration, session operators, and login gate helpers.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { normalizeAuthEmail } from "../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../lib/auth/normalizeUsername";
import { assertCanonicalAuthAvailable, findAuthUserByCanonicalLogin } from "./auth/canonicalIdentity";
import { validateStoredArgon2PasswordHash } from "../lib/auth/passwordPolicy";
import {
  assertAnyOrgPermission,
  assertOrgPermission,
  seedSystemRolesForOrganization,
} from "./organizationRbac";
import { assertOrgHasAvailableMemberSeat } from "./orgPlanLimits";
import { pickCanonicalOrgMember } from "./orgMembership";
import { resolveMemberUserKey } from "./organizationAccess";
import { bumpCredentialForUserKey, revokeAllSessionsForUserId } from "./auth/sessionInvalidate";
import { tryGetAuthUserByPermissionKey } from "./auth/globalAdmin";
import { canonicalDisplayUsernameFromAuthUser } from "./auth/displayIdentity";
import { reinviteExistingUserToOrg } from "./orgMemberReinvite";

async function assertTeamAdmin(
  ctx: Parameters<typeof assertOrgPermission>[0],
  organizationId: Id<"organizations">,
  actorUserKey: string,
): Promise<void> {
  await assertAnyOrgPermission(ctx, organizationId, actorUserKey, [
    "org.members.invite",
    "org.roles.manage",
  ]);
}

export const listTeamDirectory = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    const actor = await resolveMemberUserKey(ctx, memberUserKey);
    await assertTeamAdmin(ctx, organizationId, actor);

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();

    const out: Array<{
      userKey: string;
      tenantRole: "owner" | "admin" | "member";
      productRoleLabel?: string;
      assignedRoleId?: Id<"organizationRoles">;
      isActive: boolean;
      displayUsername?: string;
      canonicalDisplayUsername?: string;
    }> = [];

    for (const m of members) {
      const auth = await tryGetAuthUserByPermissionKey(ctx, m.userKey);
      let productRoleLabel: string | undefined;
      if (m.assignedRoleId) {
        const rd = await ctx.db.get(m.assignedRoleId);
        productRoleLabel = rd?.label;
      }
      out.push({
        userKey: m.userKey,
        tenantRole: m.role,
        productRoleLabel,
        assignedRoleId: m.assignedRoleId,
        isActive: m.isActive !== false,
        displayUsername: auth?.displayUsername,
        canonicalDisplayUsername: auth
          ? canonicalDisplayUsernameFromAuthUser(auth)
          : undefined,
      });
    }
    return out;
  },
});

export const listLoginAuditForUser = query({
  args: {
    organizationId: v.id("organizations"),
    targetUserKey: v.string(),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveMemberUserKey(ctx, args.memberUserKey);
    await assertTeamAdmin(ctx, args.organizationId, actor);
    const user = await tryGetAuthUserByPermissionKey(
      ctx,
      args.targetUserKey.trim(),
    );
    if (!user) return [];
    const lim = Math.min(Math.max(args.limit ?? 40, 1), 200);
    const rows = await ctx.db
      .query("authLoginAudit")
      .withIndex("by_audit_user", (q) => q.eq("userId", user._id))
      .collect();
    return [...rows].sort((a, b) => b.at - a.at).slice(0, lim);
  },
});

export const listSessionsForUser = query({
  args: {
    organizationId: v.id("organizations"),
    targetUserKey: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveMemberUserKey(ctx, args.memberUserKey);
    await assertTeamAdmin(ctx, args.organizationId, actor);
    const user = await tryGetAuthUserByPermissionKey(
      ctx,
      args.targetUserKey.trim(),
    );
    if (!user) return [];
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const now = Date.now();
    return sessions
      .filter((s) => !s.revokedAtMs && s.idleExpiresAtMs > now)
      .map((s) => ({
        publicId: s.publicId,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        rememberMe: s.rememberMe,
        userAgent: s.userAgent,
        ipHint: s.ipHint,
      }));
  },
});

export const createOrgMemberUser = mutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserKey: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    assignedRoleId: v.id("organizationRoles"),
    displayUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = args.actorUserKey.trim();
    if (!actor) throw new Error("Actor is required.");
    await assertOrgPermission(
      ctx,
      args.organizationId,
      actor,
      "org.members.invite",
    );

    const hashErr = validateStoredArgon2PasswordHash(args.passwordHash);
    if (hashErr) throw new Error(hashErr);

    const usernameLower = normalizeUsername(args.username);
    if (!usernameLower.length || usernameLower.length > 64) {
      throw new Error("Invalid username.");
    }

    const existingUser = await findAuthUserByCanonicalLogin(ctx, args.username);
    if (existingUser) {
      await reinviteExistingUserToOrg(ctx, {
        organizationId: args.organizationId,
        userId: existingUser._id,
        assignedRoleId: args.assignedRoleId,
        passwordHash: args.passwordHash,
      });
      return {
        userId: existingUser._id,
        userKey: String(existingUser._id),
        reinvited: true as const,
      };
    }

    await assertCanonicalAuthAvailable(ctx, {
      loginIdentifier: args.username,
    });

    const roleDoc = await ctx.db.get(args.assignedRoleId);
    if (!roleDoc || roleDoc.organizationId !== args.organizationId) {
      throw new Error("Invalid role for this organization.");
    }

    await seedSystemRolesForOrganization(ctx, args.organizationId);
    await assertOrgHasAvailableMemberSeat(ctx, args.organizationId);

    const now = Date.now();
    const label =
      args.displayUsername?.trim() || args.username.trim() || usernameLower;
    const emailNorm = normalizeAuthEmail(args.username);
    const userId = await ctx.db.insert("authUsers", {
      normalizedUsername: emailNorm ?? usernameLower,
      usernameNormalized: emailNorm ?? usernameLower,
      displayUsername: label,
      passwordHash: args.passwordHash,
      email: emailNorm,
      credentialVersion: 1,
      defaultOrganizationId: args.organizationId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationMembers", {
      organizationId: args.organizationId,
      userKey: userId as unknown as string,
      role: "member",
      assignedRoleId: args.assignedRoleId,
      isActive: true,
      createdAt: now,
    });
    await ctx.db.patch(args.organizationId, { updatedAt: now });
    return { userId, userKey: userId as unknown as string };
  },
});

export const setMemberActive = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserKey: v.string(),
    isActive: v.boolean(),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = args.actorUserKey.trim();
    const target = args.targetUserKey.trim();
    await assertOrgPermission(
      ctx,
      args.organizationId,
      actor,
      "org.members.invite",
    );

    const rows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", target),
      )
      .collect();
    const m = pickCanonicalOrgMember(rows);
    if (!m) throw new Error("Member not found.");
    if (m.role === "owner") {
      throw new Error("Owner activation cannot be changed here.");
    }

    await ctx.db.patch(m._id, {
      isActive: args.isActive,
    });
    await ctx.db.patch(args.organizationId, { updatedAt: Date.now() });

    if (!args.isActive) {
      const user = await tryGetAuthUserByPermissionKey(ctx, target);
      if (user) {
        await bumpCredentialForUserKey(ctx, target);
        await revokeAllSessionsForUserId(ctx, user._id, "member_deactivated");
      }
    }
    return { ok: true as const };
  },
});

export const adminSetMemberPassword = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserKey: v.string(),
    passwordHash: v.string(),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = args.actorUserKey.trim();
    const target = args.targetUserKey.trim();
    await assertOrgPermission(
      ctx,
      args.organizationId,
      actor,
      "org.members.invite",
    );

    const hashErr = validateStoredArgon2PasswordHash(args.passwordHash);
    if (hashErr) throw new Error(hashErr);

    const rows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userKey", target),
      )
      .collect();
    const m = pickCanonicalOrgMember(rows);
    if (!m) throw new Error("Member not found.");

    const user = await tryGetAuthUserByPermissionKey(ctx, target);
    if (!user) throw new Error("User record not found.");
    const now = Date.now();
    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
      updatedAt: now,
    });
    await bumpCredentialForUserKey(ctx, target);
    await revokeAllSessionsForUserId(ctx, user._id, "admin_password_reset");
    return { ok: true as const };
  },
});

export const forceLogoutMemberSessions = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserKey: v.string(),
    actorUserKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = args.actorUserKey.trim();
    await assertOrgPermission(
      ctx,
      args.organizationId,
      actor,
      "org.members.invite",
    );
    const user = await tryGetAuthUserByPermissionKey(
      ctx,
      args.targetUserKey.trim(),
    );
    if (!user) throw new Error("User not found.");
    await revokeAllSessionsForUserId(ctx, user._id, "admin_force_logout");
    return { ok: true as const };
  },
});
