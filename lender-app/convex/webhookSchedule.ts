import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { notificationEventV } from "./notificationConstants";

/** Schedule a single webhook delivery (breaks circular types with the action). */
export const scheduleDispatch = internalMutation({
  args: {
    webhookId: v.id("webhooks"),
    event: notificationEventV,
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.webhookDispatcher.dispatchWebhook, {
      webhookId: args.webhookId,
      event: args.event,
      data: args.data,
      attempt: 1,
    });
    return { ok: true as const };
  },
});
