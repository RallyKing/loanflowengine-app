import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const WINDOW_MS = 15 * 60 * 1000;

type ConsumeResult = { ok: true } | { ok: false; code: "RATE_LIMITED" };

export const consume = internalMutation({
  args: {
    key: v.string(),
    maxPerWindow: v.number(),
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ConsumeResult> => {
    const windowMs = args.windowMs ?? WINDOW_MS;
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
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
      return { ok: true };
    }
    if (row.count >= args.maxPerWindow) {
      return { ok: false, code: "RATE_LIMITED" };
    }
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { ok: true };
  },
});
