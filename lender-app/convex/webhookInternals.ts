import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { notificationEventV } from "./notificationConstants";

export const getWebhookInternal = internalQuery({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, { webhookId }) => {
    return await ctx.db.get(webhookId);
  },
});

export const getWebhookLogInternal = internalQuery({
  args: { logId: v.id("webhook_logs") },
  handler: async (ctx, { logId }) => {
    return await ctx.db.get(logId);
  },
});

export const writeWebhookLog = internalMutation({
  args: {
    webhookId: v.id("webhooks"),
    organizationId: v.id("organizations"),
    event: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("retrying"),
    ),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    attempts: v.number(),
    nextRetryAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("webhook_logs", {
      webhookId: args.webhookId,
      organizationId: args.organizationId,
      event: args.event,
      payload: args.payload,
      status: args.status,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
      attempts: args.attempts,
      nextRetryAt: args.nextRetryAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const patchWebhookLog = internalMutation({
  args: {
    logId: v.id("webhook_logs"),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("retrying"),
    ),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    attempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { logId, ...patch } = args;
    await ctx.db.patch(logId, {
      ...patch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Fan-out: queue dispatcher for every active webhook subscribed to `event`.
 * Call from product mutations — never blocks on HTTP.
 */
export const queueEvent = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    event: notificationEventV,
    data: v.optional(v.any()),
  },
  handler: async (ctx, { organizationId, event, data }) => {
    const hooks = await ctx.db
      .query("webhooks")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();

    const matching = hooks.filter(
      (h) => h.isActive && h.subscribedEvents.includes(event),
    );

    for (const hook of matching) {
      await ctx.runMutation(internal.webhookSchedule.scheduleDispatch, {
        webhookId: hook._id,
        event,
        data,
      });
    }

    return { queued: matching.length };
  },
});

/** Insert a throwaway httpbin webhook for dispatcher smoke tests. */
export const seedHttpbinProbeWebhook = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = Date.now();
    const webhookId = await ctx.db.insert("webhooks", {
      organizationId,
      name: "__dispatcher_probe__",
      url: "https://httpbin.org/post",
      isActive: true,
      subscribedEvents: ["test_ping"],
      createdByUserKey: "__system__",
      createdAt: now,
      updatedAt: now,
    });
    return { webhookId };
  },
});

/** Force a failing endpoint to validate retry scheduling. */
export const seedFailingProbeWebhook = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = Date.now();
    const webhookId = await ctx.db.insert("webhooks", {
      organizationId,
      name: "__retry_probe__",
      url: "https://httpbin.org/status/503",
      isActive: true,
      subscribedEvents: ["test_ping"],
      createdByUserKey: "__system__",
      createdAt: now,
      updatedAt: now,
    });
    return { webhookId };
  },
});
