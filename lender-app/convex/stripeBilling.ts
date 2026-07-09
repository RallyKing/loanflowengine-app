/**
 * Stripe subscription billing (org-scoped).
 *
 * Dashboard setup (you must create the Stripe account / products in Stripe):
 * 1. Create a Stripe account at https://dashboard.stripe.com
 * 2. Products → add three recurring products (Basic, Pro, Enterprise) with monthly
 *    (or yearly) prices; copy each Price id (`price_…`).
 * 3. Developers → Webhooks → add endpoint:
 *    `https://<your-deployment>.convex.site/webhooks/stripe`
 *    Enable events: `checkout.session.completed`, `customer.subscription.created`,
 *    `customer.subscription.updated`, `customer.subscription.deleted`,
 *    `customer.subscription.paused`, `customer.subscription.resumed`.
 * 4. Convex Dashboard → Settings → Environment variables:
 *    - STRIPE_SECRET_KEY (secret)
 *    - STRIPE_WEBHOOK_SECRET (from the webhook “Signing secret”)
 *    - STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE
 *    - SITE_URL (e.g. https://app.example.com) for Checkout / Portal return URLs
 *
 * Security: secret keys and webhook verification run only on Convex; never ship
 * STRIPE_SECRET_KEY to the client.
 */
import { v } from "convex/values";
import Stripe from "stripe";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrgMember, resolveMemberUserKey } from "./organizationAccess";
import { planFromStripePriceId } from "../lib/stripePriceMap";
import type { OrganizationPlan } from "../lib/orgPlanFeatures";

const organizationPlanV = v.union(
  v.literal("basic"),
  v.literal("pro"),
  v.literal("enterprise"),
);

function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, {
    typescript: true,
  });
}

function siteBaseUrl(): string {
  return (
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3004"
  );
}

export const billingConfigured = query({
  args: {},
  handler: async () => ({
    configured: Boolean(
      process.env.STRIPE_SECRET_KEY?.trim() &&
        process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
        process.env.STRIPE_PRICE_BASIC?.trim() &&
        process.env.STRIPE_PRICE_PRO?.trim() &&
        process.env.STRIPE_PRICE_ENTERPRISE?.trim(),
    ),
  }),
});

export const assertManageBillingForAction = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(
      ctx,
      args.organizationId,
      args.memberUserKey,
      "org.roles.manage",
    );
    return true;
  },
});

export const getOrgByIdInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => ctx.db.get(organizationId),
});

export const findOrgByStripeCustomer = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, { stripeCustomerId }) => {
    if (!stripeCustomerId.trim()) return null;
    return await ctx.db
      .query("organizations")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", stripeCustomerId.trim()),
      )
      .first();
  },
});

export const setStripeCustomerIdOnly = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, { organizationId, stripeCustomerId }) => {
    await ctx.db.patch(organizationId, {
      stripeCustomerId: stripeCustomerId.trim(),
      updatedAt: Date.now(),
    });
  },
});

/** Apply subscription state from Stripe webhooks or post-checkout sync. */
export const syncOrganizationSubscription = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    subscriptionCancelAtPeriodEnd: v.optional(v.boolean()),
    priceId: v.optional(v.string()),
    currentPeriodEndSec: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const status = (args.subscriptionStatus ?? "").trim();
    const terminal =
      status === "canceled" ||
      status === "unpaid" ||
      status === "incomplete_expired" ||
      !args.stripeSubscriptionId?.trim();

    const mapped =
      !terminal && args.priceId
        ? planFromStripePriceId(args.priceId)
        : null;
    let plan: OrganizationPlan = mapped ?? "basic";

    if (terminal) {
      plan = "basic";
    } else if (!mapped && args.priceId?.trim()) {
      plan = "basic";
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      stripeCustomerId: args.stripeCustomerId.trim(),
      plan,
      planSource: "stripe",
      updatedAt: now,
    };

    if (args.stripeSubscriptionId?.trim()) {
      patch.stripeSubscriptionId = args.stripeSubscriptionId.trim();
    } else {
      patch.stripeSubscriptionId = undefined;
    }

    if (args.subscriptionStatus !== undefined) {
      patch.subscriptionStatus = args.subscriptionStatus.trim() || undefined;
    }

    if (args.subscriptionCancelAtPeriodEnd !== undefined) {
      patch.subscriptionCancelAtPeriodEnd =
        args.subscriptionCancelAtPeriodEnd;
    }
    if (terminal) {
      patch.subscriptionCancelAtPeriodEnd = undefined;
    }

    if (args.priceId?.trim()) {
      patch.stripePriceId = args.priceId.trim();
    } else if (terminal) {
      patch.stripePriceId = undefined;
    }

    if (args.currentPeriodEndSec != null && args.currentPeriodEndSec > 0) {
      patch.subscriptionCurrentPeriodEnd =
        args.currentPeriodEndSec * 1000;
    } else if (terminal) {
      patch.subscriptionCurrentPeriodEnd = undefined;
    }

    await ctx.db.patch(args.organizationId, patch);
  },
});

export const billingSummary = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    await assertOrgMember(ctx, organizationId, key);
    const org = await ctx.db.get(organizationId);
    if (!org) return null;
    return {
      plan: org.plan ?? null,
      planSource: org.planSource ?? null,
      stripeCustomerId: org.stripeCustomerId ?? null,
      stripeSubscriptionId: org.stripeSubscriptionId ?? null,
      subscriptionStatus: org.subscriptionStatus ?? null,
      subscriptionCurrentPeriodEnd: org.subscriptionCurrentPeriodEnd ?? null,
      stripePriceId: org.stripePriceId ?? null,
      subscriptionCancelAtPeriodEnd:
        org.subscriptionCancelAtPeriodEnd ?? null,
    };
  },
});

export const createSubscriptionCheckout = action({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    targetPlan: organizationPlanV,
  },
  handler: async (
    ctx,
    { organizationId, memberUserKey, targetPlan },
  ): Promise<
    | { ok: true; url: string }
    | { ok: false; error: string }
  > => {
    await ctx.runQuery(api.stripeBilling.assertManageBillingForAction, {
      organizationId,
      memberUserKey,
    });

    const stripe = stripeClient();
    if (!stripe) {
      return { ok: false, error: "Stripe is not configured on the server." };
    }

    const priceId =
      targetPlan === "basic"
        ? process.env.STRIPE_PRICE_BASIC?.trim()
        : targetPlan === "pro"
          ? process.env.STRIPE_PRICE_PRO?.trim()
          : process.env.STRIPE_PRICE_ENTERPRISE?.trim();

    if (!priceId) {
      return {
        ok: false,
        error: `Missing Stripe price id for plan "${targetPlan}" (set STRIPE_PRICE_* on Convex).`,
      };
    }

    const org = await ctx.runQuery(api.organizations.get, {
      organizationId,
      memberUserKey,
    });
    if (!org) {
      return { ok: false, error: "Organization not found or access denied." };
    }

    const existingSubId = org.stripeSubscriptionId?.trim();
    const existingSt = (org.subscriptionStatus ?? "").trim();
    if (
      existingSubId &&
      ["active", "trialing", "past_due", "paused"].includes(existingSt)
    ) {
      return {
        ok: false,
        error:
          "This team already has a subscription. Use “Switch plan” to change tiers, or the billing portal to cancel.",
      };
    }

    let customerId = org.stripeCustomerId?.trim();
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name.slice(0, 256),
        metadata: {
          convexOrganizationId: organizationId,
        },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.stripeBilling.setStripeCustomerIdOnly, {
        organizationId,
        stripeCustomerId: customerId,
      });
    }

    const base = siteBaseUrl().replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/settings?checkout=success#billing`,
      cancel_url: `${base}/settings?checkout=cancel#billing`,
      client_reference_id: organizationId,
      metadata: {
        convexOrganizationId: organizationId,
      },
      subscription_data: {
        metadata: {
          convexOrganizationId: organizationId,
        },
      },
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }
    return { ok: true, url: session.url };
  },
});

export const createBillingPortalSession = action({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { organizationId, memberUserKey },
  ): Promise<
    | { ok: true; url: string }
    | { ok: false; error: string }
  > => {
    await ctx.runQuery(api.stripeBilling.assertManageBillingForAction, {
      organizationId,
      memberUserKey,
    });

    const stripe = stripeClient();
    if (!stripe) {
      return { ok: false, error: "Stripe is not configured on the server." };
    }

    const org = await ctx.runQuery(api.organizations.get, {
      organizationId,
      memberUserKey,
    });
    const customerId = org?.stripeCustomerId?.trim();
    if (!org || !customerId) {
      return {
        ok: false,
        error: "No Stripe customer on file yet. Start a subscription from Checkout first.",
      };
    }

    const base = siteBaseUrl().replace(/\/$/, "");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/settings#billing`,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe did not return a portal URL." };
    }
    return { ok: true, url: session.url };
  },
});

/**
 * Recent invoices for the team’s Stripe customer (hosted invoice + PDF links).
 * Requires `org.roles.manage`.
 */
export const listBillingInvoices = action({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { organizationId, memberUserKey, limit },
  ): Promise<
    | {
        ok: true;
        invoices: Array<{
          id: string;
          number: string | null;
          status: string | null;
          total: number;
          currency: string;
          created: number;
          hostedInvoiceUrl: string | null;
          invoicePdf: string | null;
        }>;
      }
    | { ok: false; error: string }
  > => {
    await ctx.runQuery(api.stripeBilling.assertManageBillingForAction, {
      organizationId,
      memberUserKey,
    });

    const stripe = stripeClient();
    if (!stripe) {
      return {
        ok: false,
        error: "Stripe is not configured on the server.",
      };
    }

    const org = await ctx.runQuery(api.organizations.get, {
      organizationId,
      memberUserKey,
    });
    const customerId = org?.stripeCustomerId?.trim();
    if (!org || !customerId) {
      return {
        ok: false,
        error:
          "No Stripe customer on file yet. Complete a subscription checkout first.",
      };
    }

    const cap = Math.min(Math.max(limit ?? 12, 1), 50);
    const list = await stripe.invoices.list({
      customer: customerId,
      limit: cap,
    });

    const invoices = list.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total: inv.total,
      currency: inv.currency,
      created: inv.created,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
    }));

    return { ok: true, invoices };
  },
});

function subscriptionPayloadFromStripe(sub: Stripe.Subscription): {
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  priceId: string;
  currentPeriodEndSec: number;
  subscriptionCancelAtPeriodEnd: boolean;
} {
  const item = sub.items.data[0];
  let priceId = "";
  if (item?.price) {
    if (typeof item.price === "string") {
      priceId = item.price;
    } else if (typeof item.price === "object" && "id" in item.price) {
      priceId = String(item.price.id);
    }
  }
  return {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    priceId,
    currentPeriodEndSec: sub.current_period_end,
    subscriptionCancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

/**
 * Upgrade/downgrade the org’s **existing** Stripe subscription (prorations).
 * New subscriptions should use `createSubscriptionCheckout`.
 */
export const changeSubscriptionPlan = action({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    targetPlan: organizationPlanV,
  },
  handler: async (
    ctx,
    { organizationId, memberUserKey, targetPlan },
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    await ctx.runQuery(api.stripeBilling.assertManageBillingForAction, {
      organizationId,
      memberUserKey,
    });

    const stripe = stripeClient();
    if (!stripe) {
      return {
        ok: false,
        error: "Stripe is not configured on the server.",
      };
    }

    const priceId =
      targetPlan === "basic"
        ? process.env.STRIPE_PRICE_BASIC?.trim()
        : targetPlan === "pro"
          ? process.env.STRIPE_PRICE_PRO?.trim()
          : process.env.STRIPE_PRICE_ENTERPRISE?.trim();

    if (!priceId) {
      return {
        ok: false,
        error: `Missing Stripe price id for plan "${targetPlan}" (set STRIPE_PRICE_* on Convex).`,
      };
    }

    const org = await ctx.runQuery(api.organizations.get, {
      organizationId,
      memberUserKey,
    });
    if (!org) {
      return {
        ok: false,
        error: "Organization not found or access denied.",
      };
    }

    const subId = org.stripeSubscriptionId?.trim();
    const st = (org.subscriptionStatus ?? "").trim();
    if (
      !subId ||
      !["active", "trialing", "past_due", "paused"].includes(st)
    ) {
      return {
        ok: false,
        error:
          "No active subscription to update. Use checkout to start a subscription first.",
      };
    }

    if (org.stripePriceId?.trim() === priceId) {
      return { ok: true as const };
    }

    try {
      const sub = await stripe.subscriptions.retrieve(subId, {
        expand: ["items.data.price"],
      });
      const item = sub.items.data[0];
      if (!item?.id) {
        return {
          ok: false,
          error: "Could not read subscription line items from Stripe.",
        };
      }

      const orgIdStr = organizationId as string;
      const mergedMeta: Stripe.MetadataParam = {
        ...(sub.metadata && typeof sub.metadata === "object"
          ? (sub.metadata as Stripe.MetadataParam)
          : {}),
        convexOrganizationId: orgIdStr,
      };

      await stripe.subscriptions.update(subId, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: mergedMeta,
      });

      const expanded = await stripe.subscriptions.retrieve(subId, {
        expand: ["items.data.price"],
      });
      const p = subscriptionPayloadFromStripe(expanded);
      const customerId =
        typeof expanded.customer === "string"
          ? expanded.customer
          : expanded.customer.id;

      await ctx.runMutation(internal.stripeBilling.syncOrganizationSubscription, {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: p.stripeSubscriptionId,
        subscriptionStatus: p.subscriptionStatus,
        subscriptionCancelAtPeriodEnd: p.subscriptionCancelAtPeriodEnd,
        priceId: p.priceId,
        currentPeriodEndSec: p.currentPeriodEndSec,
      });

      return { ok: true as const };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Stripe could not update the subscription.",
      };
    }
  },
});

export type StripeWebhookHandlerCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runQuery: (ref: any, args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runMutation: (ref: any, args: any) => Promise<any>;
};

/** Called from `http.ts` only — keeps webhook logic testable. */
export async function processStripeWebhookEvent(
  ctx: StripeWebhookHandlerCtx,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;

      const orgIdRaw =
        session.metadata?.convexOrganizationId?.trim() ||
        session.client_reference_id?.trim();
      if (!orgIdRaw) return;

      const organizationId = orgIdRaw as Id<"organizations">;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!customerId || !subscriptionId) return;

      const stripe = stripeClient();
      if (!stripe) return;

      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });
      const p = subscriptionPayloadFromStripe(sub);

      await ctx.runMutation(internal.stripeBilling.syncOrganizationSubscription, {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: p.stripeSubscriptionId,
        subscriptionStatus: p.subscriptionStatus,
        subscriptionCancelAtPeriodEnd: p.subscriptionCancelAtPeriodEnd,
        priceId: p.priceId,
        currentPeriodEndSec: p.currentPeriodEndSec,
      });
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string"
          ? sub.customer
          : sub.customer.id;

      const orgFromCustomer = (await ctx.runQuery(
        internal.stripeBilling.findOrgByStripeCustomer,
        { stripeCustomerId: customerId },
      )) as { _id: Id<"organizations"> } | null;

      const mdId = sub.metadata?.convexOrganizationId?.trim();
      let organizationId: Id<"organizations"> | null =
        orgFromCustomer?._id ?? null;

      if (!organizationId && mdId) {
        const row = (await ctx.runQuery(
          internal.stripeBilling.getOrgByIdInternal,
          { organizationId: mdId as Id<"organizations"> },
        )) as { _id: Id<"organizations"> } | null;
        organizationId = row?._id ?? null;
      }

      if (!organizationId) return;

      if (event.type === "customer.subscription.deleted") {
        await ctx.runMutation(internal.stripeBilling.syncOrganizationSubscription, {
          organizationId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: undefined,
          subscriptionStatus: "canceled",
          subscriptionCancelAtPeriodEnd: undefined,
          priceId: undefined,
          currentPeriodEndSec: undefined,
        });
        return;
      }

      const p = subscriptionPayloadFromStripe(sub);
      await ctx.runMutation(internal.stripeBilling.syncOrganizationSubscription, {
        organizationId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: p.stripeSubscriptionId,
        subscriptionStatus: p.subscriptionStatus,
        subscriptionCancelAtPeriodEnd: p.subscriptionCancelAtPeriodEnd,
        priceId: p.priceId,
        currentPeriodEndSec: p.currentPeriodEndSec,
      });
      break;
    }
    default:
      break;
  }
}
