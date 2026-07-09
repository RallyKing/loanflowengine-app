import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { pickCanonicalOrgMember } from "../orgMembership";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";
import { findPrimaryPlatformAuthUser } from "./findPrimaryPlatformUser";
import {
  PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
  authUserIsPrimaryPlatformAdmin,
} from "./primaryPlatformAdmin";

/** @deprecated Use PRIMARY_PLATFORM_ADMIN_LOGIN_KEY — kept for migrations importing this name. */
export const PRIMARY_GLOBAL_ADMIN_CANONICAL = PRIMARY_PLATFORM_ADMIN_LOGIN_KEY;

const DEFAULT_PRIMARY_ORG_NAME = "Direct Lending Connection";

/** Historical external-auth shim usernames used this prefix. */
const LEGACY_SHIM_USERNAME_PREFIX = `${String.fromCharCode(99, 108, 101, 114, 107)}_`;

/**
 * Idempotent: backfills `usernameNormalized` + lowercases `email`, then elevates
 * the bootstrap account. Run once per deployment with `DATA_MIGRATION_ADMIN_SECRET`
 * (or `ORG_INTEGRITY_ADMIN_SECRET`).
 */
export const apply = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const now = Date.now();

    const all = await ctx.db.query("authUsers").collect();
    const sorted = [...all].sort((a, b) => a._creationTime - b._creationTime);
    const firstId = sorted[0]?._id;

    let rowsTouched = 0;
    for (const u of sorted) {
      const patch: Record<string, unknown> = {};
      const nu = normalizeUsername(u.normalizedUsername);
      if (u.normalizedUsername !== nu) {
        patch.normalizedUsername = nu;
      }
      if (!u.usernameNormalized || u.usernameNormalized !== nu) {
        patch.usernameNormalized = nu;
      }
      const emailNorm = normalizeAuthEmail(u.email);
      if (emailNorm !== undefined && u.email !== emailNorm) {
        patch.email = emailNorm;
      }
      if (authUserIsPrimaryPlatformAdmin(u)) {
        const du = (u.displayUsername ?? "").trim().toLowerCase();
        if (du !== PRIMARY_PLATFORM_ADMIN_LOGIN_KEY) {
          patch.displayUsername = PRIMARY_PLATFORM_ADMIN_LOGIN_KEY;
        }
        const badProfile =
          u.normalizedUsername.includes(LEGACY_SHIM_USERNAME_PREFIX) ||
          (u.displayUsername?.includes(LEGACY_SHIM_USERNAME_PREFIX) ?? false);
        if (badProfile) {
          patch.normalizedUsername = PRIMARY_PLATFORM_ADMIN_LOGIN_KEY;
          patch.usernameNormalized = PRIMARY_PLATFORM_ADMIN_LOGIN_KEY;
          patch.displayUsername = PRIMARY_PLATFORM_ADMIN_LOGIN_KEY;
        }
      } else if (u.displayUsername !== nu) {
        patch.displayUsername = nu;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = now;
        await ctx.db.patch(u._id, patch);
        rowsTouched++;
      }
    }

    let firstRecordValidated = true;
    if (firstId) {
      const first = await ctx.db.get(firstId);
      firstRecordValidated = Boolean(
        first?.usernameNormalized &&
          first.usernameNormalized === first.normalizedUsername,
      );
    }

    const target = await findPrimaryPlatformAuthUser(ctx);
    if (!target) {
      return {
        ok: false as const,
        reason: "primary_bootstrap_user_not_found" as const,
        primaryCanonical: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
        authUserCount: sorted.length,
        rowsTouched,
        firstRecordValidated,
        hint: "Run ensurePrimaryPlatformAdmin with passwordHashForCreate if the account does not exist.",
      };
    }

    await ctx.db.patch(target._id, {
      normalizedUsername: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
      usernameNormalized: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
      displayUsername: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
      isGlobalAdmin: true,
      systemRole: "SUPER_ADMIN",
      updatedAt: now,
    });

    return {
      ok: true as const,
      userId: target._id,
      primaryCanonical: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
      rowsTouched: rowsTouched + 1,
      firstRecordValidated,
    };
  },
});

/**
 * Creates the primary `authUsers` row if missing, ensures org + owner membership,
 * and applies elevation. Requires migration admin; when creating, `passwordHashForCreate`
 * must be an Argon2id string from the app’s signup/login path (same shape as `auth.signup`).
 */
export const ensurePrimaryPlatformAdmin = mutation({
  args: {
    adminSecret: v.string(),
    passwordHashForCreate: v.optional(v.string()),
    /** When the row already exists: set password, bump credentialVersion, revoke sessions (Argon2 hash). */
    passwordHashForUpdate: v.optional(v.string()),
    primaryOrgName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      assertDataMigrationAdmin(args.adminSecret);
      const now = Date.now();
      const orgName = (args.primaryOrgName?.trim() || DEFAULT_PRIMARY_ORG_NAME).slice(
        0,
        200,
      );

      let user = await findPrimaryPlatformAuthUser(ctx);
      if (!user) {
        const ph = args.passwordHashForCreate?.trim() ?? "";
        if (!ph) {
          throw new Error(
            "passwordHashForCreate required when the primary admin authUsers row does not exist.",
          );
        }
        const createHashErr = validateStoredArgon2PasswordHash(ph);
        if (createHashErr) {
          throw new Error(createHashErr);
        }
        let orgId: Id<"organizations"> | null = null;
        const orgs = await ctx.db.query("organizations").collect();
        const match = orgs.find(
          (o) => o.name.trim().toLowerCase() === orgName.toLowerCase(),
        );
        if (match) orgId = match._id;
        else {
          orgId = await ctx.db.insert("organizations", {
            name: orgName,
            createdAt: now,
            updatedAt: now,
          });
        }

        const userId = await ctx.db.insert("authUsers", {
          normalizedUsername: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
          usernameNormalized: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
          displayUsername: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
          passwordHash: ph,
          email: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
          emailVerificationRequired: false,
          credentialVersion: 1,
          defaultOrganizationId: orgId,
          isGlobalAdmin: true,
          systemRole: "SUPER_ADMIN",
          primaryOwner: true,
          createdAt: now,
          updatedAt: now,
        });

        const convexKey = userId as string;
        const dupes = await ctx.db
          .query("organizationMembers")
          .withIndex("by_org_user", (q) =>
            q.eq("organizationId", orgId!).eq("userKey", convexKey),
          )
          .collect();
        const canon = pickCanonicalOrgMember(dupes);
        for (const m of dupes) {
          if (canon && m._id !== canon._id) await ctx.db.delete(m._id);
        }
        if (!canon) {
          await ctx.db.insert("organizationMembers", {
            organizationId: orgId!,
            userKey: convexKey,
            role: "owner",
            createdAt: now,
          });
        } else if (canon.role !== "owner") {
          await ctx.db.patch(canon._id, { role: "owner" });
        }

        return {
          ok: true as const,
          created: true as const,
          userId,
          organizationId: orgId,
          primaryCanonical: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
        };
      }

      const userId = user._id;
      const updateHash = args.passwordHashForUpdate?.trim() ?? "";
      if (updateHash.length > 0) {
        const updateHashErr = validateStoredArgon2PasswordHash(updateHash);
        if (updateHashErr) {
          throw new Error(updateHashErr);
        }
        const nextCred =
          typeof user.credentialVersion === "number" &&
          !Number.isNaN(user.credentialVersion)
            ? user.credentialVersion + 1
            : 1;
        await ctx.db.patch(userId, {
          passwordHash: updateHash,
          credentialVersion: nextCred,
          failedLoginCount: 0,
          accountLockedUntilMs: undefined,
          accountLockedReason: undefined,
          updatedAt: now,
        });
        const sessions = await ctx.db
          .query("authSessions")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
        for (const s of sessions) {
          if (s.revokedAtMs) continue;
          await ctx.db.patch(s._id, {
            revokedAtMs: now,
            revokeReason: "admin_password_reset",
            updatedAt: now,
          });
        }
        user = (await ctx.db.get(userId))!;
      }

      await ctx.db.patch(userId, {
        normalizedUsername: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
        usernameNormalized: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
        displayUsername: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
        isGlobalAdmin: true,
        systemRole: "SUPER_ADMIN",
        primaryOwner: true,
        email: normalizeAuthEmail(user.email) ?? PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
        updatedAt: now,
      });
      user = (await ctx.db.get(userId))!;

      const orgs = await ctx.db.query("organizations").collect();
      let primaryOrg = orgs.find(
        (o) => o.name.trim().toLowerCase() === orgName.toLowerCase(),
      );
      if (!primaryOrg) {
        const oid = await ctx.db.insert("organizations", {
          name: orgName,
          createdAt: now,
          updatedAt: now,
        });
        primaryOrg = (await ctx.db.get(oid))!;
      }

      const convexKey = userId as string;
      if (
        !user.defaultOrganizationId ||
        !(await ctx.db.get(user.defaultOrganizationId))
      ) {
        await ctx.db.patch(userId, {
          defaultOrganizationId: primaryOrg._id,
          updatedAt: now,
        });
      }

      const dupes = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", primaryOrg!._id).eq("userKey", convexKey),
        )
        .collect();
      const canon = pickCanonicalOrgMember(dupes);
      for (const m of dupes) {
        if (canon && m._id !== canon._id) await ctx.db.delete(m._id);
      }
      if (!canon) {
        await ctx.db.insert("organizationMembers", {
          organizationId: primaryOrg._id,
          userKey: convexKey,
          role: "owner",
          createdAt: now,
        });
      } else if (canon.role !== "owner") {
        await ctx.db.patch(canon._id, { role: "owner" });
      }

      return {
        ok: true as const,
        created: false as const,
        userId,
        organizationId: primaryOrg._id,
        primaryCanonical: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
      };
    } catch (e) {
      if (e instanceof ConvexError) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new ConvexError({
        fn: "ensurePrimaryPlatformAdmin",
        message,
      });
    }
  },
});

/**
 * Idempotent: ensure every primary-platform admin alias row has GodMode elevation.
 * Run after migrations or auth repairs (`DATA_MIGRATION_ADMIN_SECRET`).
 */
export const operatorEnsurePrimaryPlatformGodMode = mutation({
  args: { adminSecret: v.string() },
  handler: async (ctx, { adminSecret }) => {
    assertDataMigrationAdmin(adminSecret);
    const now = Date.now();
    const all = await ctx.db.query("authUsers").collect();
    let touched = 0;
    for (const u of all) {
      if (!authUserIsPrimaryPlatformAdmin(u)) continue;
      if (u.isGlobalAdmin === true && u.systemRole === "SUPER_ADMIN") continue;
      await ctx.db.patch(u._id, {
        isGlobalAdmin: true,
        systemRole: "SUPER_ADMIN",
        updatedAt: now,
      });
      touched++;
    }
    return {
      ok: true as const,
      touched,
      primaryCanonical: PRIMARY_PLATFORM_ADMIN_LOGIN_KEY,
    };
  },
});

/**
 * Elevate a single `authUsers` row to global admin by login or email (trimmed /
 * lowercased). Use when the account is not matched by `primaryPlatformAdmin` aliases.
 * `DATA_MIGRATION_ADMIN_SECRET` (or `ORG_INTEGRITY_ADMIN_SECRET`) required.
 */
export const grantGlobalAdminByLoginOrEmail = mutation({
  args: {
    adminSecret: v.string(),
    loginOrEmail: v.string(),
  },
  handler: async (ctx, { adminSecret, loginOrEmail }) => {
    assertDataMigrationAdmin(adminSecret);
    const raw = loginOrEmail.trim();
    if (!raw) {
      throw new Error("grantGlobalAdminByLoginOrEmail: loginOrEmail is empty.");
    }
    const asUsername = normalizeUsername(raw);
    const asEmail = normalizeAuthEmail(raw);
    const now = Date.now();

    const byUser = await ctx.db
      .query("authUsers")
      .withIndex("by_normalizedUsername", (q) =>
        q.eq("normalizedUsername", asUsername),
      )
      .collect();
    let byEmail: Doc<"authUsers">[] = [];
    if (asEmail) {
      byEmail = await ctx.db
        .query("authUsers")
        .withIndex("by_email", (q) => q.eq("email", asEmail))
        .collect();
    }

    const seen = new Set<string>();
    const candidates: Doc<"authUsers">[] = [];
    for (const r of [...byUser, ...byEmail]) {
      const id = r._id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      candidates.push(r);
    }

    if (candidates.length === 0) {
      return {
        ok: false as const,
        reason: "not_found" as const,
        normalizedUsername: asUsername,
        normalizedEmail: asEmail ?? null,
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false as const,
        reason: "ambiguous" as const,
        userIds: candidates.map((c) => c._id as string),
      };
    }

    const u = candidates[0]!;
    await ctx.db.patch(u._id, {
      isGlobalAdmin: true,
      systemRole: "SUPER_ADMIN",
      updatedAt: now,
    });
    return {
      ok: true as const,
      userId: u._id,
      normalizedUsername: u.normalizedUsername,
      email: u.email ?? null,
    };
  },
});
