import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createResendEmailAdapter } from "@/lib/comms/emailResendAdapter";

/**
 * Delivers a one-time magic link. Invoked via scheduler from admin mutation;
 * plain token is never persisted beyond this action args.
 */
export const deliverMagicLink = internalAction({
  args: {
    to: v.string(),
    plainToken: v.string(),
    workspaceLabel: v.string(),
    linkExpiresDescription: v.optional(v.string()),
    permissionLabel: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    {
      to,
      plainToken,
      workspaceLabel,
      linkExpiresDescription = "24 hours",
      permissionLabel = "View and upload documents",
    },
  ) => {
    const origin = (
      process.env.CLIENT_PORTAL_ORIGIN?.trim() || "http://127.0.0.1:3004"
    ).replace(/\/$/, "");
    const url = `${origin}/portal/magic?t=${encodeURIComponent(plainToken)}`;

    const subject = `Sign in to your ${workspaceLabel} portal`;
    const text = [
      `You've been invited to your loan file workspace (${workspaceLabel}).`,
      `Access level: ${permissionLabel}.`,
      "",
      `Sign in (this link expires in ${linkExpiresDescription}):`,
      url,
      "",
      "If you did not expect this message, you can ignore it.",
    ].join("\n");

    try {
      await createResendEmailAdapter().send({
        channel: "email",
        providerKey: "resend",
        recipients: [{ value: to.trim() }],
        subject,
        bodyText: text,
      });
      return { ok: true as const };
    } catch (e) {
      console.error("clientPortal email fetch failed", e);
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});
