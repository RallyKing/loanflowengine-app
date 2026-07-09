import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  assertCanMutatePipelineRow,
  assertOrgPermission,
} from "./organizationAccess";
import { randomHexSync } from "./integrationCrypto";

const MAX_SUBJECT = 998;
const MAX_BODY = 50_000;
const MAX_TO = 15;
const MAX_CC = 10;
const RATE_PER_HOUR = 60;

function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function simpleHtmlFromText(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;font-family:sans-serif">${esc}</div>`;
}

export const getInboxSyncStatus = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await assertOrgPermission(ctx, organizationId, memberUserKey, "settings.access");
    return {
      available: false as const,
      message:
        "Inbox sync (Gmail / Microsoft) is not enabled yet. System email sending and logging work independently.",
    };
  },
});

export const canSendSystemEmail = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, memberUserKey }) => {
    try {
      await assertOrgPermission(ctx, organizationId, memberUserKey, "email.send");
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  },
});

export const listRecentForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    limit: v.optional(v.number()),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "email.send");
    const cap = Math.min(100, Math.max(1, args.limit ?? 40));
    const rows = await ctx.db
      .query("systemEmailLog")
      .withIndex("by_organization_created", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(cap * 3);
    if (args.relatedPipelineFileId) {
      return rows
        .filter((r) => r.relatedPipelineFileId === args.relatedPipelineFileId)
        .slice(0, cap);
    }
    return rows.slice(0, cap);
  },
});

export const listEventsForEmail = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    emailLogId: v.id("systemEmailLog"),
  },
  handler: async (ctx, { organizationId, memberUserKey, emailLogId }) => {
    await assertOrgPermission(ctx, organizationId, memberUserKey, "email.send");
    const row = await ctx.db.get(emailLogId);
    if (!row || row.organizationId !== organizationId) return [];
    return await ctx.db
      .query("systemEmailEvents")
      .withIndex("by_email", (q) => q.eq("emailLogId", emailLogId))
      .order("asc")
      .collect();
  },
});

export const getEmailDetail = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    emailLogId: v.id("systemEmailLog"),
  },
  handler: async (ctx, { organizationId, memberUserKey, emailLogId }) => {
    await assertOrgPermission(ctx, organizationId, memberUserKey, "email.send");
    const row = await ctx.db.get(emailLogId);
    if (!row || row.organizationId !== organizationId) return null;
    return row;
  },
});

export const sendOrganizationEmail = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyText: v.string(),
    trackOpens: v.optional(v.boolean()),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "email.send");

    const file = args.relatedPipelineFileId
      ? await ctx.db.get(args.relatedPipelineFileId)
      : null;
    if (args.relatedPipelineFileId) {
      if (!file || file.organizationId !== args.organizationId) {
        throw new Error("Pipeline file not in this organization.");
      }
      await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    }

    if (args.relatedContactId) {
      const c = await ctx.db.get(args.relatedContactId);
      if (!c || c.organizationId !== args.organizationId) {
        throw new Error("Contact not in this organization.");
      }
    }

    const toSet = new Set<string>();
    for (const t of args.to) {
      const e = normalizeEmail(t);
      if (e) toSet.add(e);
    }
    if (toSet.size === 0) throw new Error("Add at least one valid recipient.");
    if (toSet.size > MAX_TO) throw new Error(`Maximum ${MAX_TO} To recipients.`);

    const ccList: string[] = [];
    if (args.cc?.length) {
      for (const t of args.cc) {
        const e = normalizeEmail(t);
        if (e && !toSet.has(e)) ccList.push(e);
      }
    }
    if (ccList.length > MAX_CC) {
      throw new Error(`Maximum ${MAX_CC} Cc recipients.`);
    }

    const subject = args.subject.trim().slice(0, MAX_SUBJECT);
    if (!subject) throw new Error("Subject is required.");

    const bodyText = args.bodyText.replace(/\r\n/g, "\n").slice(0, MAX_BODY);
    if (!bodyText.trim()) throw new Error("Body is required.");

    const hourAgo = Date.now() - 3_600_000;
    const recent = await ctx.db
      .query("systemEmailLog")
      .withIndex("by_organization_created", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .order("desc")
      .take(RATE_PER_HOUR + 5);
    const n = recent.filter((r) => r.createdAt >= hourAgo).length;
    if (n >= RATE_PER_HOUR) {
      throw new Error(
        `Email rate limit reached (${RATE_PER_HOUR} per hour per organization). Try again later.`,
      );
    }

    const trackOpens = Boolean(args.trackOpens);
    const openToken = trackOpens ? randomHexSync(24) : undefined;
    const correlationId = randomHexSync(16);
    const now = Date.now();
    const userKey = (args.memberUserKey ?? "").trim();

    const bodyHtmlForProvider = simpleHtmlFromText(bodyText);

    const id = await ctx.db.insert("systemEmailLog", {
      organizationId: args.organizationId,
      sentByUserKey: userKey,
      status: "queued",
      toAddresses: [...toSet],
      ccAddresses: ccList.length ? ccList : undefined,
      subject,
      bodyText,
      bodyHtmlForProvider,
      relatedPipelineFileId: args.relatedPipelineFileId,
      relatedContactId: args.relatedContactId,
      provider: "resend",
      trackOpens,
      openToken,
      openCount: 0,
      correlationId,
      hasInboundReply: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("systemEmailEvents", {
      emailLogId: id,
      organizationId: args.organizationId,
      at: now,
      kind: "queued",
      detail: `to=${toSet.size}${ccList.length ? ` cc=${ccList.length}` : ""}`,
    });

    await ctx.scheduler.runAfter(0, internal.systemEmailDelivery.deliverQueuedSystemEmail, {
      emailLogId: id,
    });

    return { emailLogId: id };
  },
});

export const markReplyObserved = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    emailLogId: v.id("systemEmailLog"),
    snippet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "email.send");
    const row = await ctx.db.get(args.emailLogId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Email not found.");
    }
    const now = Date.now();
    const sn = args.snippet?.trim().slice(0, 2000);
    await ctx.db.patch(args.emailLogId, {
      hasInboundReply: true,
      lastReplySnippet: sn || row.lastReplySnippet,
      replyDetectedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("systemEmailEvents", {
      emailLogId: args.emailLogId,
      organizationId: args.organizationId,
      at: now,
      kind: "reply_marked",
      detail: sn ? `len=${sn.length}` : undefined,
    });
  },
});

export const recordOpenFromPixel = internalMutation({
  args: {
    openToken: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { openToken, userAgent }) => {
    const tok = openToken.trim();
    if (!tok || tok.length > 64) return;

    const row = await ctx.db
      .query("systemEmailLog")
      .withIndex("by_open_token", (q) => q.eq("openToken", tok))
      .first();
    if (!row || !row.trackOpens) return;

    const now = Date.now();
    const nextCount = row.openCount + 1;
    await ctx.db.patch(row._id, {
      openCount: nextCount,
      firstOpenedAt: row.firstOpenedAt ?? now,
      updatedAt: now,
    });
    if (row.openCount === 0) {
      const ua = userAgent?.trim().slice(0, 200);
      await ctx.db.insert("systemEmailEvents", {
        emailLogId: row._id,
        organizationId: row.organizationId,
        at: now,
        kind: "open",
        detail: ua ? `ua=${ua}` : "first_open",
      });
    }
  },
});

export const recordInboundReplyFromBridge = internalMutation({
  args: {
    correlationId: v.string(),
    snippet: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cid = args.correlationId.trim();
    if (!cid) return { ok: false as const };

    const row = await ctx.db
      .query("systemEmailLog")
      .withIndex("by_correlation", (q) => q.eq("correlationId", cid))
      .first();
    if (!row) return { ok: false as const };

    const now = Date.now();
    const sn = args.snippet?.trim().slice(0, 2000);
    await ctx.db.patch(row._id, {
      hasInboundReply: true,
      lastReplySnippet: sn ?? row.lastReplySnippet,
      replyDetectedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("systemEmailEvents", {
      emailLogId: row._id,
      organizationId: row.organizationId,
      at: now,
      kind: "reply_inbound",
      detail: args.detail?.slice(0, 500),
    });
    return { ok: true as const };
  },
});
