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

export const deliverFileTaskReminder = internalAction({
  args: {
    to: v.string(),
    taskTitle: v.string(),
    isRequired: v.boolean(),
    uploadUrl: v.string(),
    workspaceLabel: v.string(),
  },
  handler: async (_ctx, { to, taskTitle, isRequired, uploadUrl, workspaceLabel }) => {
    const urgency = isRequired ? "Required: " : "";
    const subject = `${urgency}Document request — ${taskTitle}`;
    const text = [
      `${workspaceLabel} is requesting a document for your loan file.`,
      "",
      `Requirement: ${taskTitle}${isRequired ? " (required)" : ""}.`,
      "",
      "Upload securely using this link:",
      uploadUrl,
      "",
      "If you already submitted this document, you can ignore this message.",
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
      console.error("file task reminder email failed", e);
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});

export const deliverCustomInvite = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    bodyText: v.string(),
    workspaceLabel: v.string(),
  },
  handler: async (_ctx, { to, subject, bodyText, workspaceLabel }) => {
    const text = [
      bodyText,
      "",
      `— ${workspaceLabel}`,
      "If you did not expect this message, you can ignore it.",
    ].join("\n");

    try {
      await createResendEmailAdapter().send({
        channel: "email",
        providerKey: "resend",
        recipients: [{ value: to.trim() }],
        subject: subject.trim(),
        bodyText: text,
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});

export const deliverLenderDeliveryInvite = internalAction({
  args: {
    to: v.string(),
    deliveryUrl: v.string(),
    lenderName: v.string(),
    fileLabel: v.string(),
    workspaceLabel: v.string(),
    linkExpiresDescription: v.string(),
    permissionLabel: v.string(),
  },
  handler: async (
    _ctx,
    {
      to,
      deliveryUrl,
      lenderName,
      fileLabel,
      workspaceLabel,
      linkExpiresDescription,
      permissionLabel,
    },
  ) => {
    const subject = `Secure document package — ${fileLabel}`;
    const text = [
      `${workspaceLabel} has shared a secure document package for ${fileLabel}.`,
      "",
      `Recipient: ${lenderName}`,
      `Access level: ${permissionLabel}`,
      `This link expires in ${linkExpiresDescription}.`,
      "",
      "Open your secure package:",
      deliveryUrl,
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
      console.error("lender delivery invite email failed", e);
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});

export const deliverRevisionRequest = internalAction({
  args: {
    to: v.string(),
    taskTitle: v.string(),
    revisionNote: v.string(),
    portalUrl: v.string(),
    workspaceLabel: v.string(),
  },
  handler: async (
    _ctx,
    { to, taskTitle, revisionNote, portalUrl, workspaceLabel },
  ) => {
    const subject = `Revision requested — ${taskTitle}`;
    const text = [
      `${workspaceLabel} reviewed your submission for "${taskTitle}" and requested a revision.`,
      "",
      "Broker note:",
      revisionNote.trim(),
      "",
      "Sign in to your secure portal to update and resubmit:",
      portalUrl,
      "",
      "If you already addressed this, you can ignore this message.",
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
      console.error("revision request email failed", e);
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});

export const deliverPortalLinkOtp = internalAction({
  args: {
    to: v.string(),
    code: v.string(),
    linkTitle: v.string(),
  },
  handler: async (_ctx, { to, code, linkTitle }) => {
    const subject = `Your verification code — ${linkTitle}`;
    const text = [
      `Your one-time verification code for "${linkTitle}" is:`,
      "",
      code,
      "",
      "This code expires in 15 minutes.",
      "",
      "If you did not request this code, you can ignore this message.",
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
      console.error("portal link OTP email failed", e);
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});
