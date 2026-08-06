/**
 * Merchant channel notification webhooks — settings, schedule helper, logs.
 * SenseBS pattern: one notificationWebhookUrl, separate SMS / EMAIL / INTERNAL POSTs.
 */

import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertOrganizationId } from "./organizationValidators";
import {
  requireOrgReaderKey,
  requireOrgSettingsAdminKey,
} from "./authUtils";
import { ensureOrganizationSettings } from "./organizationSettings";
import { assertHttpsWebhookUrl } from "../lib/webhooks/outboundEnvelope";
import {
  buildMerchantNotificationPayload,
  splitName,
} from "../lib/merchantNotifications/buildPayload";
import type { DeliveryMethod } from "../lib/merchantNotifications/types";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

const deliveryMethodV = v.union(
  v.literal("SMS"),
  v.literal("EMAIL"),
  v.literal("INTERNAL"),
);

const channelFlagsV = v.object({
  enableSms: v.boolean(),
  enableEmail: v.boolean(),
  enableInternal: v.boolean(),
});

const DEFAULT_CHANNELS = {
  enableSms: true,
  enableEmail: true,
  enableInternal: false,
} as const;

async function requireOrgReader(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgReaderKey(
    ctx,
    organizationId,
    memberUserKey,
    "merchantNotifications.requireOrgReader",
  );
}

async function requireOrgSettingsAdmin(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  memberUserKey?: string,
) {
  await assertOrganizationId(ctx, organizationId);
  return requireOrgSettingsAdminKey(
    ctx,
    organizationId,
    memberUserKey,
    "merchantNotifications.requireOrgSettingsAdmin",
  );
}

export type MerchantChannelFlags = {
  enableSms: boolean;
  enableEmail: boolean;
  enableInternal: boolean;
};

export async function readMerchantNotificationConfig(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<{
  notificationWebhookUrl: string | null;
  channels: MerchantChannelFlags;
}> {
  const settings = await ctx.db
    .query("organizationSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  const ch = settings?.merchantNotificationChannels;
  return {
    notificationWebhookUrl: settings?.notificationWebhookUrl?.trim() || null,
    channels: {
      enableSms: ch?.enableSms ?? DEFAULT_CHANNELS.enableSms,
      enableEmail: ch?.enableEmail ?? DEFAULT_CHANNELS.enableEmail,
      enableInternal: ch?.enableInternal ?? DEFAULT_CHANNELS.enableInternal,
    },
  };
}

async function loadOrgName(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
): Promise<{ id: string; name: string; subdomain: string | null }> {
  const org = await ctx.db.get(organizationId);
  return {
    id: String(organizationId),
    name: org?.name?.trim() || "Organization",
    subdomain: null,
  };
}

/**
 * After a successful write: schedule async multi-channel POSTs.
 * Safe to call when URL is missing (logs skipped:no-url).
 */
export async function scheduleMerchantNotificationChannels(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    event: string;
    context: string;
    /** Channels to attempt (filtered further by settings + phone/email). */
    channels?: DeliveryMethod[];
    isTest?: boolean;
    message: string;
    customer: {
      id?: string | null;
      name?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      email?: string | null;
    };
    smsMessage?: string | null;
    subject?: string | null;
    html?: string | null;
    plaintext?: string | null;
    domain?: Record<string, unknown>;
  },
): Promise<void> {
  const config = await readMerchantNotificationConfig(ctx, args.organizationId);
  const org = await loadOrgName(ctx, args.organizationId);
  const nameParts = splitName(args.customer.name);
  const customer = {
    id: args.customer.id ?? null,
    name: args.customer.name?.trim() || nameParts.name,
    firstName: args.customer.firstName?.trim() || nameParts.firstName,
    lastName: args.customer.lastName?.trim() || nameParts.lastName,
    phone: args.customer.phone?.trim() || null,
    email: args.customer.email?.trim() || null,
  };

  const requested: DeliveryMethod[] =
    args.channels ?? (["SMS", "EMAIL", "INTERNAL"] as DeliveryMethod[]);
  const isTest = Boolean(args.isTest);
  const url = config.notificationWebhookUrl;

  for (const method of requested) {
    if (method === "SMS" && !config.channels.enableSms) {
      await insertSkipLog(ctx, {
        organizationId: args.organizationId,
        event: args.event,
        context: args.context,
        deliveryMethod: method,
        result: "skipped:channel-disabled",
        isTest,
      });
      continue;
    }
    if (method === "EMAIL" && !config.channels.enableEmail) {
      await insertSkipLog(ctx, {
        organizationId: args.organizationId,
        event: args.event,
        context: args.context,
        deliveryMethod: method,
        result: "skipped:channel-disabled",
        isTest,
      });
      continue;
    }
    if (method === "INTERNAL" && !config.channels.enableInternal) {
      continue;
    }

    if (!url) {
      await insertSkipLog(ctx, {
        organizationId: args.organizationId,
        event: args.event,
        context: args.context,
        deliveryMethod: method,
        result: "skipped:no-url",
        isTest,
      });
      continue;
    }

    if (method === "SMS") {
      if (!customer.phone) {
        await insertSkipLog(ctx, {
          organizationId: args.organizationId,
          event: args.event,
          context: args.context,
          deliveryMethod: method,
          result: "skipped:no-phone",
          isTest,
        });
        continue;
      }
      if (!args.smsMessage?.trim()) {
        await insertSkipLog(ctx, {
          organizationId: args.organizationId,
          event: args.event,
          context: args.context,
          deliveryMethod: method,
          result: "skipped:no-body",
          isTest,
        });
        continue;
      }
    }

    if (method === "EMAIL") {
      if (!customer.email) {
        await insertSkipLog(ctx, {
          organizationId: args.organizationId,
          event: args.event,
          context: args.context,
          deliveryMethod: method,
          result: "skipped:no-email",
          isTest,
        });
        continue;
      }
      if (!args.subject?.trim() || !args.html?.trim()) {
        await insertSkipLog(ctx, {
          organizationId: args.organizationId,
          event: args.event,
          context: args.context,
          deliveryMethod: method,
          result: "skipped:no-body",
          isTest,
        });
        continue;
      }
    }

    const payload = buildMerchantNotificationPayload({
      event: args.event,
      context: args.context,
      deliveryMethod: method,
      isTest,
      message:
        method === "SMS"
          ? `${args.context} SMS — ${args.message}`
          : method === "EMAIL"
            ? `${args.context} EMAIL — ${args.message}`
            : args.message,
      organization: org,
      customer,
      smsMessage: args.smsMessage,
      subject: args.subject,
      html: args.html,
      plaintext: args.plaintext,
      domain: args.domain,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.merchantNotificationDispatcher.dispatchMerchantChannel,
      {
        organizationId: args.organizationId,
        url,
        event: args.event,
        context: args.context,
        deliveryMethod: method,
        isTest,
        payloadJson: JSON.stringify(payload),
      },
    );
  }
}

async function insertSkipLog(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    event: string;
    context: string;
    deliveryMethod: DeliveryMethod;
    result: string;
    isTest: boolean;
  },
): Promise<void> {
  await ctx.db.insert("merchantNotificationDeliveryLogs", {
    organizationId: args.organizationId,
    event: args.event,
    context: args.context,
    deliveryMethod: args.deliveryMethod,
    result: args.result,
    isTest: args.isTest,
    createdAt: Date.now(),
  });
}

export const getConfig = query({
  args: orgArgs,
  returns: v.object({
    notificationWebhookUrl: v.union(v.string(), v.null()),
    channels: channelFlagsV,
  }),
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    return await readMerchantNotificationConfig(ctx, organizationId);
  },
});

export const updateConfig = mutation({
  args: {
    ...orgArgs,
    notificationWebhookUrl: v.optional(v.union(v.string(), v.null())),
    channels: v.optional(channelFlagsV),
  },
  returns: v.object({
    ok: v.literal(true),
    notificationWebhookUrl: v.union(v.string(), v.null()),
    channels: channelFlagsV,
  }),
  handler: async (ctx, args) => {
    const actor = await requireOrgSettingsAdmin(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const settings = await ensureOrganizationSettings(ctx, args.organizationId);
    const patch: {
      notificationWebhookUrl?: string;
      merchantNotificationChannels?: MerchantChannelFlags;
      updatedAt: number;
      updatedByUserKey: string;
    } = {
      updatedAt: Date.now(),
      updatedByUserKey: actor,
    };

    if (args.notificationWebhookUrl !== undefined) {
      const raw = args.notificationWebhookUrl?.trim() ?? "";
      if (raw) {
        assertHttpsWebhookUrl(raw);
        patch.notificationWebhookUrl = raw;
      } else {
        // Clear by setting empty — Convex optional fields: use empty string as cleared
        patch.notificationWebhookUrl = "";
      }
    }
    if (args.channels) {
      patch.merchantNotificationChannels = args.channels;
    }

    await ctx.db.patch(settings._id, patch);
    const next = await readMerchantNotificationConfig(ctx, args.organizationId);
    return {
      ok: true as const,
      notificationWebhookUrl: next.notificationWebhookUrl,
      channels: next.channels,
    };
  },
});

export const listDeliveryLogs = query({
  args: {
    ...orgArgs,
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("merchantNotificationDeliveryLogs"),
      event: v.string(),
      context: v.string(),
      deliveryMethod: deliveryMethodV,
      result: v.string(),
      isTest: v.boolean(),
      httpStatus: v.optional(v.number()),
      errorMessage: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { organizationId, memberUserKey, limit }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const take = Math.min(Math.max(limit ?? 30, 1), 100);
    const rows = await ctx.db
      .query("merchantNotificationDeliveryLogs")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(take);
    return rows.map((r) => ({
      _id: r._id,
      event: r.event,
      context: r.context,
      deliveryMethod: r.deliveryMethod,
      result: r.result,
      isTest: r.isTest,
      httpStatus: r.httpStatus,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
    }));
  },
});

/** Sample payload JSON for operators (SMS shape by default). */
export const getSamplePayload = query({
  args: {
    ...orgArgs,
    deliveryMethod: v.optional(deliveryMethodV),
  },
  returns: v.string(),
  handler: async (ctx, { organizationId, memberUserKey, deliveryMethod }) => {
    await requireOrgReader(ctx, organizationId, memberUserKey);
    const org = await loadOrgName(ctx, organizationId);
    const method = deliveryMethod ?? "SMS";
    const payload = buildMerchantNotificationPayload({
      event: "merchant_notification_test",
      context: method === "EMAIL" ? "test.email" : "test.sms",
      deliveryMethod: method,
      isTest: true,
      message: "Sample merchant notification payload",
      organization: org,
      customer: {
        id: "cust_sample",
        name: "Jane Doe",
        firstName: "Jane",
        lastName: "Doe",
        phone: "+18185551212",
        email: "jane@example.com",
      },
      smsMessage:
        "Hi Jane! This is a sample SMS from Loan Flow Engine for GHL mapping.",
      subject: "Sample email from Loan Flow Engine",
      html: "<html><body><p>Hi Jane, this is a sample email body.</p></body></html>",
      plaintext: "Hi Jane, this is a sample email body.",
      domain: {
        pipeline: {
          id: "pipeline_sample",
          dealName: "Sample Deal",
          isTest: true,
        },
        links: { trackingUrl: null },
      },
    });
    return JSON.stringify(payload, null, 2);
  },
});

/**
 * Operator test: POST same payload shape with isTest:true to notificationWebhookUrl.
 */
export const sendTest = mutation({
  args: {
    ...orgArgs,
    deliveryMethod: deliveryMethodV,
    /** Optional overrides (staff phone/email for real receiver mapping tests). */
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    result: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireOrgSettingsAdmin(
      ctx,
      args.organizationId,
      args.memberUserKey,
    );
    const config = await readMerchantNotificationConfig(
      ctx,
      args.organizationId,
    );
    if (!config.notificationWebhookUrl) {
      throw new Error(
        "Save a notification webhook URL before sending a test.",
      );
    }

    const first = args.firstName?.trim() || "Test";
    const phone = args.phone?.trim() || "+10000000000";
    const email = args.email?.trim() || "test@example.com";

    if (args.deliveryMethod === "SMS") {
      await scheduleMerchantNotificationChannels(ctx, {
        organizationId: args.organizationId,
        event: "merchant_notification_test",
        context: "test.sms",
        channels: ["SMS"],
        isTest: true,
        message: "Operator send test SMS",
        customer: {
          id: null,
          name: `${first} Operator`,
          firstName: first,
          lastName: "Operator",
          phone,
          email: null,
        },
        smsMessage: `Hi ${first}! This is a TEST SMS from Loan Flow Engine (isTest=true). Do not send to customers from production workflows.`,
      });
      return { ok: true, result: "queued:SMS" };
    }

    if (args.deliveryMethod === "EMAIL") {
      await scheduleMerchantNotificationChannels(ctx, {
        organizationId: args.organizationId,
        event: "merchant_notification_test",
        context: "test.email",
        channels: ["EMAIL"],
        isTest: true,
        message: "Operator send test email",
        customer: {
          id: null,
          name: `${first} Operator`,
          firstName: first,
          lastName: "Operator",
          phone: null,
          email,
        },
        subject: `[TEST] Loan Flow Engine notification`,
        html: `<html><body><p>Hi ${first},</p><p>This is a <strong>test</strong> email from Loan Flow Engine (<code>isTest: true</code>). Production GHL workflows should skip this payload.</p></body></html>`,
        plaintext: `Hi ${first}, This is a test email from Loan Flow Engine (isTest: true).`,
      });
      return { ok: true, result: "queued:EMAIL" };
    }

    await scheduleMerchantNotificationChannels(ctx, {
      organizationId: args.organizationId,
      event: "merchant_notification_test",
      context: "test.internal",
      channels: ["INTERNAL"],
      isTest: true,
      message: "Operator send test INTERNAL",
      customer: {
        id: null,
        name: `${first} Operator`,
        firstName: first,
        lastName: "Operator",
        phone,
        email,
      },
      smsMessage: "Internal companion test",
      subject: "[TEST] Internal companion",
      html: "<p>Internal companion test</p>",
    });
    return { ok: true, result: "queued:INTERNAL" };
  },
});

/** Internal: write delivery result from dispatcher action. */
export const writeDeliveryLog = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    event: v.string(),
    context: v.string(),
    deliveryMethod: deliveryMethodV,
    result: v.string(),
    isTest: v.boolean(),
    httpStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    payload: v.optional(v.string()),
  },
  returns: v.id("merchantNotificationDeliveryLogs"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("merchantNotificationDeliveryLogs", {
      organizationId: args.organizationId,
      event: args.event,
      context: args.context,
      deliveryMethod: args.deliveryMethod,
      result: args.result,
      isTest: args.isTest,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});
