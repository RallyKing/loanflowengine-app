/**
 * Phase 12.2 Step 8A — forensic audit + safe repair for joshuaeballard@gmail.com re-invite.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  collectAuthUsersByCanonicalLogin,
  canonicalLoginKey,
  findAuthUserByCanonicalLogin,
} from "../auth/canonicalIdentity";
import { pickCanonicalOrgMember, pickCanonicalOrgRole } from "../orgMembership";
import { seedSystemRolesForOrganization } from "../organizationRbac";
import { SYSTEM_ORG_ROLE_KEYS } from "../../lib/orgRbac";
import { assertOrgPermission } from "../organizationRbac";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";
import { reinviteExistingUserToOrg } from "../orgMemberReinvite";

const JOSHUA_ORG_ID = "mx76bxqnc23q76cb99tvrffmy58644pf" as Id<"organizations">;
const EBALLARD_LOGIN = "joshuaeballard@gmail.com";

async function buildEballardForensic(ctx: QueryCtx | MutationCtx) {
  const canonicalLogin = canonicalLoginKey(EBALLARD_LOGIN);
  const matches = await collectAuthUsersByCanonicalLogin(ctx, EBALLARD_LOGIN);
  const user = matches.length === 1 ? matches[0]! : null;

  const allMembers = await ctx.db.query("organizationMembers").collect();
  const joshuaOrgMembers = allMembers.filter(
    (m) => String(m.organizationId) === String(JOSHUA_ORG_ID),
  );

  const eballardMembershipsById = user
    ? joshuaOrgMembers.filter((m) => m.userKey === String(user._id))
    : [];
  const eballardMembershipsByEmail = joshuaOrgMembers.filter(
    (m) => canonicalLoginKey(m.userKey) === canonicalLogin,
  );
  const staleAliasMemberships = joshuaOrgMembers.filter(
    (m) =>
      m.userKey !== String(user?._id ?? "") &&
      (m.userKey.includes("joshuaeballard") ||
        m.userKey.includes("@gmail.com")),
  );

  let sessions: Doc<"authSessions">[] = [];
  if (user) {
    sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  }

  const roles = await ctx.db
    .query("organizationRoles")
    .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
    .collect();

  let assignedRoleValid = false;
  let assignedRoleLabel: string | null = null;
  const canonMem = pickCanonicalOrgMember(eballardMembershipsById);
  if (canonMem?.assignedRoleId) {
    const rd = await ctx.db.get(canonMem.assignedRoleId);
    assignedRoleValid = Boolean(rd && rd.organizationId === JOSHUA_ORG_ID);
    assignedRoleLabel = rd?.label ?? null;
  }

  const duplicateAuthUsers = matches.length > 1;

  return {
    canonicalLogin,
    authUserCount: matches.length,
    duplicateAuthUsers,
    authUsers: matches.map((u) => ({
      userId: u._id,
      normalizedUsername: u.normalizedUsername,
      usernameNormalized: u.usernameNormalized ?? null,
      email: u.email ?? null,
      displayUsername: u.displayUsername,
      defaultOrganizationId: u.defaultOrganizationId ?? null,
      credentialVersion: u.credentialVersion,
      identityCanonical:
        u.normalizedUsername === canonicalLogin &&
        (u.usernameNormalized == null ||
          u.usernameNormalized === canonicalLogin),
    })),
    membershipsOnJoshuaOrgByUserId: eballardMembershipsById.map((m) => ({
      memberId: m._id,
      userKey: m.userKey,
      role: m.role,
      assignedRoleId: m.assignedRoleId ?? null,
      isActive: m.isActive !== false,
      createdAt: m.createdAt,
    })),
    membershipsOnJoshuaOrgByEmailKey: eballardMembershipsByEmail.map((m) => ({
      memberId: m._id,
      userKey: m.userKey,
      role: m.role,
    })),
    staleAliasMemberships: staleAliasMemberships.map((m) => ({
      memberId: m._id,
      userKey: m.userKey,
      role: m.role,
    })),
    sessionCount: sessions.length,
    activeSessions: sessions.filter(
      (s) => !s.revokedAtMs && s.idleExpiresAtMs > Date.now(),
    ).length,
    assignedRoleValid,
    assignedRoleLabel,
    orgRoleCount: roles.length,
    inviteBlockers: {
      duplicateAuthUsers,
      missingMembership: user ? eballardMembershipsById.length === 0 : null,
      duplicateMembershipRows: eballardMembershipsById.length > 1,
      emailKeyMembershipRows: eballardMembershipsByEmail.length,
      staleAliasMembershipRows: staleAliasMemberships.length,
      invalidAssignedRole: canonMem ? !assignedRoleValid : null,
      defaultOrgMismatch:
        user && user.defaultOrganizationId
          ? String(user.defaultOrganizationId) !== String(JOSHUA_ORG_ID)
          : null,
    },
  };
}

export const auditEballardReinvite = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    return buildEballardForensic(ctx);
  },
});

export const repairEballardMembership = mutation({
  args: {
    adminSecret: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { adminSecret, dryRun }) => {
    assertDataMigrationAdmin(adminSecret);
    const before = await buildEballardForensic(ctx);
    const user = await findAuthUserByCanonicalLogin(ctx, EBALLARD_LOGIN);
    if (!user) throw new Error("joshuaeballard@gmail.com auth user not found.");

    const deleted: Record<string, number> = {};
    const del = async (table: string, id: Id<"organizationMembers">) => {
      deleted[table] = (deleted[table] ?? 0) + 1;
      if (!dryRun) await ctx.db.delete(id);
    };

    const canonicalLogin = canonicalLoginKey(EBALLARD_LOGIN);
    const allJoshuaMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", JOSHUA_ORG_ID))
      .collect();

    for (const m of allJoshuaMembers) {
      const isEmailAlias =
        m.userKey !== String(user._id) &&
        (canonicalLoginKey(m.userKey) === canonicalLogin ||
          m.userKey.includes("joshuaeballard"));
      if (isEmailAlias) {
        await del("organizationMembers_stale_alias", m._id);
      }
    }

    const { adminId, userId: memberRoleId } =
      await seedSystemRolesForOrganization(ctx, JOSHUA_ORG_ID);

    const salesRows = await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization_key", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID).eq("key", SYSTEM_ORG_ROLE_KEYS.sales),
      )
      .collect();
    const salesRole = pickCanonicalOrgRole(salesRows);
    const assignedRoleId = salesRole?._id ?? memberRoleId;

    const remaining = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID).eq("userKey", String(user._id)),
      )
      .collect();
    const canon = pickCanonicalOrgMember(remaining);
    const now = Date.now();

    let membershipId: Id<"organizationMembers"> | null = canon?._id ?? null;
    if (canon) {
      for (const row of remaining) {
        if (row._id !== canon._id) {
          await del("organizationMembers_duplicate", row._id);
        }
      }
      const patch: Partial<Doc<"organizationMembers">> = {
        role: "member",
        assignedRoleId,
        isActive: true,
      };
      if (
        canon.role !== patch.role ||
        canon.assignedRoleId !== assignedRoleId ||
        canon.isActive === false
      ) {
        if (!dryRun) {
          await ctx.db.patch(canon._id, patch);
        }
      }
    } else {
      if (!dryRun) {
        membershipId = await ctx.db.insert("organizationMembers", {
          organizationId: JOSHUA_ORG_ID,
          userKey: String(user._id),
          role: "member",
          assignedRoleId,
          isActive: true,
          createdAt: now,
        });
      }
    }

    const identityPatch: Partial<Doc<"authUsers">> = {};
    if (user.normalizedUsername !== canonicalLogin) {
      identityPatch.normalizedUsername = canonicalLogin;
    }
    if (user.usernameNormalized !== canonicalLogin) {
      identityPatch.usernameNormalized = canonicalLogin;
    }
    if (user.email !== canonicalLogin) {
      identityPatch.email = canonicalLogin;
    }
    if (user.defaultOrganizationId !== JOSHUA_ORG_ID) {
      identityPatch.defaultOrganizationId = JOSHUA_ORG_ID;
    }
    if (Object.keys(identityPatch).length > 0) {
      identityPatch.updatedAt = now;
      if (!dryRun) {
        await ctx.db.patch(user._id, identityPatch);
      }
    }

    const after = dryRun ? before : await buildEballardForensic(ctx);

    return {
      dryRun,
      before,
      after,
      deleted,
      repairedUserId: user._id,
      membershipId,
      assignedRoleId,
    };
  },
});

/** Simulate remove → re-add via createOrgMemberUser re-invite path. */
export const validateEballardReinviteCycle = mutation({
  args: {
    adminSecret: v.string(),
    actorUserKey: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, { adminSecret, actorUserKey, passwordHash }) => {
    assertDataMigrationAdmin(adminSecret);
    const hashErr = validateStoredArgon2PasswordHash(passwordHash);
    if (hashErr) throw new Error(hashErr);

    await assertOrgPermission(
      ctx,
      JOSHUA_ORG_ID,
      actorUserKey.trim(),
      "org.members.invite",
    );

    const user = await findAuthUserByCanonicalLogin(ctx, EBALLARD_LOGIN);
    if (!user) throw new Error("Auth user missing.");

    const userKey = String(user._id);
    const rows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID).eq("userKey", userKey),
      )
      .collect();

    const removedIds: Id<"organizationMembers">[] = [];
    for (const row of rows) {
      removedIds.push(row._id);
      await ctx.db.delete(row._id);
    }

    const { userId: memberRoleId } = await seedSystemRolesForOrganization(
      ctx,
      JOSHUA_ORG_ID,
    );
    const salesRows = await ctx.db
      .query("organizationRoles")
      .withIndex("by_organization_key", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID).eq("key", SYSTEM_ORG_ROLE_KEYS.sales),
      )
      .collect();
    const salesRole = pickCanonicalOrgRole(salesRows);
    const assignedRoleId = salesRole?._id ?? memberRoleId;

    const reinvite = await reinviteExistingUserToOrg(ctx, {
      organizationId: JOSHUA_ORG_ID,
      userId: user._id,
      assignedRoleId,
      passwordHash,
    });

    const afterRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", JOSHUA_ORG_ID).eq("userKey", userKey),
      )
      .collect();

    return {
      pass: afterRows.length === 1 && reinvite.reinvited === true,
      removedMembershipIds: removedIds,
      membershipId: afterRows[0]?._id ?? null,
      membershipCount: afterRows.length,
      reinvited: reinvite.reinvited,
      actorUserKey,
    };
  },
});
