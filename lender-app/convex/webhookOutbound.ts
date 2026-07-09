import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { assertOrgPermission } from "./organizationAccess";
import { randomHexSync } from "./integrationCrypto";
import {
  assertHttpsWebhookUrl,
  buildWebhookEnvelopeV1,
  newWebhookEventId,
  OUTBOUND_WEBHOOK_EVENT_TYPES,
  sanitizeOutboundWebhookEventTypes,
} from "../lib/webhooks/outboundEnvelope";

export const DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS = 8;

function backoffMs(attemptCount: number): number {
  const base = 1000 * Math.pow(2, Math.max(0, attemptCount - 1));
  return Math.min(300_000, base);
}

function serializePipelineForWebhook(file: Doc<"pipeline">): Record<string, unknown> {
  return {
    fileId: file._id,
    fileName: file.fileName,
    status: file.status,
    fundingAmount: file.fundingAmount,
    rate: file.rate,
    term: file.term,
    propertyAddress: file.propertyAddress,
    organizationId: file.organizationId,
    assigneeId: file.assigneeId,
    archivedAt: file.archivedAt,
    projectIntoLedger: file.projectIntoLedger,
    intakeSheetId: file.intakeSheetId,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

const patchContextValidator = v.optional(
  v.object({
    changedKeys: v.optional(v.array(v.string())),
    previousStatus: v.optional(v.string()),
    nextStatus: v.optional(v.string()),
    automationRuleId: v.optional(v.string()),
    triggerType: v.optional(v.string()),
    automationSource: v.optional(
      v.union(v.literal("user_workflow"), v.literal("org_inbound")),
    ),
  }),
);

/**
 * Queue webhook deliveries for all matching active subscriptions.
 * Invoked via scheduler from product mutations (never blocks on HTTP).
 */
export const emitOrgWebhookEvent = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    patchContext: patchContextValidator,
    /** When `resourceType` is `pipeline`, omit full row snapshot (reference ids only). */
    includePipelineSnapshot: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("outboundWebhookSubscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const matching = subs.filter(
      (s) => s.eventTypes.includes("*") || s.eventTypes.includes(args.eventType),
    );
    if (matching.length === 0) return { deliveries: 0 };

    let data: Record<string, unknown> = {};
    if (args.resourceType === "pipeline") {
      const file = await ctx.db.get(args.resourceId as Id<"pipeline">);
      if (!file || file.organizationId !== args.organizationId) {
        return { deliveries: 0 };
      }
      const fullSnap = args.includePipelineSnapshot !== false;
      data = fullSnap
        ? serializePipelineForWebhook(file)
        : {
            fileId: file._id,
            organizationId: file.organizationId,
          };
    } else {
      data = { resourceType: args.resourceType, resourceId: args.resourceId };
    }

    const pc = args.patchContext;
    if (pc?.changedKeys?.length) {
      data.changedKeys = pc.changedKeys;
    }
    if (pc?.previousStatus !== undefined) {
      data.previousStatus = pc.previousStatus;
    }
    if (pc?.nextStatus !== undefined) {
      data.nextStatus = pc.nextStatus;
    }
    if (pc?.automationRuleId !== undefined) {
      data.automationRuleId = pc.automationRuleId;
    }
    if (pc?.triggerType !== undefined) {
      data.triggerType = pc.triggerType;
    }
    if (pc?.automationSource !== undefined) {
      data.automationSource = pc.automationSource;
    }

    const eventId = newWebhookEventId();
    const envelope = buildWebhookEnvelopeV1({
      eventId,
      type: args.eventType,
      organizationId: String(args.organizationId),
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      data,
    });

    const now = Date.now();
    let deliveries = 0;
    for (const sub of matching) {
      const deliveryId = await ctx.db.insert("outboundWebhookDeliveries", {
        subscriptionId: sub._id,
        organizationId: args.organizationId,
        eventId,
        eventType: args.eventType,
        payload: envelope,
        status: "pending",
        attemptCount: 0,
        maxAttempts: DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("outboundWebhookDeliveryLogs", {
        deliveryId,
        organizationId: args.organizationId,
        at: now,
        level: "info",
        step: "queued",
        detail: `subscription=${sub.publicId} event=${args.eventType}`,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.webhookOutboundWorker.executeOutboundWebhookDelivery,
        { deliveryId },
      );
      deliveries += 1;
    }
    return { deliveries };
  },
});

export const appendDeliveryLog = internalMutation({
  args: {
    deliveryId: v.id("outboundWebhookDeliveries"),
    organizationId: v.id("organizations"),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    step: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("outboundWebhookDeliveryLogs", {
      deliveryId: args.deliveryId,
      organizationId: args.organizationId,
      at: Date.now(),
      level: args.level,
      step: args.step,
      detail: args.detail?.slice(0, 4000),
    });
  },
});

export const getDelivery = internalQuery({
  args: { deliveryId: v.id("outboundWebhookDeliveries") },
  handler: async (ctx, { deliveryId }) => ctx.db.get(deliveryId),
});

export const getSubscription = internalQuery({
  args: { subscriptionId: v.id("outboundWebhookSubscriptions") },
  handler: async (ctx, { subscriptionId }) => ctx.db.get(subscriptionId),
});

export const tryClaimDelivery = internalMutation({
  args: { deliveryId: v.id("outboundWebhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const d = await ctx.db.get(deliveryId);
    const now = Date.now();
    if (!d || d.status !== "pending" || d.nextAttemptAt > now) {
      return { claimed: false as const };
    }
    await ctx.db.patch(deliveryId, {
      status: "running",
      startedAt: now,
      attemptCount: d.attemptCount + 1,
      updatedAt: now,
      lastError: undefined,
    });
    return { claimed: true as const };
  },
});

export const completeDelivery = internalMutation({
  args: {
    deliveryId: v.id("outboundWebhookDeliveries"),
    httpStatus: v.number(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { deliveryId, httpStatus, detail }) => {
    const now = Date.now();
    await ctx.db.patch(deliveryId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
      lastHttpStatus: httpStatus,
      lastError: detail?.slice(0, 4000),
    });
  },
});

export const failDelivery = internalMutation({
  args: {
    deliveryId: v.id("outboundWebhookDeliveries"),
    errorMessage: v.string(),
    httpStatus: v.optional(v.number()),
  },
  handler: async (ctx, { deliveryId, errorMessage, httpStatus }) => {
    const d = await ctx.db.get(deliveryId);
    if (!d) return { scheduled: false as const, dead: false as const };
    const now = Date.now();

    if (d.attemptCount >= d.maxAttempts) {
      await ctx.db.patch(deliveryId, {
        status: "dead",
        lastError: errorMessage.slice(0, 4000),
        lastHttpStatus: httpStatus,
        updatedAt: now,
        completedAt: now,
      });
      return { scheduled: false as const, dead: true as const };
    }

    const delay = backoffMs(d.attemptCount);
    await ctx.db.patch(deliveryId, {
      status: "pending",
      lastError: errorMessage.slice(0, 4000),
      lastHttpStatus: httpStatus,
      nextAttemptAt: now + delay,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      delay,
      internal.webhookOutboundWorker.executeOutboundWebhookDelivery,
      { deliveryId },
    );
    return { scheduled: true as const, dead: false as const };
  },
});

export const sweepOutboundWebhookDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_status_next", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("nextAttemptAt"), now))
      .take(40);
    for (const d of due) {
      await ctx.scheduler.runAfter(
        0,
        internal.webhookOutboundWorker.executeOutboundWebhookDelivery,
        { deliveryId: d._id },
      );
    }
    return { scheduled: due.length };
  },
});

export const recoverStaleOutboundDeliveries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    const running = await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_status_next", (q) => q.eq("status", "running"))
      .take(80);
    let recovered = 0;
    for (const d of running) {
      if (d.startedAt == null || d.startedAt >= cutoff) continue;
      await ctx.db.patch(d._id, {
        status: "pending",
        nextAttemptAt: Date.now(),
        lastError: "stale_running_recovered",
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.webhookOutboundWorker.executeOutboundWebhookDelivery,
        { deliveryId: d._id },
      );
      recovered += 1;
    }
    return { recovered };
  },
});

// ---------- Admin (org Settings) ----------

export const createOutboundWebhookSubscription = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    name: v.string(),
    targetUrl: v.string(),
    eventTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const label = args.name.trim();
    if (!label) throw new Error("Name is required.");
    assertHttpsWebhookUrl(args.targetUrl);
    const types = sanitizeOutboundWebhookEventTypes(args.eventTypes);
    if (!types.length) throw new Error("Select at least one event type.");
    const now = Date.now();
    const publicId = randomHexSync(8);
    const signingSecret = randomHexSync(32);
    const id = await ctx.db.insert("outboundWebhookSubscriptions", {
      publicId,
      organizationId: args.organizationId,
      name: label,
      targetUrl: args.targetUrl.trim(),
      signingSecret,
      eventTypes: types,
      status: "active",
      createdByUserKey: (args.memberUserKey ?? "").trim(),
      createdAt: now,
      updatedAt: now,
    });
    return {
      subscriptionId: id,
      publicId,
      signingSecret,
    };
  },
});

export const listOutboundWebhookSubscriptions = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const rows = await ctx.db
      .query("outboundWebhookSubscriptions")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();
    return rows
      .map((r) => ({
        id: r._id,
        publicId: r.publicId,
        name: r.name,
        targetUrl: r.targetUrl,
        eventTypes: r.eventTypes,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const setOutboundWebhookSubscriptionStatus = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    subscriptionId: v.id("outboundWebhookSubscriptions"),
    status: v.union(v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const row = await ctx.db.get(args.subscriptionId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Subscription not found.");
    }
    await ctx.db.patch(args.subscriptionId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const rotateOutboundWebhookSigningSecret = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    subscriptionId: v.id("outboundWebhookSubscriptions"),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const row = await ctx.db.get(args.subscriptionId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Subscription not found.");
    }
    const signingSecret = randomHexSync(32);
    await ctx.db.patch(args.subscriptionId, {
      signingSecret,
      updatedAt: Date.now(),
    });
    return { signingSecret };
  },
});

export const listRecentOutboundWebhookDeliveries = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const cap = Math.min(Math.max(limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("outboundWebhookDeliveries")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(cap);
    return rows.map((r) => ({
      id: r._id,
      subscriptionId: r.subscriptionId,
      eventId: r.eventId,
      eventType: r.eventType,
      status: r.status,
      attemptCount: r.attemptCount,
      maxAttempts: r.maxAttempts,
      lastHttpStatus: r.lastHttpStatus,
      lastError: r.lastError,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
  },
});

export const listOutboundWebhookDeliveryLogs = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    deliveryId: v.id("outboundWebhookDeliveries"),
  },
  handler: async (ctx, { organizationId, memberUserKey, deliveryId }) => {
    await assertOrgPermission(
      ctx,
      organizationId,
      memberUserKey,
      "settings.access",
    );
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery || delivery.organizationId !== organizationId) {
      throw new Error("Delivery not found.");
    }
    const logs = await ctx.db
      .query("outboundWebhookDeliveryLogs")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", deliveryId))
      .order("asc")
      .collect();
    return logs.map((l) => ({
      at: l.at,
      level: l.level,
      step: l.step,
      detail: l.detail,
    }));
  },
});

/** Labels for Settings UI when picking subscribed events. */
export const getOutboundWebhookEventTypes = query({
  args: {},
  handler: async () => [...OUTBOUND_WEBHOOK_EVENT_TYPES],
});
