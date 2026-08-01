import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { integrationDispatch } from "./integrationHttp";
import Stripe from "stripe";
import { processStripeWebhookEvent } from "./stripeBilling";

/** 1×1 transparent GIF — never caches so opens can be distinguished per request policy. */
const TRACKING_PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x01, 0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00,
  0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

/**
 * Dropbox Sign (HelloSign) event callback.
 * Configure URL: `https://<deployment>.convex.site/webhooks/signatures/dropbox-sign`
 *
 * Optional `DROPBOX_SIGN_WEBHOOK_SECRET`: verify `X-HelloSign-Signature` as hex HMAC-SHA256 of body.
 */
async function webhookVerified(
  body: string,
  signatureHeader: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret?.trim()) {
    return process.env.CONVEX_ALLOW_UNSIGNED_WEBHOOKS === "1";
  }
  if (!signatureHeader?.trim()) {
    return false;
  }
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  const mac = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = signatureHeader.trim().toLowerCase();
  const got = mac.toLowerCase();
  if (expected.length !== got.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < got.length; i++) {
    diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const http = httpRouter();

http.route({
  path: "/public/resolve-host",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const raw = url.searchParams.get("hostname")?.trim() ?? "";
    const organizationId = await ctx.runQuery(
      api.organizationCustomDomains.resolveHostToOrganizationId,
      { hostname: raw },
    );
    return new Response(
      JSON.stringify({ organizationId: organizationId ?? null }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  }),
});

http.route({
  path: "/public/resolve-portal-link",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    const route = await ctx.runQuery(api.clientPortalLinks.resolvePortalLinkRoute, {
      token,
    });
    return new Response(JSON.stringify(route), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }),
});

http.route({
  path: "/webhooks/signatures/dropbox-sign",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const sig = request.headers.get("X-HelloSign-Signature");
    const secret = process.env.DROPBOX_SIGN_WEBHOOK_SECRET?.trim();
    if (!secret) {
      console.error(
        "[dropbox-sign-webhook] DROPBOX_SIGN_WEBHOOK_SECRET is unset — rejecting payload (fail-closed).",
      );
      return new Response("webhook secret not configured", { status: 500 });
    }
    if (!(await webhookVerified(raw, sig, secret))) {
      return new Response("invalid signature", { status: 401 });
    }
    await ctx.runMutation(internal.signatures.applyDropboxSignWebhook, {
      rawJson: raw,
    });
    return new Response("Hello API Event Received", { status: 200 });
  }),
});

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!key || !webhookSecret) {
      return new Response("stripe not configured", { status: 503 });
    }
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return new Response("missing stripe-signature", { status: 400 });
    }
    const raw = await request.text();
    let event: Stripe.Event;
    try {
      const stripe = new Stripe(key, { typescript: true });
      event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
    } catch {
      return new Response("invalid webhook signature", { status: 400 });
    }
    try {
      await processStripeWebhookEvent(
        {
          runQuery: ctx.runQuery,
          runMutation: ctx.runMutation,
        },
        event,
      );
    } catch {
      return new Response("webhook handler failed", { status: 500 });
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/email/track",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("t")?.trim() ?? "";
    const ua = request.headers.get("user-agent")?.slice(0, 500);
    await ctx.runMutation(internal.systemEmails.recordOpenFromPixel, {
      openToken: token,
      userAgent: ua ?? undefined,
    });
    return new Response(TRACKING_PIXEL_GIF.buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
      },
    });
  }),
});

http.route({
  path: "/webhooks/system-email/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.SYSTEM_EMAIL_INBOUND_SECRET?.trim();
    const hdr = request.headers.get("X-System-Email-Secret")?.trim();
    if (!secret || hdr !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
    try {
      const raw = await request.text();
      const body = JSON.parse(raw) as {
        correlationId?: unknown;
        snippet?: unknown;
        detail?: unknown;
      };
      await ctx.runMutation(internal.systemEmails.recordInboundReplyFromBridge, {
        correlationId: String(body.correlationId ?? ""),
        snippet:
          typeof body.snippet === "string" ? body.snippet : undefined,
        detail:
          typeof body.detail === "string" ? body.detail : undefined,
      });
    } catch {
      return new Response("bad request", { status: 400 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

const integrationHandler = httpAction(async (ctx, request) =>
  integrationDispatch(ctx, request),
);

const integrationGetPaths = [
  "/api/v1/files",
  "/api/v1/files/detail",
  "/api/v1/contacts",
  "/api/v1/lenders",
  "/api/v1/tasks",
] as const;

for (const path of integrationGetPaths) {
  http.route({ path, method: "GET", handler: integrationHandler });
  http.route({ path, method: "OPTIONS", handler: integrationHandler });
}

http.route({
  path: "/api/v1/oauth/token",
  method: "POST",
  handler: integrationHandler,
});
http.route({
  path: "/api/v1/oauth/token",
  method: "OPTIONS",
  handler: integrationHandler,
});

http.route({
  path: "/api/v1/integrations/webhook",
  method: "POST",
  handler: integrationHandler,
});
http.route({
  path: "/api/v1/integrations/webhook",
  method: "OPTIONS",
  handler: integrationHandler,
});

http.route({
  path: "/api/v1/integrations/jobs",
  method: "POST",
  handler: integrationHandler,
});
http.route({
  path: "/api/v1/integrations/jobs",
  method: "OPTIONS",
  handler: integrationHandler,
});

export default http;
