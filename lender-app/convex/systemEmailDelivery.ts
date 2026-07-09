import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { createResendEmailAdapter } from "@/lib/comms/emailResendAdapter";

function textToSimpleHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;font-family:sans-serif">${esc}</div>`;
}

export const internalGetQueuedEmail = internalQuery({
  args: { emailLogId: v.id("systemEmailLog") },
  handler: async (ctx, { emailLogId }) => ctx.db.get(emailLogId),
});

export const internalMarkSendingFailed = internalMutation({
  args: {
    emailLogId: v.id("systemEmailLog"),
    errorMessage: v.string(),
  },
  handler: async (ctx, { emailLogId, errorMessage }) => {
    const row = await ctx.db.get(emailLogId);
    if (!row) return;
    const now = Date.now();
    await ctx.db.patch(emailLogId, {
      status: "failed",
      errorMessage: errorMessage.slice(0, 4000),
      updatedAt: now,
    });
    await ctx.db.insert("systemEmailEvents", {
      emailLogId,
      organizationId: row.organizationId,
      at: now,
      kind: "send_failed",
      detail: errorMessage.slice(0, 500),
    });
  },
});

export const internalMarkSent = internalMutation({
  args: {
    emailLogId: v.id("systemEmailLog"),
    providerMessageId: v.string(),
  },
  handler: async (ctx, { emailLogId, providerMessageId }) => {
    const row = await ctx.db.get(emailLogId);
    if (!row) return;
    const now = Date.now();
    await ctx.db.patch(emailLogId, {
      status: "sent",
      providerMessageId: providerMessageId.slice(0, 120),
      sentAt: now,
      updatedAt: now,
      errorMessage: undefined,
    });
    await ctx.db.insert("systemEmailEvents", {
      emailLogId,
      organizationId: row.organizationId,
      at: now,
      kind: "sent",
      detail: `provider_id=${providerMessageId.slice(0, 80)}`,
    });
  },
});

export const deliverQueuedSystemEmail = internalAction({
  args: { emailLogId: v.id("systemEmailLog") },
  handler: async (ctx, { emailLogId }) => {
    const row = await ctx.runQuery(internal.systemEmailDelivery.internalGetQueuedEmail, {
      emailLogId,
    });
    if (!row || row.status !== "queued") {
      return { ok: false as const, reason: "not_queued" };
    }

    const publicBase = process.env.EMAIL_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");

    let html = row.bodyHtmlForProvider;
    if (!html) {
      html = textToSimpleHtml(row.bodyText);
    }
    if (row.trackOpens && row.openToken && publicBase) {
      const q = encodeURIComponent(row.openToken);
      html += `<img src="${publicBase}/email/track?t=${q}" width="1" height="1" alt="" />`;
    }
    try {
      const result = await createResendEmailAdapter().send({
        channel: "email",
        providerKey: "resend",
        recipients: [
          ...row.toAddresses.map((value) => ({ value })),
          ...(row.ccAddresses?.map((value) => ({ value, kind: "cc" as const })) ?? []),
        ],
        subject: row.subject,
        bodyText: row.bodyText,
        bodyHtml: html,
        metadata: row.correlationId
          ? { correlationId: row.correlationId }
          : undefined,
      });
      await ctx.runMutation(internal.systemEmailDelivery.internalMarkSent, {
        emailLogId,
        providerMessageId: result.providerMessageId,
      });
      return { ok: true as const };
    } catch (e) {
      await ctx.runMutation(internal.systemEmailDelivery.internalMarkSendingFailed, {
        emailLogId,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      return { ok: false as const, reason: "fetch_error" };
    }
  },
});
