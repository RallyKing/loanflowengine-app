import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertOrgPermission } from "./organizationAccess";
import {
  NOTIFICATION_EVENT_TYPES,
  notificationEventLabel,
  sanitizeSubscribedEvents,
} from "./notificationConstants";
import { assertHttpsWebhookUrl } from "../lib/webhooks/outboundEnvelope";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";
import { assertCanMutatePipelineRow } from "./organizationAccess";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

export const listWebhooks = query({
  args: {
    organizationId: v.id("organizations"),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    try {
      await assertOrgPermission(
        ctx,
        organizationId,
        memberUserKey,
        "settings.access",
      );
    } catch (err) {
      console.warn("[webhooks.listWebhooks] denied", {
        organizationId: String(organizationId),
        reason: err instanceof Error ? err.message : String(err),
      });
      /** Fail closed for Settings hub `useQuery` — do not crash the page. */
      return [];
    }
    const rows = await ctx.db
      .query("webhooks")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .collect();

    return rows
      .map((r) => ({
        _id: r._id,
        name: r.name,
        url: r.url,
        isActive: r.isActive,
        subscribedEvents: r.subscribedEvents,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listWebhookLogs = query({
  args: {
    organizationId: v.id("organizations"),
    webhookId: v.optional(v.id("webhooks")),
    limit: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, { organizationId, webhookId, limit, memberUserKey }) => {
    try {
      await assertOrgPermission(
        ctx,
        organizationId,
        memberUserKey,
        "settings.access",
      );
    } catch (err) {
      console.warn("[webhooks.listWebhookLogs] denied", {
        organizationId: String(organizationId),
        reason: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
    const cap = Math.min(Math.max(limit ?? 30, 5), 100);

    if (webhookId) {
      const hook = await ctx.db.get(webhookId);
      if (!hook || hook.organizationId !== organizationId) return [];
      const rows = await ctx.db
        .query("webhook_logs")
        .withIndex("by_webhook", (q) => q.eq("webhookId", webhookId))
        .order("desc")
        .take(cap);
      return rows;
    }

    const rows = await ctx.db
      .query("webhook_logs")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(cap);
    return rows;
  },
});

export const createWebhook = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    url: v.string(),
    subscribedEvents: v.array(v.string()),
    ...memberKeyArg,
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
    assertHttpsWebhookUrl(args.url);
    const events = sanitizeSubscribedEvents(args.subscribedEvents);
    if (events.length === 0) {
      throw new Error("Select at least one event subscription.");
    }

    const now = Date.now();
    const id = await ctx.db.insert("webhooks", {
      organizationId: args.organizationId,
      name: label,
      url: args.url.trim(),
      isActive: true,
      subscribedEvents: events,
      createdByUserKey: (args.memberUserKey ?? "").trim() || "__system__",
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true as const, webhookId: id };
  },
});

export const setWebhookActive = mutation({
  args: {
    organizationId: v.id("organizations"),
    webhookId: v.id("webhooks"),
    isActive: v.boolean(),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const row = await ctx.db.get(args.webhookId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Webhook not found.");
    }
    await ctx.db.patch(args.webhookId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Send a test_ping to a single registered endpoint (UI "Ping" button). */
export const sendTestPing = mutation({
  args: {
    organizationId: v.id("organizations"),
    webhookId: v.id("webhooks"),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "settings.access",
    );
    const row = await ctx.db.get(args.webhookId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Webhook not found.");
    }
    if (!row.subscribedEvents.includes("test_ping")) {
      throw new Error('This endpoint is not subscribed to "test_ping".');
    }

    await ctx.runMutation(internal.webhookSchedule.scheduleDispatch, {
      webhookId: args.webhookId,
      event: "test_ping",
      data: {},
    });

    return { ok: true as const, queued: true as const };
  },
});

/** Record broker-side deal package compile (Deal Bible / ZIP compiler). */
export const recordBrokerDealPackageCompiled = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineFileId: v.id("pipeline"),
    packageLabel: v.string(),
    documentCount: v.number(),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline || pipeline.organizationId !== args.organizationId) {
      throw new Error("Pipeline file not found.");
    }
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);
    await scheduleWebhookQueueEvent(ctx, {
      organizationId: args.organizationId,
      event: "deal_package_compiled",
      data: {
        ...webhookVaultContext(args.pipelineFileId, pipelineDealName(pipeline)),
        packageLabel: args.packageLabel.trim() || "Deal package",
        documentCount: args.documentCount,
        source: "broker_compiler",
      },
    });
    return { ok: true as const };
  },
});

/** Event dictionary for UI multi-select. */
export const listNotificationEventTypes = query({
  args: {},
  handler: async () => {
    return NOTIFICATION_EVENT_TYPES.map((id) => ({
      id,
      label: notificationEventLabel(id),
    }));
  },
});
