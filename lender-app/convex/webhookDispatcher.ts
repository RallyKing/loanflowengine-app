import { internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  MAX_WEBHOOK_DELIVERY_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
  notificationEventV,
} from "./notificationConstants";
import { buildEventPayload } from "../lib/notifications/webhookPayloadTemplates";

type DispatchWebhookResult =
  | { ok: false; reason: string }
  | { ok: boolean; httpStatus?: number; retryScheduled?: boolean };

function isClientError(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500;
}

function isRetryableFailure(httpStatus: number | undefined, networkError: boolean): boolean {
  if (networkError) return true;
  if (httpStatus == null) return true;
  return httpStatus >= 500;
}

function retryDelayMs(nextAttempt: number): number {
  if (nextAttempt <= 1) return 0;
  return WEBHOOK_RETRY_DELAYS_MS[nextAttempt - 2] ?? WEBHOOK_RETRY_DELAYS_MS[1]!;
}

async function persistDeliveryResult(
  ctx: ActionCtx,
  args: {
    webhook: Doc<"webhooks">;
    webhookId: Id<"webhooks">;
    event: string;
    body: string;
    attempt: number;
    logId?: Id<"webhook_logs">;
    status: "success" | "failed" | "retrying";
    httpStatus?: number;
    errorMessage?: string;
    nextRetryAt?: number;
  },
): Promise<Id<"webhook_logs">> {
  if (args.logId) {
    await ctx.runMutation(internal.webhookInternals.patchWebhookLog, {
      logId: args.logId,
      status: args.status,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
      attempts: args.attempt,
      nextRetryAt: args.nextRetryAt,
      payload: args.body,
    });
    return args.logId;
  }

  return await ctx.runMutation(internal.webhookInternals.writeWebhookLog, {
    webhookId: args.webhookId,
    organizationId: args.webhook.organizationId,
    event: args.event,
    payload: args.body,
    status: args.status,
    httpStatus: args.httpStatus,
    errorMessage: args.errorMessage,
    attempts: args.attempt,
    nextRetryAt: args.nextRetryAt,
  });
}

/**
 * Execute a single HTTP POST to a registered webhook endpoint.
 * Runs in an action context (fetch allowed).
 */
export const dispatchWebhook = internalAction({
  args: {
    webhookId: v.id("webhooks"),
    event: notificationEventV,
    data: v.optional(v.any()),
    attempt: v.optional(v.number()),
    logId: v.optional(v.id("webhook_logs")),
  },
  handler: async (
    ctx,
    { webhookId, event, data, attempt, logId },
  ): Promise<DispatchWebhookResult> => {
    const attemptNum = Math.max(1, Math.min(attempt ?? 1, MAX_WEBHOOK_DELIVERY_ATTEMPTS));
    const webhook: Doc<"webhooks"> | null = await ctx.runQuery(
      internal.webhookInternals.getWebhookInternal,
      { webhookId },
    );
    if (!webhook || !webhook.isActive) {
      return { ok: false as const, reason: "inactive_or_missing" };
    }

    const payloadObject = buildEventPayload(event, (data ?? {}) as Record<string, unknown>);
    const body = JSON.stringify(payloadObject);

    try {
      const res: Response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-LFE-Event": event,
          "X-LFE-Webhook-Id": String(webhookId),
          "X-LFE-Attempt": String(attemptNum),
        },
        body,
      });

      if (res.ok) {
        await persistDeliveryResult(ctx, {
          webhook,
          webhookId,
          event,
          body,
          attempt: attemptNum,
          logId,
          status: "success",
          httpStatus: res.status,
        });
        return { ok: true, httpStatus: res.status };
      }

      const errorText = (await res.text()).slice(0, 500);
      if (isClientError(res.status)) {
        await persistDeliveryResult(ctx, {
          webhook,
          webhookId,
          event,
          body,
          attempt: attemptNum,
          logId,
          status: "failed",
          httpStatus: res.status,
          errorMessage: errorText,
        });
        return { ok: false, httpStatus: res.status };
      }

      if (
        isRetryableFailure(res.status, false) &&
        attemptNum < MAX_WEBHOOK_DELIVERY_ATTEMPTS
      ) {
        const nextAttempt = attemptNum + 1;
        const delayMs = retryDelayMs(nextAttempt);
        const nextRetryAt = Date.now() + delayMs;
        const activeLogId = await persistDeliveryResult(ctx, {
          webhook,
          webhookId,
          event,
          body,
          attempt: attemptNum,
          logId,
          status: "retrying",
          httpStatus: res.status,
          errorMessage: errorText,
          nextRetryAt,
        });
        await ctx.scheduler.runAfter(delayMs, internal.webhookDispatcher.dispatchWebhook, {
          webhookId,
          event,
          data,
          attempt: nextAttempt,
          logId: activeLogId,
        });
        return { ok: false, httpStatus: res.status, retryScheduled: true };
      }

      await persistDeliveryResult(ctx, {
        webhook,
        webhookId,
        event,
        body,
        attempt: attemptNum,
        logId,
        status: "failed",
        httpStatus: res.status,
        errorMessage: errorText,
      });
      return { ok: false, httpStatus: res.status };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attemptNum < MAX_WEBHOOK_DELIVERY_ATTEMPTS) {
        const nextAttempt = attemptNum + 1;
        const delayMs = retryDelayMs(nextAttempt);
        const nextRetryAt = Date.now() + delayMs;
        const activeLogId = await persistDeliveryResult(ctx, {
          webhook,
          webhookId,
          event,
          body,
          attempt: attemptNum,
          logId,
          status: "retrying",
          errorMessage: msg.slice(0, 500),
          nextRetryAt,
        });
        await ctx.scheduler.runAfter(delayMs, internal.webhookDispatcher.dispatchWebhook, {
          webhookId,
          event,
          data,
          attempt: nextAttempt,
          logId: activeLogId,
        });
        return { ok: false as const, reason: msg, retryScheduled: true };
      }

      await persistDeliveryResult(ctx, {
        webhook,
        webhookId,
        event,
        body,
        attempt: attemptNum,
        logId,
        status: "failed",
        errorMessage: msg.slice(0, 500),
      });
      return { ok: false as const, reason: msg };
    }
  },
});

/** Smoke test: POST test_ping payload to httpbin (no UI / org required). */
export const verifyFetchProbe = internalAction({
  args: {},
  handler: async (): Promise<{ ok: boolean; httpStatus: number; body: string }> => {
    const body = JSON.stringify(buildEventPayload("test_ping", {}));
    const res: Response = await fetch("https://httpbin.org/post", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });
    const text = await res.text();
    return { ok: res.ok, httpStatus: res.status, body: text.slice(0, 400) };
  },
});
