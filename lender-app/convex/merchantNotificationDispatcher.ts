/**
 * HTTP dispatch for merchant companion channel webhooks (async action).
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const deliveryMethodV = v.union(
  v.literal("SMS"),
  v.literal("EMAIL"),
  v.literal("INTERNAL"),
);

/**
 * POST one pre-built JSON body. Never blocks the product mutation path.
 */
export const dispatchMerchantChannel = internalAction({
  args: {
    organizationId: v.id("organizations"),
    url: v.string(),
    event: v.string(),
    context: v.string(),
    deliveryMethod: deliveryMethodV,
    isTest: v.boolean(),
    payloadJson: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    result: v.string(),
    httpStatus: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    let httpStatus: number | undefined;
    let result: string;
    let errorMessage: string | undefined;

    try {
      const res = await fetch(args.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-LFE-Merchant-Event": args.event,
          "X-LFE-Delivery-Method": args.deliveryMethod,
          "X-LFE-Is-Test": args.isTest ? "true" : "false",
        },
        body: args.payloadJson,
      });
      httpStatus = res.status;
      if (res.ok) {
        result = "sent";
      } else {
        const snippet = (await res.text()).slice(0, 240);
        result = `error:http_${res.status}`;
        errorMessage = snippet || `HTTP ${res.status}`;
      }
    } catch (err) {
      result = "error:network";
      errorMessage = err instanceof Error ? err.message : "Network error";
    }

    await ctx.runMutation(internal.merchantNotifications.writeDeliveryLog, {
      organizationId: args.organizationId,
      event: args.event,
      context: args.context,
      deliveryMethod: args.deliveryMethod,
      result,
      isTest: args.isTest,
      httpStatus,
      errorMessage,
      payload: args.payloadJson.slice(0, 8000),
    });

    return {
      ok: result === "sent",
      result,
      httpStatus,
    };
  },
});
