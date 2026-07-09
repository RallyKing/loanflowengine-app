import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";
import { assertAuthBridgeProofWithSkew } from "./bridge";
import { findAuthUserByCanonicalLogin } from "./canonicalIdentity";

const RESET_RL_MAX = 12;

/** Request reset — caller always sees success (anti-enumeration). */
export const requestPasswordReset = mutation({
  args: {
    /** Raw login identifier — never query `normalizedUsername` without normalizeUsername() first. */
    username: v.string(),
    tokenHash: v.string(),
    expiresAtMs: v.number(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
    ipHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      120_000,
    );
    const rlKey = `reset:${args.ipHint ?? "na"}`;
    const now = Date.now();
    const windowStart = Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000);
    const row = await ctx.db
      .query("authRateBuckets")
      .withIndex("by_key_window", (q) =>
        q.eq("key", rlKey).eq("windowStartMs", windowStart),
      )
      .first();
    if (!row) {
      await ctx.db.insert("authRateBuckets", {
        key: rlKey,
        windowStartMs: windowStart,
        count: 1,
      });
    } else if (row.count >= RESET_RL_MAX) {
      return { ok: true as const };
    } else {
      await ctx.db.patch(row._id, { count: row.count + 1 });
    }

    const user = await findAuthUserByCanonicalLogin(ctx, args.username);
    if (!user) return { ok: true as const };

    await ctx.db.insert("authPasswordResetTokens", {
      userId: user._id,
      tokenHash: args.tokenHash,
      expiresAtMs: args.expiresAtMs,
      createdAt: now,
    });
    return { ok: true as const };
  },
});

export const completePasswordReset = mutation({
  args: {
    tokenHash: v.string(),
    newPasswordHash: v.string(),
    bridgePayload: v.string(),
    bridgeProof: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    await assertAuthBridgeProofWithSkew(
      args.bridgePayload,
      args.bridgeProof,
      120_000,
    );
    const nHashErr = validateStoredArgon2PasswordHash(args.newPasswordHash);
    if (nHashErr) throw new Error(nHashErr);

    const row = await ctx.db
      .query("authPasswordResetTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!row || row.usedAtMs) throw new Error("INVALID_OR_EXPIRED_TOKEN");
    if (row.expiresAtMs < args.nowMs) throw new Error("INVALID_OR_EXPIRED_TOKEN");

    await ctx.db.patch(row._id, { usedAtMs: args.nowMs });
    await ctx.db.patch(row.userId, {
      passwordHash: args.newPasswordHash,
      updatedAt: args.nowMs,
    });

    const userAfter = await ctx.db.get(row.userId);
    if (!userAfter) throw new Error("USER_MISSING");
    await ctx.db.patch(row.userId, {
      credentialVersion: userAfter.credentialVersion + 1,
      updatedAt: args.nowMs,
    });

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", row.userId))
      .collect();
    for (const s of sessions) {
      if (s.revokedAtMs) continue;
      await ctx.db.patch(s._id, {
        revokedAtMs: args.nowMs,
        revokeReason: "password_reset",
        updatedAt: args.nowMs,
      });
    }

    return { ok: true as const };
  },
});

/** Placeholder: create verification row when outbound email is enabled. */
export const createEmailVerificationToken = internalMutation({
  args: {
    userId: v.id("authUsers"),
    tokenHash: v.string(),
    expiresAtMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("authEmailVerificationTokens", {
      userId: args.userId,
      tokenHash: args.tokenHash,
      expiresAtMs: args.expiresAtMs,
      createdAt: now,
    });
  },
});
