import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { authUserHasGlobalAdminElevation } from "./globalAdmin";
import { authUserMayInitiateSuperuserImpersonation } from "./superuserAllowlist";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { pickCanonicalAuthSession } from "./authSessionPick";

function shouldSkipTemporaryAccountLockout(): boolean {
  if (process.env.PLAYWRIGHT_RELAX_LOGIN_RATE_LIMIT === "1") return true;
  if (process.env.AUTH_RELAX_LOGIN_RATE_LIMIT === "1") return true;
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AUTH_ENFORCE_LOGIN_RATE_LIMIT !== "1"
  ) {
    return true;
  }
  return false;
}

function workspaceRoleFromMemberRole(
  role: "owner" | "admin" | "member" | undefined,
): "workspace:admin" | "workspace:member" {
  if (role === "member") return "workspace:member";
  return "workspace:admin";
}

export const validateSession = query({
  args: {
    publicId: v.string(),
    tokenHash: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionRows = await ctx.db
      .query("authSessions")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
      .collect();
    const row = pickCanonicalAuthSession(sessionRows);
    if (!row) return { ok: false as const, code: "SESSION_NOT_FOUND" as const };
    if (row.revokedAtMs)
      return { ok: false as const, code: "SESSION_REVOKED" as const };
    if (row.absoluteExpiresAtMs < args.nowMs)
      return { ok: false as const, code: "SESSION_EXPIRED" as const };
    if (row.idleExpiresAtMs < args.nowMs)
      return { ok: false as const, code: "SESSION_EXPIRED" as const };

    const user = await ctx.db.get(row.userId);
    if (!user) return { ok: false as const, code: "USER_MISSING" as const };
    if (
      !shouldSkipTemporaryAccountLockout() &&
      user.accountLockedUntilMs &&
      user.accountLockedUntilMs > args.nowMs
    ) {
      return { ok: false as const, code: "ACCOUNT_LOCKED" as const };
    }
    if (user.credentialVersion !== row.credentialVersion) {
      return { ok: false as const, code: "SESSION_INVALIDATED" as const };
    }

    const withinPrev =
      row.previousTokenHash === args.tokenHash &&
      row.previousTokenValidUntilMs !== undefined &&
      args.nowMs <= row.previousTokenValidUntilMs;
    const tokenOk = row.tokenHash === args.tokenHash || withinPrev;
    if (!tokenOk) return { ok: false as const, code: "INVALID_TOKEN" as const };

    const orgId = user.defaultOrganizationId;
    if (!orgId) return { ok: false as const, code: "NO_ORG" as const };
    const org = await ctx.db.get(orgId);
    if (!org) return { ok: false as const, code: "NO_ORG" as const };

    const member = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId).eq("userKey", user._id as string),
      )
      .first();

    return {
      ok: true as const,
      sessionId: row._id,
      publicId: row.publicId,
      userId: user._id,
      userKey: user._id as string,
      displayUsername: user.displayUsername,
      email: normalizeAuthEmail(user.email) ?? "",
      fullName: user.displayUsername,
      organizationId: orgId,
      organizationName: org.name,
      workspaceRole: workspaceRoleFromMemberRole(member?.role),
      isGlobalAdmin: authUserHasGlobalAdminElevation(user),
      canSuperuserImpersonate: authUserMayInitiateSuperuserImpersonation(user),
      idleExpiresAtMs: row.idleExpiresAtMs,
      absoluteExpiresAtMs: row.absoluteExpiresAtMs,
      rememberMe: row.rememberMe,
    };
  },
});

export const touchSession = mutation({
  args: {
    publicId: v.string(),
    tokenHash: v.string(),
    nowMs: v.number(),
    /** When set, rotate cookie secret and extend idle window from now. */
    newTokenHash: v.optional(v.string()),
    rotationGraceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sessionRows = await ctx.db
      .query("authSessions")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
      .collect();
    const row = pickCanonicalAuthSession(sessionRows);
    if (!row || row.revokedAtMs) {
      throw new Error("SESSION_INVALID");
    }
    if (row.absoluteExpiresAtMs < args.nowMs || row.idleExpiresAtMs < args.nowMs) {
      throw new Error("SESSION_EXPIRED");
    }
    const withinPrev =
      row.previousTokenHash === args.tokenHash &&
      row.previousTokenValidUntilMs !== undefined &&
      args.nowMs <= row.previousTokenValidUntilMs;
    if (row.tokenHash !== args.tokenHash && !withinPrev) {
      throw new Error("INVALID_TOKEN");
    }
    const user = await ctx.db.get(row.userId);
    if (!user) throw new Error("USER_MISSING");
    if (user.credentialVersion !== row.credentialVersion) {
      throw new Error("SESSION_INVALIDATED");
    }

    const now = args.nowMs;
    const idleMs = row.rememberMe
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
    let nextTokenHash = row.tokenHash;
    let previousTokenHash: string | undefined = row.previousTokenHash;
    let previousTokenValidUntilMs: number | undefined = row.previousTokenValidUntilMs;

    if (args.newTokenHash && args.newTokenHash !== row.tokenHash) {
      nextTokenHash = args.newTokenHash;
      previousTokenHash = row.tokenHash;
      previousTokenValidUntilMs = now + (args.rotationGraceMs ?? 120_000);
    }

    await ctx.db.patch(row._id, {
      tokenHash: nextTokenHash,
      previousTokenHash,
      previousTokenValidUntilMs,
      lastSeenAt: now,
      idleExpiresAtMs: now + idleMs,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const revokeSession = mutation({
  args: { publicId: v.string(), reason: v.string(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const sessionRows = await ctx.db
      .query("authSessions")
      .withIndex("by_publicId", (q) => q.eq("publicId", args.publicId))
      .collect();
    const row = pickCanonicalAuthSession(sessionRows);
    if (!row || row.revokedAtMs) return;
    await ctx.db.patch(row._id, {
      revokedAtMs: args.nowMs,
      revokeReason: args.reason,
      updatedAt: args.nowMs,
    });
  },
});
