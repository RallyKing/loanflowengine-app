import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import {
  collectAuthUsersByCanonicalLogin,
  normalizeAuthEmail,
  normalizeUsername,
} from "./canonicalIdentity";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";
import { pickCanonicalOrgMember } from "../orgMembership";

/**
 * Operator-only production auth diagnostic for one login/email.
 * Returns stored hash for local Argon2 verify in operator scripts (admin secret required).
 */
export const diagnoseAuthUserByLogin = mutation({
  args: {
    adminSecret: v.string(),
    loginOrEmail: v.string(),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const raw = args.loginOrEmail.trim();
    const candidates = await collectAuthUsersByCanonicalLogin(ctx, raw);
    const asUsername = normalizeUsername(raw);
    const asEmail = normalizeAuthEmail(raw);
    if (candidates.length === 0) {
      return {
        userExists: false as const,
        usernameStored: null,
        normalizedUsernameStored: asUsername,
        emailStored: asEmail ?? null,
        passwordHashPresent: false,
        argon2HashFormatValid: false,
        membershipActive: false,
        defaultOrgValid: false,
        sessionBridgePath:
          "Next /api/auth/login → loginBridge.loginLookup → verifyPassword → createSessionBridged",
      };
    }
    if (candidates.length > 1) {
      return {
        userExists: true as const,
        ambiguous: true as const,
        candidateUserIds: candidates.map((c) => c._id as string),
        normalizedUsernameStored: asUsername,
        emailStored: asEmail ?? null,
      };
    }

    const user = candidates[0]!;
    const hash = user.passwordHash?.trim() ?? "";
    const passwordHashPresent = hash.length > 0;
    const argon2HashFormatValid =
      passwordHashPresent && validateStoredArgon2PasswordHash(hash) === null;

    let defaultOrgValid = false;
    let membershipActive = false;
    let membershipRole: string | null = null;
    if (user.defaultOrganizationId) {
      const org = await ctx.db.get(user.defaultOrganizationId);
      defaultOrgValid = Boolean(org);
      if (org) {
        const memRows = await ctx.db
          .query("organizationMembers")
          .withIndex("by_org_user", (q) =>
            q
              .eq("organizationId", user.defaultOrganizationId!)
              .eq("userKey", user._id as string),
          )
          .collect();
        const mem = pickCanonicalOrgMember(memRows);
        membershipActive = Boolean(mem && mem.isActive !== false);
        membershipRole = mem?.role ?? null;
      }
    }

    return {
      userExists: true as const,
      ambiguous: false as const,
      userId: user._id,
      usernameStored: user.displayUsername,
      normalizedUsernameStored: user.normalizedUsername,
      usernameNormalizedLegacy: user.usernameNormalized ?? null,
      emailStored: user.email ?? null,
      passwordHashPresent,
      argon2HashFormatValid,
      passwordHashForVerify: hash || null,
      defaultOrganizationId: user.defaultOrganizationId ?? null,
      membershipActive,
      membershipRole,
      defaultOrgValid,
      accountLockedUntilMs: user.accountLockedUntilMs ?? null,
      failedLoginCount: user.failedLoginCount ?? 0,
      credentialVersion: user.credentialVersion,
      isGlobalAdmin: Boolean(user.isGlobalAdmin),
      systemRole: user.systemRole ?? null,
      sessionBridgePath:
        "Next /api/auth/login → loginBridge.loginLookup → verifyPassword → createSessionBridged",
    };
  },
});

/**
 * Operator-only: clear failed-login lockout without password reset or session purge.
 */
export const clearAccountLockoutByLogin = mutation({
  args: {
    adminSecret: v.string(),
    loginOrEmail: v.string(),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const raw = args.loginOrEmail.trim();
    const candidates = await collectAuthUsersByCanonicalLogin(ctx, raw);
    if (candidates.length === 0) {
      return {
        ok: false as const,
        code: "USER_NOT_FOUND" as const,
        loginOrEmail: raw,
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false as const,
        code: "AMBIGUOUS" as const,
        candidateUserIds: candidates.map((c) => c._id as string),
      };
    }
    const user = candidates[0]!;
    const now = Date.now();
    await ctx.db.patch(user._id, {
      failedLoginCount: 0,
      lastFailedLoginAt: undefined,
      accountLockedUntilMs: undefined,
      accountLockedReason: undefined,
      updatedAt: now,
    });
    return {
      ok: true as const,
      userId: user._id,
      normalizedUsername: user.normalizedUsername,
      email: user.email ?? null,
      clearedAt: now,
    };
  },
});
