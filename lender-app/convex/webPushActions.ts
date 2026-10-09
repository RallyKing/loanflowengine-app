"use node";

import webpush from "web-push";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildTimeAlertWebPushPayload,
  buildWebPushPayload,
  isTimeAlertWebPushCategory,
  isWebPushCategory,
} from "./webPushPayload";

const SEND_CONCURRENCY = 3;

type TestPushResult = {
  ok: boolean;
  reason?: string;
  sent?: number;
  pruned?: number;
  failed?: number;
  retryAfterMs?: number;
};

type ClaimTestSubscription = {
  _id: Id<"pushSubscriptions">;
  endpoint: string;
  keysP256dh: string;
  keysAuth: string;
};

type ClaimTestSendResult =
  | {
      ok: true;
      subscriptions: ClaimTestSubscription[];
    }
  | {
      ok: false;
      reason: "no_subscription" | "rate_limited";
      retryAfterMs?: number;
    };

function vapidConfigured(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

type FanOutCtx = {
  runMutation: (
    // Convex FunctionReference identity is structural; keep loose for shared helper.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref: any,
    args: { id: Id<"pushSubscriptions"> },
  ) => Promise<unknown>;
};

async function fanOutToSubscriptions(
  ctx: FanOutCtx,
  args: {
    vapid: { publicKey: string; privateKey: string; subject: string };
    body: string;
    subs: Array<{
      _id: Id<"pushSubscriptions">;
      endpoint: string;
      keysP256dh: string;
      keysAuth: string;
    }>;
  },
): Promise<{ sent: number; pruned: number; failed: number }> {
  webpush.setVapidDetails(
    args.vapid.subject,
    args.vapid.publicKey,
    args.vapid.privateKey,
  );

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (let i = 0; i < args.subs.length; i += SEND_CONCURRENCY) {
    const batch = args.subs.slice(i, i + SEND_CONCURRENCY);
    await Promise.all(
      batch.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keysP256dh,
                auth: sub.keysAuth,
              },
            },
            args.body,
            { TTL: 60 * 60 },
          );
          sent += 1;
          await ctx.runMutation(internal.pushSubscriptions.internalMarkSuccess, {
            id: sub._id,
          });
        } catch (err: unknown) {
          const statusCode =
            err &&
            typeof err === "object" &&
            "statusCode" in err &&
            typeof (err as { statusCode: unknown }).statusCode === "number"
              ? (err as { statusCode: number }).statusCode
              : undefined;
          if (statusCode === 404 || statusCode === 410) {
            pruned += 1;
            await ctx.runMutation(internal.pushSubscriptions.internalDelete, {
              id: sub._id,
            });
            return;
          }
          failed += 1;
          console.error("webPush send failed", statusCode, err);
        }
      }),
    );
  }

  return { sent, pruned, failed };
}

/**
 * Event-driven Web Push for one `userNotifications` row.
 * Scheduled from `dispatchUserNotification` — never from a cron fan-out.
 */
export const trySendWebPush = internalAction({
  args: { notificationId: v.id("userNotifications") },
  handler: async (ctx, { notificationId }) => {
    const vapid = vapidConfigured();
    if (!vapid) {
      console.warn(
        "webPush: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set; skip.",
      );
      return { ok: false as const, reason: "no_vapid" };
    }

    const row = await ctx.runQuery(internal.notifications.internalGetNotification, {
      notificationId,
    });
    if (!row) return { ok: false as const, reason: "not_found" };
    if (row.pushDispatchedAt != null) {
      return { ok: false as const, reason: "already_sent" };
    }
    if (!isWebPushCategory(row.category)) {
      return { ok: false as const, reason: "category_not_enabled" };
    }

    const subs = await ctx.runQuery(
      internal.pushSubscriptions.internalListForUser,
      { memberUserKey: row.userKey, limit: 8 },
    );
    if (subs.length === 0) {
      return { ok: false as const, reason: "no_subscription" };
    }

    const payload = buildWebPushPayload({
      _id: String(row._id),
      category: row.category,
      summary: row.summary,
      detail: row.detail,
      taskId: row.taskId ? String(row.taskId) : undefined,
      fileId: row.fileId ? String(row.fileId) : undefined,
      lenderId: row.lenderId ? String(row.lenderId) : undefined,
      libraryDocumentId: row.libraryDocumentId
        ? String(row.libraryDocumentId)
        : undefined,
      documentVaultFileTaskId: row.documentVaultFileTaskId
        ? String(row.documentVaultFileTaskId)
        : undefined,
    });
    const body = JSON.stringify(payload);
    const { sent, pruned, failed } = await fanOutToSubscriptions(ctx, {
      vapid,
      body,
      subs,
    });

    await ctx.runMutation(internal.notifications.internalMarkPushDispatched, {
      notificationId,
    });

    return {
      ok: sent > 0,
      sent,
      pruned,
      failed,
      reason: sent > 0 ? ("sent" as const) : ("all_failed" as const),
    };
  },
});

/**
 * Event-driven Web Push for one Time Alerts (`alerts`) row.
 * Scheduled from `insertAlertIdempotent` — one-shot, never polled.
 */
export const trySendTimeAlertWebPush = internalAction({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, { alertId }) => {
    const vapid = vapidConfigured();
    if (!vapid) {
      console.warn(
        "webPush time-alert: VAPID not set; skip.",
      );
      return { ok: false as const, reason: "no_vapid" };
    }

    const row = await ctx.runQuery(internal.alerts.internalGetAlert, {
      alertId,
    });
    if (!row) return { ok: false as const, reason: "not_found" };
    if (row.pushDispatchedAt != null) {
      return { ok: false as const, reason: "already_sent" };
    }
    if (!isTimeAlertWebPushCategory(row.category)) {
      return { ok: false as const, reason: "category_not_enabled" };
    }

    const subs = await ctx.runQuery(
      internal.pushSubscriptions.internalListForUser,
      { memberUserKey: row.userKey, limit: 8 },
    );
    if (subs.length === 0) {
      await ctx.runMutation(internal.alerts.internalMarkPushDispatched, {
        alertId,
      });
      return { ok: false as const, reason: "no_subscription" };
    }

    const payload = buildTimeAlertWebPushPayload({
      _id: String(row._id),
      category: row.category,
      title: row.title,
      body: row.body,
      deepLinkPath: row.deepLinkPath,
    });
    const body = JSON.stringify(payload);
    const { sent, pruned, failed } = await fanOutToSubscriptions(ctx, {
      vapid,
      body,
      subs,
    });

    await ctx.runMutation(internal.alerts.internalMarkPushDispatched, {
      alertId,
    });

    return {
      ok: sent > 0,
      sent,
      pruned,
      failed,
      reason: sent > 0 ? ("sent" as const) : ("all_failed" as const),
    };
  },
});

/**
 * Settings “Send test notification” — one web-push to the caller’s stored
 * subscriptions only.
 */
export const sendTestPush = action({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
    sent: v.optional(v.number()),
    pruned: v.optional(v.number()),
    failed: v.optional(v.number()),
    retryAfterMs: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<TestPushResult> => {
    const claim = (await ctx.runMutation(api.pushSubscriptions.claimTestSend, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
    })) as ClaimTestSendResult;

    if (!claim.ok) {
      return {
        ok: false,
        reason: claim.reason,
        retryAfterMs:
          claim.reason === "rate_limited" ? claim.retryAfterMs : undefined,
      };
    }

    const vapid = vapidConfigured();
    if (!vapid) {
      return { ok: false, reason: "no_vapid" };
    }

    const body = JSON.stringify({
      title: "Loan Flow Engine test",
      body: "Push is working.",
      url: "/settings",
      tag: "web-push-test",
    });

    const { sent, pruned, failed } = await fanOutToSubscriptions(ctx, {
      vapid,
      body,
      subs: claim.subscriptions,
    });

    return {
      ok: sent > 0,
      sent,
      pruned,
      failed,
      reason: sent > 0 ? "sent" : "all_failed",
    };
  },
});
