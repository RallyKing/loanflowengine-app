import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

export async function insertSessionRow(
  ctx: MutationCtx,
  args: {
    userId: Id<"authUsers">;
    publicId: string;
    tokenHash: string;
    csrfTokenHash: string;
    rememberMe: boolean;
    credentialVersion: number;
    userAgent?: string;
    ipHint?: string;
  },
): Promise<void> {
  const now = Date.now();
  const idleMs = args.rememberMe
    ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const absMs = args.rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 48 * 60 * 60 * 1000;
  await ctx.db.insert("authSessions", {
    userId: args.userId,
    publicId: args.publicId,
    tokenHash: args.tokenHash,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    absoluteExpiresAtMs: now + absMs,
    idleExpiresAtMs: now + idleMs,
    rememberMe: args.rememberMe,
    credentialVersion: args.credentialVersion,
    csrfTokenHash: args.csrfTokenHash,
    userAgent: args.userAgent,
    ipHint: args.ipHint,
  });
}

export const insertSession = internalMutation({
  args: {
    userId: v.id("authUsers"),
    publicId: v.string(),
    tokenHash: v.string(),
    csrfTokenHash: v.string(),
    rememberMe: v.boolean(),
    credentialVersion: v.number(),
    userAgent: v.optional(v.string()),
    ipHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await insertSessionRow(ctx, args);
  },
});

export const revokeAllForUser = internalMutation({
  args: {
    userId: v.id("authUsers"),
    reason: v.string(),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const s of sessions) {
      if (s.revokedAtMs) continue;
      await ctx.db.patch(s._id, {
        revokedAtMs: args.nowMs,
        revokeReason: args.reason,
        updatedAt: args.nowMs,
      });
    }
  },
});
