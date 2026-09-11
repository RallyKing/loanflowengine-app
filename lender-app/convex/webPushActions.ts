"use node";

import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  buildWebPushPayload,
  isWebPushCategory,
} from "./webPushPayload";

const SEND_CONCURRENCY = 3;

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

/**
 * Event-driven Web Push send for one `userNotifications` row.
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

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

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

    let sent = 0;
    let pruned = 0;
    let failed = 0;

    for (let i = 0; i < subs.length; i += SEND_CONCURRENCY) {
      const batch = subs.slice(i, i + SEND_CONCURRENCY);
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
              body,
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
