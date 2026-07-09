import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, mutation } from "../_generated/server";
import {
  findAuthUserByCanonicalLogin,
  normalizeUsername,
} from "./canonicalIdentity";
import {
  authBridgeStructuredError,
  tryParseAuthBridgeStructuredError,
} from "../../lib/auth/authStructuredError";
import { isE2ESandboxNormalizedUsername } from "../../lib/auth/e2eSandboxAuth";
import { assertAuthBridgeProofWithSkew } from "./bridge";
import { insertSessionRow } from "./sessionsInternal";
import { pickCanonicalOrgMember } from "../orgMembership";
import { seedSystemRolesForOrganization } from "../organizationRbac";
import { assertOrgHasAvailableMemberSeat } from "../orgPlanLimits";

const SKEW_MS = 120_000;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export const loginLookup = query({
  args: {
    /** Raw login identifier from the client — never use directly as an index key. */
    username: v.string(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    const rawUsername = args.username;
    const usernameLower = normalizeUsername(args.username);
    const authBridgeSecretPresent = Boolean(
      process.env.AUTH_BRIDGE_SECRET?.trim(),
    );
    try {
      await assertAuthBridgeProofWithSkew(
        args.bridgePayload,
        args.bridgeProof,
        SKEW_MS,
      );

      const user = await findAuthUserByCanonicalLogin(ctx, args.username, {
        allowDuplicatePickNewest: true,
      });
      if (!user) {
        return { found: false as const };
      }
      if (!user.passwordHash?.trim()) {
        throw authBridgeStructuredError("loginLookup", {
          reason: "missing_password_hash",
          username: rawUsername,
          normalizedUsername: usernameLower,
          userFound: true,
          passwordHashPresent: false,
          authBridgeSecretPresent,
        });
      }
      return {
        found: true as const,
        userId: user._id,
        passwordHash: user.passwordHash,
        credentialVersion: user.credentialVersion,
        defaultOrganizationId: user.defaultOrganizationId,
        accountLockedUntilMs: user.accountLockedUntilMs,
        emailVerificationRequired: user.emailVerificationRequired,
        emailVerifiedAt: user.emailVerifiedAt,
      };
    } catch (e) {
      if (tryParseAuthBridgeStructuredError(e)) {
        throw e;
      }
      throw authBridgeStructuredError("loginLookup", {
        reason: e instanceof Error ? e.message : String(e),
        username: rawUsername,
        normalizedUsername: usernameLower,
        userFound: false,
        passwordHashPresent: false,
        authBridgeSecretPresent,
      });
    }
  },
});

export const bridgedRateConsume = mutation({
  args: {
    key: v.string(),
    maxPerWindow: v.number(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    const now = Date.now();
    const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
    const row = await ctx.db
      .query("authRateBuckets")
      .withIndex("by_key_window", (q) =>
        q.eq("key", args.key).eq("windowStartMs", windowStart),
      )
      .first();
    if (!row) {
      await ctx.db.insert("authRateBuckets", {
        key: args.key,
        windowStartMs: windowStart,
        count: 1,
      });
      return { ok: true as const };
    }
    if (row.count >= args.maxPerWindow) {
      return { ok: false as const, code: "RATE_LIMITED" as const };
    }
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { ok: true as const };
  },
});

export const createSessionBridged = mutation({
  args: {
    userId: v.id("authUsers"),
    publicId: v.string(),
    tokenHash: v.string(),
    csrfTokenHash: v.string(),
    rememberMe: v.boolean(),
    credentialVersion: v.number(),
    userAgent: v.optional(v.string()),
    ipHint: v.optional(v.string()),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    await insertSessionRow(ctx, {
      userId: args.userId,
      publicId: args.publicId,
      tokenHash: args.tokenHash,
      csrfTokenHash: args.csrfTokenHash,
      rememberMe: args.rememberMe,
      credentialVersion: args.credentialVersion,
      userAgent: args.userAgent,
      ipHint: args.ipHint,
    });
    return { ok: true as const };
  },
});

export const recordFailedLoginBridged = mutation({
  args: {
    userId: v.id("authUsers"),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    const user = await ctx.db.get(args.userId);
    if (!user) return;
    if (isE2ESandboxNormalizedUsername(user.normalizedUsername)) return;
    const now = Date.now();
    const fails = (user.failedLoginCount ?? 0) + 1;
    const patch: Record<string, unknown> = {
      failedLoginCount: fails,
      lastFailedLoginAt: now,
      updatedAt: now,
    };
    if (fails >= 8) {
      patch.accountLockedUntilMs = now + 30 * 60 * 1000;
      patch.accountLockedReason = "too_many_failed_logins";
    }
    await ctx.db.patch(args.userId, patch);
  },
});

export const clearFailedLoginsBridged = mutation({
  args: {
    userId: v.id("authUsers"),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      failedLoginCount: 0,
      lastFailedLoginAt: undefined,
      accountLockedUntilMs: undefined,
      accountLockedReason: undefined,
      updatedAt: now,
    });
  },
});

export const revokeSessionBridged = mutation({
  args: {
    publicId: v.string(),
    reason: v.string(),
    nowMs: v.number(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    const sessionRows = await ctx.db
      .query("authSessions")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
      .collect();
    const row =
      sessionRows.length === 0
        ? null
        : sessionRows.reduce((a, b) =>
            a.createdAt >= b.createdAt ? a : b,
          );
    if (!row || row.revokedAtMs) return;
    await ctx.db.patch(row._id, {
      revokedAtMs: args.nowMs,
      revokeReason: args.reason,
      updatedAt: args.nowMs,
    });
  },
});

export const appendLoginAuditBridged = mutation({
  args: {
    userId: v.optional(v.id("authUsers")),
    normalizedUsernameAttempt: v.optional(v.string()),
    outcome: v.union(v.literal("success"), v.literal("failure")),
    reason: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ipHint: v.optional(v.string()),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    await ctx.db.insert("authLoginAudit", {
      userId: args.userId,
      normalizedUsernameAttempt: args.normalizedUsernameAttempt,
      at: Date.now(),
      outcome: args.outcome,
      reason: args.reason,
      userAgent: args.userAgent,
      ipHint: args.ipHint,
    });
    return { ok: true as const };
  },
});

/**
 * Best-effort repair when `organizationMembers` is missing or inactive for the
 * user's `defaultOrganizationId`. Invoked asynchronously after login (non-blocking).
 */
export const repairDefaultOrgMembershipBridged = mutation({
  args: {
    userId: v.id("authUsers"),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    const authBridgeSecretPresent = Boolean(
      process.env.AUTH_BRIDGE_SECRET?.trim(),
    );
    try {
      await assertAuthBridgeProofWithSkew(
        args.bridgePayload,
        args.bridgeProof,
        SKEW_MS,
      );
      const user = await ctx.db.get(args.userId);
      if (!user?.defaultOrganizationId) {
        return { ok: false as const, code: "NO_ORG" as const };
      }
      const orgId = user.defaultOrganizationId;
      const { adminId, userId: memberRoleId } =
        await seedSystemRolesForOrganization(ctx, orgId);
      const userKey = user._id as string;
      const memRows = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", orgId).eq("userKey", userKey),
        )
        .collect();
      const mem = pickCanonicalOrgMember(memRows);
      const now = Date.now();

      if (mem) {
        if (mem.isActive === false) {
          await ctx.db.patch(mem._id, { isActive: true });
          await ctx.db.patch(orgId, { updatedAt: now });
          return { ok: true as const, repaired: true as const };
        }
        return { ok: true as const, repaired: false as const };
      }

      try {
        await assertOrgHasAvailableMemberSeat(ctx, orgId);
      } catch {
        return { ok: false as const, code: "SEAT_LIMIT" as const };
      }

      const role = user.primaryOwner === true ? ("owner" as const) : ("member" as const);
      const assignedRoleId =
        user.primaryOwner === true ? adminId : memberRoleId;
      await ctx.db.insert("organizationMembers", {
        organizationId: orgId,
        userKey,
        role,
        assignedRoleId,
        isActive: true,
        createdAt: now,
      });
      await ctx.db.patch(orgId, { updatedAt: now });
      return { ok: true as const, repaired: true as const };
    } catch (e) {
      if (tryParseAuthBridgeStructuredError(e)) {
        throw e;
      }
      throw authBridgeStructuredError("membershipResolve", {
        reason: e instanceof Error ? e.message : String(e),
        userId: String(args.userId),
        authBridgeSecretPresent,
      });
    }
  },
});

export const assertUserWorkspaceActive = query({
  args: {
    userId: v.id("authUsers"),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      SKEW_MS,
    );
    const user = await ctx.db.get(args.userId);
    if (!user?.defaultOrganizationId) {
      return { ok: false as const, code: "NO_ORG" as const };
    }
    const memRows = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q
          .eq("organizationId", user.defaultOrganizationId!)
          .eq("userKey", user._id as string),
      )
      .collect();
    const mem = pickCanonicalOrgMember(memRows);
    if (!mem) return { ok: false as const, code: "NO_MEMBER" as const };
    if (mem.isActive === false) {
      return { ok: false as const, code: "INACTIVE" as const };
    }
    return { ok: true as const };
  },
});
