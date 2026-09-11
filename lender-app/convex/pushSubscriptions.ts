import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgMemberKey } from "./authUtils";
import { requireAuthenticatedCaller } from "./callerAuth";

/**
 * Persist a browser PushSubscription for the signed-in member.
 * Idempotent on endpoint (updates keys / org / user if the same endpoint re-subscribes).
 */
export const upsert = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    endpoint: v.string(),
    keysP256dh: v.string(),
    keysAuth: v.string(),
    userAgent: v.optional(v.string()),
    expirationTime: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const endpoint = args.endpoint.trim();
    const p256dh = args.keysP256dh.trim();
    const auth = args.keysAuth.trim();
    if (!endpoint || !p256dh || !auth) {
      throw new Error("Invalid push subscription");
    }
    if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) {
      throw new Error("Push subscription fields too long");
    }

    const caller = await requireOrgMemberKey(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );

    const now = Date.now();
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        organizationId: args.organizationId,
        memberUserKey: caller,
        keysP256dh: p256dh,
        keysAuth: auth,
        userAgent: args.userAgent?.trim().slice(0, 400) || undefined,
        expirationTime:
          args.expirationTime === null || args.expirationTime === undefined
            ? undefined
            : args.expirationTime,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushSubscriptions", {
      organizationId: args.organizationId,
      memberUserKey: caller,
      endpoint,
      keysP256dh: p256dh,
      keysAuth: auth,
      userAgent: args.userAgent?.trim().slice(0, 400) || undefined,
      expirationTime:
        args.expirationTime === null || args.expirationTime === undefined
          ? undefined
          : args.expirationTime,
      createdAt: now,
    });
  },
});

/** Remove this device's subscription (Settings toggle off / permission revoked). */
export const removeByEndpoint = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const endpoint = args.endpoint.trim();
    if (!endpoint) return { removed: false as const };
    const caller = await requireOrgMemberKey(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (!row) return { removed: false as const };
    if (row.memberUserKey !== caller) {
      throw new Error("Unauthorized");
    }
    await ctx.db.delete(row._id);
    return { removed: true as const };
  },
});

/** Whether this user has any stored push subscription (any device). */
export const hasAnyForUser = query({
  args: {
    memberUserKey: v.string(),
    callerMemberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const target = args.memberUserKey.trim();
    if (!target) return false;
    const caller = await requireAuthenticatedCaller(
      ctx,
      args.callerMemberUserKey ?? target,
    );
    if (caller !== target) throw new Error("Unauthorized");
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("memberUserKey", target))
      .first();
    return Boolean(row);
  },
});

/** Subscriptions for a user — used by the send action (bounded). */
export const internalListForUser = internalQuery({
  args: { memberUserKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { memberUserKey, limit }) => {
    const k = memberUserKey.trim();
    if (!k) return [];
    const cap = Math.min(Math.max(limit ?? 8, 1), 16);
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("memberUserKey", k))
      .take(cap);
  },
});

export const internalDelete = internalMutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row) await ctx.db.delete(id);
  },
});

export const internalMarkSuccess = internalMutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    await ctx.db.patch(id, { lastSuccessAt: Date.now() });
  },
});

/** Minimum spacing between Settings “Send test notification” clicks per user. */
export const TEST_PUSH_COOLDOWN_MS = 60_000;

/**
 * Auth + rate-limit claim for a one-shot test push.
 * Does **not** insert `userNotifications` (avoids re-entering the push path).
 * Called from `webPushActions.sendTestPush` only.
 */
export const claimTestSend = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      subscriptions: v.array(
        v.object({
          _id: v.id("pushSubscriptions"),
          endpoint: v.string(),
          keysP256dh: v.string(),
          keysAuth: v.string(),
        }),
      ),
    }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal("no_subscription"),
        v.literal("rate_limited"),
      ),
      retryAfterMs: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const caller = await requireOrgMemberKey(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const now = Date.now();
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("memberUserKey", caller))
      .take(16);

    if (rows.length === 0) {
      return { ok: false as const, reason: "no_subscription" as const };
    }

    let latestTest = 0;
    for (const row of rows) {
      if (typeof row.lastTestAt === "number" && row.lastTestAt > latestTest) {
        latestTest = row.lastTestAt;
      }
    }
    if (latestTest > 0 && now - latestTest < TEST_PUSH_COOLDOWN_MS) {
      return {
        ok: false as const,
        reason: "rate_limited" as const,
        retryAfterMs: TEST_PUSH_COOLDOWN_MS - (now - latestTest),
      };
    }

    for (const row of rows) {
      await ctx.db.patch(row._id, { lastTestAt: now });
    }

    return {
      ok: true as const,
      subscriptions: rows.map((row) => ({
        _id: row._id,
        endpoint: row.endpoint,
        keysP256dh: row.keysP256dh,
        keysAuth: row.keysAuth,
      })),
    };
  },
});
