import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { WebhookEnvelopeV1 } from "../lib/webhooks/outboundEnvelope";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const executeOutboundWebhookDelivery = internalAction({
  args: { deliveryId: v.id("outboundWebhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const claimed = await ctx.runMutation(
      internal.webhookOutbound.tryClaimDelivery,
      { deliveryId },
    );
    if (!claimed.claimed) return;

    const delivery = await ctx.runQuery(internal.webhookOutbound.getDelivery, {
      deliveryId,
    });
    if (!delivery) return;

    const sub = await ctx.runQuery(internal.webhookOutbound.getSubscription, {
      subscriptionId: delivery.subscriptionId,
    });
    if (!sub) {
      await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
        deliveryId,
        organizationId: delivery.organizationId,
        level: "error",
        step: "subscription_missing",
      });
      await ctx.runMutation(internal.webhookOutbound.failDelivery, {
        deliveryId,
        errorMessage: "subscription_missing",
      });
      return;
    }

    const attempt = delivery.attemptCount;
    const payload = delivery.payload as WebhookEnvelopeV1;
    const body = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const signaturePayload = `${ts}.${body}`;
    let sigHex: string;
    try {
      sigHex = await hmacSha256Hex(sub.signingSecret, signaturePayload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
        deliveryId,
        organizationId: delivery.organizationId,
        level: "error",
        step: "sign_failed",
        detail: msg,
      });
      await ctx.runMutation(internal.webhookOutbound.failDelivery, {
        deliveryId,
        errorMessage: `sign_failed:${msg}`,
      });
      return;
    }

    if (sub.status === "paused") {
      await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
        deliveryId,
        organizationId: delivery.organizationId,
        level: "warn",
        step: "subscription_paused_retry",
        detail: "Subscription paused; will retry with normal backoff.",
      });
      await ctx.runMutation(internal.webhookOutbound.failDelivery, {
        deliveryId,
        errorMessage: "subscription_paused",
      });
      return;
    }

    await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
      deliveryId,
      organizationId: delivery.organizationId,
      level: "info",
      step: "http_post_start",
      detail: `attempt=${attempt} url=${sub.targetUrl.slice(0, 120)}`,
    });

    try {
      const res = await fetch(sub.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Webhook-Delivery-Id": String(deliveryId),
          "X-Webhook-Event-Id": payload.eventId,
          "X-Webhook-Attempt": String(attempt),
          "X-Webhook-Timestamp": ts,
          "X-Webhook-Signature": `sha256=${sigHex}`,
        },
        body,
      });

      const text = await res.text();
      const snippet = text.slice(0, 500);

      if (res.ok) {
        await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
          deliveryId,
          organizationId: delivery.organizationId,
          level: "info",
          step: "http_success",
          detail: `status=${res.status} body=${snippet}`,
        });
        await ctx.runMutation(internal.webhookOutbound.completeDelivery, {
          deliveryId,
          httpStatus: res.status,
          detail: snippet || undefined,
        });
        return;
      }

      await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
        deliveryId,
        organizationId: delivery.organizationId,
        level: "warn",
        step: "http_failure",
        detail: `status=${res.status} body=${snippet}`,
      });
      await ctx.runMutation(internal.webhookOutbound.failDelivery, {
        deliveryId,
        errorMessage: `http_${res.status}:${snippet}`,
        httpStatus: res.status,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.webhookOutbound.appendDeliveryLog, {
        deliveryId,
        organizationId: delivery.organizationId,
        level: "error",
        step: "network_error",
        detail: msg.slice(0, 1000),
      });
      await ctx.runMutation(internal.webhookOutbound.failDelivery, {
        deliveryId,
        errorMessage: `fetch:${msg.slice(0, 2000)}`,
      });
    }
  },
});
