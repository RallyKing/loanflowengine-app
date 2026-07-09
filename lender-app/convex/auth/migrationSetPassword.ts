import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { validateStoredArgon2PasswordHash } from "../../lib/auth/passwordPolicy";
import { assertDataMigrationAdmin } from "../migrationAdminAuth";

/**
 * Operator-only: set password + bump credential version + revoke active sessions.
 * `passwordHash` must be Argon2id from `hashPassword()` (Node / signup API), never plain text.
 */
export const setAuthUserPassword = mutation({
  args: {
    adminSecret: v.string(),
    username: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    assertDataMigrationAdmin(args.adminSecret);
    const hashErr = validateStoredArgon2PasswordHash(args.passwordHash);
    if (hashErr) {
      throw new Error(hashErr);
    }
    const usernameLower = normalizeUsername(args.username);
    const user = await ctx.db
      .query("authUsers")
      .withIndex("by_normalizedUsername", (q) =>
        q.eq("normalizedUsername", usernameLower),
      )
      .first();
    if (!user) {
      throw new Error(`authUsers row not found for username: ${usernameLower}`);
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
      credentialVersion: user.credentialVersion + 1,
      failedLoginCount: 0,
      accountLockedUntilMs: undefined,
      accountLockedReason: undefined,
      updatedAt: now,
    });

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    let sessionsRevoked = 0;
    for (const s of sessions) {
      if (s.revokedAtMs) continue;
      await ctx.db.patch(s._id, {
        revokedAtMs: now,
        revokeReason: "admin_password_reset",
        updatedAt: now,
      });
      sessionsRevoked += 1;
    }

    return {
      ok: true as const,
      userId: user._id,
      normalizedUsername: usernameLower,
      sessionsRevoked,
    };
  },
});
