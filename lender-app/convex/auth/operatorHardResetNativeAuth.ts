import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";
import { normalizeAuthEmail } from "../../lib/auth/normalizeAuthEmail";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";

/**
 * Operator: delete all authSessions, password-reset and email-verification token rows
 * for a user, clear lockout / failed-login fields, normalize native identity to
 * lowercase, and set a fresh Argon2 password hash (from Node `hashPassword()`).
 */
export const hardResetAuthUserById = mutation({
  args: {
    adminSecret: v.string(),
    userId: v.id("authUsers"),
    /** Canonical lowercase login key (for email-login accounts, same as normalized email). */
    canonicalLoginKey: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const ph = args.passwordHash.trim();
    const hashErr = validateStoredArgon2PasswordHash(ph);
    if (hashErr) {
      throw new Error(hashErr);
    }
    const loginKey = normalizeUsername(args.canonicalLoginKey);
    if (!loginKey.length) throw new Error("canonicalLoginKey required.");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("authUsers row not found.");

    const normEmail = normalizeAuthEmail(args.canonicalLoginKey) ?? loginKey;
    const now = Date.now();

    let sessionsDeleted = 0;
    let resetTokensDeleted = 0;
    let emailTokensDeleted = 0;

    for (const s of await ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(s._id);
      sessionsDeleted++;
    }
    for (const t of await ctx.db
      .query("authPasswordResetTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(t._id);
      resetTokensDeleted++;
    }
    for (const t of await ctx.db
      .query("authEmailVerificationTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect()) {
      await ctx.db.delete(t._id);
      emailTokensDeleted++;
    }

    const nextVersion = user.credentialVersion + 1;

    await ctx.db.patch(user._id, {
      normalizedUsername: loginKey,
      usernameNormalized: loginKey,
      displayUsername: loginKey,
      email: normEmail,
      passwordHash: ph,
      credentialVersion: nextVersion,
      failedLoginCount: 0,
      lastFailedLoginAt: undefined,
      accountLockedUntilMs: undefined,
      accountLockedReason: undefined,
      updatedAt: now,
    });

    return {
      ok: true as const,
      userId: user._id,
      normalizedUsername: loginKey,
      email: normEmail,
      credentialVersion: nextVersion,
      sessionsDeleted,
      authPasswordResetTokensDeleted: resetTokensDeleted,
      authEmailVerificationTokensDeleted: emailTokensDeleted,
    };
  },
});
