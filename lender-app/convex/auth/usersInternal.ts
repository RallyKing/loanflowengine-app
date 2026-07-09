import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { normalizeUsername } from "../../lib/auth/normalizeUsername";
import { isE2ESandboxNormalizedUsername } from "../../lib/auth/e2eSandboxAuth";

const MAX_FAILED_BEFORE_LOCK = 8;
const LOCK_DURATION_MS = 30 * 60 * 1000;

function pickNewestAuthUser(rows: Doc<"authUsers">[]): Doc<"authUsers"> | null {
  if (rows.length === 0) return null;
  return rows.reduce((best, cur) =>
    cur.createdAt > best.createdAt ? cur : best,
  );
}

export const getByNormalizedUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const usernameLower = normalizeUsername(args.username);
    const rows = await ctx.db
      .query("authUsers")
      .withIndex("by_normalizedUsername", (q) =>
        q.eq("normalizedUsername", usernameLower),
      )
      .collect();
    return pickNewestAuthUser(rows);
  },
});

export const recordFailedLogin = internalMutation({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    if (isE2ESandboxNormalizedUsername(user.normalizedUsername)) return;
    const now = Date.now();
    const fails = (user.failedLoginCount ?? 0) + 1;
    const patch: Record<string, unknown> = {
      failedLoginCount: fails,
      lastFailedLoginAt: now,
      updatedAt: now,
    };
    if (fails >= MAX_FAILED_BEFORE_LOCK) {
      patch.accountLockedUntilMs = now + LOCK_DURATION_MS;
      patch.accountLockedReason = "too_many_failed_logins";
    }
    await ctx.db.patch(userId, patch);
  },
});

export const clearFailedLogins = internalMutation({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, { userId }) => {
    const now = Date.now();
    await ctx.db.patch(userId, {
      failedLoginCount: 0,
      lastFailedLoginAt: undefined,
      accountLockedUntilMs: undefined,
      accountLockedReason: undefined,
      updatedAt: now,
    });
  },
});

export const bumpCredentialVersion = internalMutation({
  args: { userId: v.id("authUsers") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;
    const now = Date.now();
    await ctx.db.patch(userId, {
      credentialVersion: user.credentialVersion + 1,
      updatedAt: now,
    });
  },
});
