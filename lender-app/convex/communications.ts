import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  assertOrgMember,
} from "./organizationAccess";
import { assertOrgPermission } from "./organizationRbac";
import { randomHexSync } from "./integrationCrypto";
import { insertCollaborationActivityEvent } from "./activityEvents";
import { buildDraftScopeKey } from "@/lib/comms/draftScope";
import { createResendEmailAdapter } from "@/lib/comms/emailResendAdapter";
import { resolveCommunicationProvider } from "@/lib/comms/providerRouter";
import { GLOBAL_COMMUNICATION_TEMPLATE_SEEDS } from "@/lib/comms/seedTemplates";
import { buildCommunicationPreview } from "@/lib/comms/templateRender";
import { defaultProviderForChannel } from "@/lib/comms/types";
import {
  BUILT_IN_MERGE_VARIABLES,
  sanitizeCustomInputs,
  type CustomInputDefinition,
} from "@/lib/comms/mergeVariables";

const channelV = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("push"),
  v.literal("portal"),
  v.literal("voice"),
  v.literal("webhook"),
);

const customInputV = v.object({
  key: v.string(),
  label: v.string(),
  inputType: v.union(
    v.literal("text"),
    v.literal("textarea"),
    v.literal("number"),
    v.literal("phone"),
    v.literal("email"),
  ),
  defaultValue: v.optional(v.string()),
  required: v.optional(v.boolean()),
  helpText: v.optional(v.string()),
});

const templateStatusV = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

const priorityV = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("critical"),
);

const MAX_BODY = 50_000;
const MAX_SUBJECT = 998;
const MAX_TO = 20;
const MAX_ATTACHMENTS = 8;
const STALE_SENDING_MS = 15 * 60 * 1000;

function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function sanitizeString(value: string | undefined, limit: number): string | undefined {
  const next = value?.trim();
  if (!next) return undefined;
  return next.slice(0, limit);
}

function normalizeRecipientSummary(channel: string, recipients: string[]): string[] {
  const out = new Set<string>();
  for (const raw of recipients) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (channel === "email") {
      const email = normalizeEmail(trimmed);
      if (email) out.add(email);
      continue;
    }
    out.add(trimmed);
  }
  return Array.from(out).slice(0, MAX_TO);
}

function getScopeKind(args: {
  relatedPipelineFileId?: Id<"pipeline">;
  relatedContactId?: Id<"contacts">;
  relatedLenderId?: Id<"lenders">;
}): Doc<"communicationThreads">["scopeKind"] {
  if (args.relatedPipelineFileId) return "pipeline_file";
  if (args.relatedContactId) return "contact";
  if (args.relatedLenderId) return "lender";
  return "organization";
}

function buildThreadKey(args: {
  organizationId: Id<"organizations">;
  relatedPipelineFileId?: Id<"pipeline">;
  relatedContactId?: Id<"contacts">;
  relatedLenderId?: Id<"lenders">;
  seed?: string;
}): string {
  return [
    String(args.organizationId),
    args.relatedPipelineFileId ? `file:${args.relatedPipelineFileId}` : "file:-",
    args.relatedContactId ? `contact:${args.relatedContactId}` : "contact:-",
    args.relatedLenderId ? `lender:${args.relatedLenderId}` : "lender:-",
    args.seed?.trim() || randomHexSync(8),
  ].join("|");
}

function simpleHtmlFromText(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap;font-family:sans-serif">${esc}</div>`;
}

function backoffMs(retryCount: number): number {
  const base = 1_000 * Math.pow(2, Math.max(0, retryCount));
  return Math.min(300_000, base);
}

async function assertCommunicationAccess(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey?: string;
    channel: Doc<"outboundMessages">["channel"];
    relatedPipelineFileId?: Id<"pipeline">;
  },
) {
  await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
  if (args.relatedPipelineFileId) {
    const file = await ctx.db.get(args.relatedPipelineFileId);
    if (!file || file.organizationId !== args.organizationId) {
      throw new Error("Pipeline file not found in this organization.");
    }
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
  }
  if (args.channel === "email") {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "email.send");
  }
}

async function maybeReadFileContext(
  ctx: any,
  fileId: Id<"pipeline"> | undefined,
  memberUserKey: string | undefined,
) {
  if (!fileId) return null;
  const file = await ctx.db.get(fileId);
  if (!file) return null;
  await assertCanReadPipelineRow(ctx, file, memberUserKey);
  return file;
}

async function getTemplateSeed(slug: string | undefined) {
  if (!slug) return null;
  return GLOBAL_COMMUNICATION_TEMPLATE_SEEDS.find((seed) => seed.slug === slug) ?? null;
}

function primaryPhoneFromContact(
  contact: Doc<"contacts"> | null,
): string {
  if (!contact) return "";
  const phones = contact.phones ?? [];
  const primary = phones.find((p) => p.isPrimary)?.number ?? phones[0]?.number;
  return (primary ?? contact.phone ?? "").trim();
}

function primaryEmailFromContact(contact: Doc<"contacts"> | null): string {
  if (!contact) return "";
  const emails = contact.emails ?? [];
  const primary = emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email;
  return (primary ?? contact.email ?? "").trim();
}

function lenderDisplayName(
  lender: Doc<"lenders"> | null,
): string {
  if (!lender) return "the lender";
  const company = (lender.company ?? "").trim();
  if (company) return company;
  const contact = (lender.contactName ?? "").trim();
  return contact || "the lender";
}

async function buildVariables(
  ctx: any,
  args: {
    organizationId: Id<"organizations">;
    relatedPipelineFileId?: Id<"pipeline">;
    relatedContactId?: Id<"contacts">;
    relatedLenderId?: Id<"lenders">;
    senderName?: string;
    customOverrides?: Record<string, string>;
    customInputs?: CustomInputDefinition[];
  },
) {
  const organization = await ctx.db.get(args.organizationId);
  const file: Doc<"pipeline"> | null = args.relatedPipelineFileId
    ? await ctx.db.get(args.relatedPipelineFileId)
    : null;
  const contact: Doc<"contacts"> | null = args.relatedContactId
    ? await ctx.db.get(args.relatedContactId)
    : null;
  const lender: Doc<"lenders"> | null = args.relatedLenderId
    ? await ctx.db.get(args.relatedLenderId)
    : null;

  let stageName = "";
  if (file?.stageId) {
    const stage = await ctx.db.get(file.stageId);
    stageName = stage?.name?.trim() ?? "";
  }
  if (!stageName && file?.status) {
    stageName = String(file.status);
  }

  const fileName = (file?.fileName ?? "").trim() || "this file";
  const variables: Record<string, string> = {
    organizationName: organization?.name ?? "Your organization",
    fileName,
    dealName: fileName,
    stage: stageName || "current stage",
    status: file?.status?.trim() || stageName || "",
    contactName: contact?.name?.trim() || "there",
    contactPhone: primaryPhoneFromContact(contact),
    contactEmail: primaryEmailFromContact(contact),
    companyName: (contact?.companyName ?? "").trim() || "",
    lenderName: lenderDisplayName(lender),
    lenderPhone: (lender?.phone ?? "").trim(),
    lenderEmail: (lender?.email ?? "").trim(),
    senderName: args.senderName?.trim() || "Your team",
    approvalSummary: "Your file continues moving through review.",
    fundingSummary: "We will share timing details as they are finalized.",
    escalationReason: "Needs internal follow-up.",
  };

  for (const input of args.customInputs ?? []) {
    if (!(input.key in variables)) {
      variables[input.key] = input.defaultValue ?? "";
    }
  }
  if (args.customOverrides) {
    for (const [key, value] of Object.entries(args.customOverrides)) {
      if (!key.trim()) continue;
      variables[key.trim()] = value;
    }
  }
  return variables;
}

async function upsertDraftRow(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey?: string;
    channel: Doc<"outboundMessages">["channel"];
    relatedPipelineFileId?: Id<"pipeline">;
    relatedContactId?: Id<"contacts">;
    relatedLenderId?: Id<"lenders">;
    threadId?: Id<"communicationThreads">;
    subject?: string;
    bodyText: string;
    recipientSummary: string[];
    priority?: Doc<"outboundMessages">["priority"];
    isTestMode?: boolean;
    channelAddress?: string;
  },
) {
  await assertCommunicationAccess(ctx, args);
  const userKey = (args.memberUserKey ?? "").trim();
  if (!userKey) throw new Error("A member key is required to save a draft.");

  const draftScopeKey = buildDraftScopeKey({
    organizationId: String(args.organizationId),
    userKey,
    channel: args.channel,
    pipelineFileId: args.relatedPipelineFileId ? String(args.relatedPipelineFileId) : undefined,
    contactId: args.relatedContactId ? String(args.relatedContactId) : undefined,
    lenderId: args.relatedLenderId ? String(args.relatedLenderId) : undefined,
  });
  const recipients = normalizeRecipientSummary(args.channel, args.recipientSummary);
  const now = Date.now();
  const subject = sanitizeString(args.subject, MAX_SUBJECT);
  const bodyText = args.bodyText.slice(0, MAX_BODY);

  const existing = await ctx.db
    .query("outboundMessages")
    .withIndex("by_org_draft_scope", (q) =>
      q.eq("organizationId", args.organizationId).eq("draftScopeKey", draftScopeKey),
    )
    .first();

  const patch = {
    channel: args.channel,
    subject,
    bodyText,
    bodyHtml: bodyText ? simpleHtmlFromText(bodyText) : undefined,
    recipientSummary: recipients,
    priority: args.priority ?? "normal",
    draftScopeKey,
    relatedPipelineFileId: args.relatedPipelineFileId,
    relatedContactId: args.relatedContactId,
    relatedLenderId: args.relatedLenderId,
    isTestMode: Boolean(args.isTestMode),
    channelAddress: sanitizeString(args.channelAddress, 320),
    updatedAt: now,
  } as const;

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return { outboundMessageId: existing._id };
  }

  const messageId = await ctx.db.insert("outboundMessages", {
    publicId: randomHexSync(12),
    organizationId: args.organizationId,
    threadId: args.threadId,
    channel: args.channel,
    status: "draft",
    priority: args.priority ?? "normal",
    source: args.isTestMode ? "test_mode" : "manual_compose",
    senderUserKey: userKey,
    senderLabel: userKey,
    recipientSummary: recipients,
    subject,
    bodyText,
    bodyHtml: bodyText ? simpleHtmlFromText(bodyText) : undefined,
    channelAddress: sanitizeString(args.channelAddress, 320),
    providerKey: defaultProviderForChannel(args.channel),
    relatedPipelineFileId: args.relatedPipelineFileId,
    relatedContactId: args.relatedContactId,
    relatedLenderId: args.relatedLenderId,
    draftScopeKey,
    isTestMode: Boolean(args.isTestMode),
    openCount: 0,
    clickCount: 0,
    retryCount: 0,
    maxRetries: 4,
    createdAt: now,
    updatedAt: now,
  });
  return { outboundMessageId: messageId };
}

async function queueDraftRow(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    memberUserKey?: string;
    outboundMessageId: Id<"outboundMessages">;
    scheduledFor?: number;
  },
) {
  const row = await ctx.db.get(args.outboundMessageId);
  if (!row || row.organizationId !== args.organizationId) {
    throw new Error("Draft not found.");
  }
  await assertCommunicationAccess(ctx, {
    organizationId: args.organizationId,
    memberUserKey: args.memberUserKey,
    channel: row.channel,
    relatedPipelineFileId: row.relatedPipelineFileId,
  });

  if (!row.bodyText.trim()) {
    throw new Error("Message body is required.");
  }
  if (!row.recipientSummary.length) {
    throw new Error("Add at least one recipient.");
  }

  const now = Date.now();
  let threadId = row.threadId;
  if (!threadId) {
    const threadKey = buildThreadKey({
      organizationId: row.organizationId,
      relatedPipelineFileId: row.relatedPipelineFileId,
      relatedContactId: row.relatedContactId,
      relatedLenderId: row.relatedLenderId,
    });
    threadId = await ctx.db.insert("communicationThreads", {
      publicId: randomHexSync(12),
      organizationId: row.organizationId,
      threadKey,
      channel: row.channel,
      scopeKind: getScopeKind(row),
      title: row.subject,
      relatedPipelineFileId: row.relatedPipelineFileId,
      relatedContactId: row.relatedContactId,
      relatedLenderId: row.relatedLenderId,
      createdByUserKey: row.senderUserKey,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const scheduledFor =
    args.scheduledFor && args.scheduledFor > now ? args.scheduledFor : undefined;
  await ctx.db.patch(row._id, {
    threadId,
    draftScopeKey: undefined,
    status: scheduledFor ? "scheduled" : "queued",
    scheduledFor,
    queuedAt: now,
    updatedAt: now,
  });

  await ctx.scheduler.runAfter(
    Math.max(0, (scheduledFor ?? now) - now),
    internal.communications.processOutboundMessage,
    { outboundMessageId: row._id },
  );
  return { ok: true as const, threadId };
}

export const listTemplateCatalog = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    channel: v.optional(channelV),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      id: v.union(v.id("communicationTemplates"), v.null()),
      source: v.union(v.literal("saved"), v.literal("seed")),
      slug: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      channel: channelV,
      status: templateStatusV,
      subjectTemplate: v.optional(v.string()),
      bodyTemplate: v.string(),
      customInputs: v.array(customInputV),
    }),
  ),
  handler: async (ctx, { organizationId, memberUserKey, channel, includeArchived }) => {
    await assertOrgMember(ctx, organizationId, memberUserKey);
    const rows = await ctx.db
      .query("communicationTemplates")
      .withIndex("by_org_updated", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(200);

    const versionsByTemplate = new Map<string, Doc<"communicationTemplateVersions">>();
    for (const row of rows) {
      if (!includeArchived && row.status === "archived") continue;
      const version = row.publishedVersion ?? row.currentDraftVersion;
      if (version == null) continue;
      const match = await ctx.db
        .query("communicationTemplateVersions")
        .withIndex("by_template_version", (q) =>
          q.eq("templateId", row._id).eq("version", version),
        )
        .first();
      if (match) versionsByTemplate.set(String(row._id), match);
    }

    const saved = rows
      .filter((row) => includeArchived || row.status !== "archived")
      .filter((row) => !channel || row.channel === channel)
      .map((row) => {
        const version = versionsByTemplate.get(String(row._id));
        const customInputs = sanitizeCustomInputs(
          (version?.customInputs ?? row.customInputs ?? []) as CustomInputDefinition[],
        );
        return {
          id: row._id as Id<"communicationTemplates"> | null,
          source: "saved" as const,
          slug: row.slug,
          name: row.name,
          description: row.description,
          channel: row.channel,
          status: row.status,
          subjectTemplate: version?.subjectTemplate,
          bodyTemplate: version?.bodyTemplate ?? "",
          customInputs,
        };
      });

    const seeded = GLOBAL_COMMUNICATION_TEMPLATE_SEEDS.filter(
      (seed) => !channel || seed.channel === channel,
    ).map((seed) => ({
      id: null as Id<"communicationTemplates"> | null,
      source: "seed" as const,
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      channel: seed.channel,
      status: "published" as const,
      subjectTemplate: seed.subjectTemplate,
      bodyTemplate: seed.bodyTemplate,
      customInputs: [] as CustomInputDefinition[],
    }));

    return [...saved, ...seeded];
  },
});

export const listTemplateLibrary = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    channel: v.optional(channelV),
    includeArchived: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id("communicationTemplates"),
        slug: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        channel: channelV,
        status: templateStatusV,
        subjectTemplate: v.optional(v.string()),
        bodyTemplate: v.string(),
        customInputs: v.array(customInputV),
        publishedVersion: v.optional(v.number()),
        currentDraftVersion: v.optional(v.number()),
        updatedAt: v.number(),
        createdAt: v.number(),
      }),
    ),
    isDone: v.boolean(),
    builtInVariables: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        description: v.string(),
        group: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "settings.access");
    const limit = Math.min(Math.max(args.limit ?? 80, 1), 200);
    const rows = args.channel
      ? await ctx.db
          .query("communicationTemplates")
          .withIndex("by_org_channel_updated", (idx) =>
            idx.eq("organizationId", args.organizationId).eq("channel", args.channel!),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("communicationTemplates")
          .withIndex("by_org_updated", (idx) => idx.eq("organizationId", args.organizationId))
          .order("desc")
          .take(limit);

    const page = [];
    for (const row of rows) {
      if (!args.includeArchived && row.status === "archived") continue;
      const versionNum = row.publishedVersion ?? row.currentDraftVersion;
      let subjectTemplate: string | undefined;
      let bodyTemplate = "";
      let versionInputs: CustomInputDefinition[] = [];
      if (versionNum != null) {
        const version = await ctx.db
          .query("communicationTemplateVersions")
          .withIndex("by_template_version", (idx) =>
            idx.eq("templateId", row._id).eq("version", versionNum),
          )
          .first();
        subjectTemplate = version?.subjectTemplate;
        bodyTemplate = version?.bodyTemplate ?? "";
        versionInputs = sanitizeCustomInputs(
          (version?.customInputs ?? []) as CustomInputDefinition[],
        );
      }
      page.push({
        _id: row._id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        channel: row.channel,
        status: row.status,
        subjectTemplate,
        bodyTemplate,
        customInputs: versionInputs.length
          ? versionInputs
          : sanitizeCustomInputs((row.customInputs ?? []) as CustomInputDefinition[]),
        publishedVersion: row.publishedVersion,
        currentDraftVersion: row.currentDraftVersion,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
      });
    }

    return {
      page,
      isDone: rows.length < limit,
      builtInVariables: BUILT_IN_MERGE_VARIABLES.map((row) => ({
        key: row.key,
        label: row.label,
        description: row.description,
        group: row.group,
      })),
    };
  },
});

export const getTemplate = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    templateId: v.id("communicationTemplates"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("communicationTemplates"),
      slug: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      channel: channelV,
      status: templateStatusV,
      subjectTemplate: v.optional(v.string()),
      bodyTemplate: v.string(),
      customInputs: v.array(customInputV),
      publishedVersion: v.optional(v.number()),
      currentDraftVersion: v.optional(v.number()),
      updatedAt: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "settings.access");
    const row = await ctx.db.get(args.templateId);
    if (!row || row.organizationId !== args.organizationId) return null;
    const versionNum = row.currentDraftVersion ?? row.publishedVersion;
    let subjectTemplate: string | undefined;
    let bodyTemplate = "";
    let customInputs: CustomInputDefinition[] = sanitizeCustomInputs(
      (row.customInputs ?? []) as CustomInputDefinition[],
    );
    if (versionNum != null) {
      const version = await ctx.db
        .query("communicationTemplateVersions")
        .withIndex("by_template_version", (q) =>
          q.eq("templateId", row._id).eq("version", versionNum),
        )
        .first();
      subjectTemplate = version?.subjectTemplate;
      bodyTemplate = version?.bodyTemplate ?? "";
      if (version?.customInputs?.length) {
        customInputs = sanitizeCustomInputs(
          version.customInputs as CustomInputDefinition[],
        );
      }
    }
    return {
      _id: row._id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      channel: row.channel,
      status: row.status,
      subjectTemplate,
      bodyTemplate,
      customInputs,
      publishedVersion: row.publishedVersion,
      currentDraftVersion: row.currentDraftVersion,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    };
  },
});

export const getComposerContext = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
  },
  returns: v.object({
    fileName: v.union(v.string(), v.null()),
    suggestedRecipients: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
        contactId: v.optional(v.id("contacts")),
        kind: v.optional(v.union(v.literal("email"), v.literal("sms"))),
      }),
    ),
    contactName: v.union(v.string(), v.null()),
    lenderName: v.union(v.string(), v.null()),
    variables: v.record(v.string(), v.string()),
    builtInVariables: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        description: v.string(),
        group: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const file = await maybeReadFileContext(ctx, args.relatedPipelineFileId, args.memberUserKey);
    const contact = args.relatedContactId ? await ctx.db.get(args.relatedContactId) : null;
    const lender = args.relatedLenderId ? await ctx.db.get(args.relatedLenderId) : null;
    const contacts = args.relatedPipelineFileId
      ? await ctx.db
          .query("contactFileLinks")
          .withIndex("by_file", (q) => q.eq("fileId", args.relatedPipelineFileId!))
          .collect()
      : [];

    const suggestedRecipients: Array<{
      value: string;
      label: string;
      contactId?: Id<"contacts">;
      kind?: "email" | "sms";
    }> = [];
    for (const link of contacts.slice(0, 10)) {
      const row = await ctx.db.get(link.contactId);
      if (!row) continue;
      const email = primaryEmailFromContact(row);
      if (email) {
        suggestedRecipients.push({
          value: email,
          label: row.name,
          contactId: row._id,
          kind: "email",
        });
      }
      const phone = primaryPhoneFromContact(row);
      if (phone) {
        suggestedRecipients.push({
          value: phone,
          label: `${row.name} (SMS)`,
          contactId: row._id,
          kind: "sms",
        });
      }
    }
    if (contact) {
      const email = primaryEmailFromContact(contact);
      if (email && !suggestedRecipients.some((r) => r.value === email && r.kind === "email")) {
        suggestedRecipients.unshift({
          value: email,
          label: contact.name,
          contactId: contact._id,
          kind: "email",
        });
      }
      const phone = primaryPhoneFromContact(contact);
      if (phone && !suggestedRecipients.some((r) => r.value === phone && r.kind === "sms")) {
        suggestedRecipients.unshift({
          value: phone,
          label: `${contact.name} (SMS)`,
          contactId: contact._id,
          kind: "sms",
        });
      }
    }
    if (lender) {
      const email = (lender.email ?? "").trim();
      if (email) {
        suggestedRecipients.push({
          value: email,
          label: lenderDisplayName(lender),
          kind: "email",
        });
      }
      const phone = (lender.phone ?? "").trim();
      if (phone) {
        suggestedRecipients.push({
          value: phone,
          label: `${lenderDisplayName(lender)} (SMS)`,
          kind: "sms",
        });
      }
    }

    const variables = await buildVariables(ctx, {
      organizationId: args.organizationId,
      relatedPipelineFileId: args.relatedPipelineFileId,
      relatedContactId: args.relatedContactId,
      relatedLenderId: args.relatedLenderId,
      senderName: args.memberUserKey,
    });

    return {
      fileName: file?.fileName ?? null,
      suggestedRecipients,
      contactName: contact?.name ?? null,
      lenderName: lender ? lenderDisplayName(lender) : null,
      variables,
      builtInVariables: BUILT_IN_MERGE_VARIABLES.map((row) => ({
        key: row.key,
        label: row.label,
        description: row.description,
        group: row.group,
      })),
    };
  },
});

export const previewTemplate = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    seedTemplateSlug: v.optional(v.string()),
    subjectTemplate: v.optional(v.string()),
    bodyTemplate: v.string(),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
    senderName: v.optional(v.string()),
    customOverrides: v.optional(v.record(v.string(), v.string())),
    customInputs: v.optional(v.array(customInputV)),
  },
  returns: v.object({
    subject: v.string(),
    bodyText: v.string(),
    variablesUsed: v.array(v.string()),
    variables: v.record(v.string(), v.string()),
  }),
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const seed = await getTemplateSeed(args.seedTemplateSlug);
    const customInputs = sanitizeCustomInputs(
      (args.customInputs ?? []) as CustomInputDefinition[],
    );
    const variables = await buildVariables(ctx, {
      organizationId: args.organizationId,
      relatedPipelineFileId: args.relatedPipelineFileId,
      relatedContactId: args.relatedContactId,
      relatedLenderId: args.relatedLenderId,
      senderName: args.senderName ?? args.memberUserKey,
      customOverrides: args.customOverrides,
      customInputs,
    });
    const preview = buildCommunicationPreview({
      subjectTemplate: args.subjectTemplate ?? seed?.subjectTemplate,
      bodyTemplate: args.bodyTemplate || seed?.bodyTemplate || "",
      variables,
    });
    return { ...preview, variables };
  },
});

export const listBuiltInMergeVariables = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      description: v.string(),
      group: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    return BUILT_IN_MERGE_VARIABLES.map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description,
      group: row.group,
    }));
  },
});

export const getDraft = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    channel: channelV,
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const userKey = args.memberUserKey?.trim() ?? "";
    if (!userKey) return null;
    const draftScopeKey = buildDraftScopeKey({
      organizationId: String(args.organizationId),
      userKey,
      channel: args.channel,
      pipelineFileId: args.relatedPipelineFileId ? String(args.relatedPipelineFileId) : undefined,
      contactId: args.relatedContactId ? String(args.relatedContactId) : undefined,
      lenderId: args.relatedLenderId ? String(args.relatedLenderId) : undefined,
    });
    const row = await ctx.db
      .query("outboundMessages")
      .withIndex("by_org_draft_scope", (q) =>
        q.eq("organizationId", args.organizationId).eq("draftScopeKey", draftScopeKey),
      )
      .first();
    if (!row || row.status !== "draft") return null;
    const attachments = await ctx.db
      .query("outboundMessageAttachments")
      .withIndex("by_message", (q) => q.eq("outboundMessageId", row._id))
      .collect();
    return {
      ...row,
      attachments,
    };
  },
});

export const listHistory = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const cap = Math.min(80, Math.max(1, args.limit ?? 40));

    let outboundRows: Doc<"outboundMessages">[] = [];
    if (args.relatedPipelineFileId) {
      outboundRows = await ctx.db
        .query("outboundMessages")
        .withIndex("by_org_file", (q) =>
          q.eq("organizationId", args.organizationId).eq("relatedPipelineFileId", args.relatedPipelineFileId!),
        )
        .order("desc")
        .take(cap);
    } else if (args.relatedContactId) {
      outboundRows = await ctx.db
        .query("outboundMessages")
        .withIndex("by_org_contact", (q) =>
          q.eq("organizationId", args.organizationId).eq("relatedContactId", args.relatedContactId!),
        )
        .order("desc")
        .take(cap);
    } else if (args.relatedLenderId) {
      outboundRows = await ctx.db
        .query("outboundMessages")
        .withIndex("by_org_lender", (q) =>
          q.eq("organizationId", args.organizationId).eq("relatedLenderId", args.relatedLenderId!),
        )
        .order("desc")
        .take(cap);
    } else {
      outboundRows = await ctx.db
        .query("outboundMessages")
        .withIndex("by_org_created", (q) => q.eq("organizationId", args.organizationId))
        .order("desc")
        .take(cap);
    }

    const outboundItems = outboundRows.map((row) => ({
      id: row._id as string,
      at: row.updatedAt || row.createdAt,
      source: "outbound" as const,
      channel: row.channel,
      status: row.status,
      subject: row.subject,
      summary: row.bodyText,
      recipients: row.recipientSummary,
      providerKey: row.providerKey,
    }));

    const emailRows = await ctx.db
      .query("systemEmailLog")
      .withIndex("by_organization_created", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(cap * 2);
    const legacyEmailItems = emailRows
      .filter((row) => {
        if (args.relatedPipelineFileId && row.relatedPipelineFileId !== args.relatedPipelineFileId) {
          return false;
        }
        if (args.relatedContactId && row.relatedContactId !== args.relatedContactId) {
          return false;
        }
        return !row.outboundMessageId;
      })
      .slice(0, cap)
      .map((row) => ({
        id: row._id as string,
        at: row.updatedAt || row.createdAt,
        source: "legacy_email" as const,
        channel: "email" as const,
        status: row.status,
        subject: row.subject,
        summary: row.bodyText,
        recipients: row.toAddresses,
        providerKey: row.provider,
      }));

    const portalItems =
      args.relatedPipelineFileId != null
        ? (
            await ctx.db
              .query("fileMessages")
              .withIndex("by_file_audience_root_created", (q) =>
                q
                  .eq("pipelineFileId", args.relatedPipelineFileId!)
                  .eq("audience", "portal")
                  .eq("isRoot", true),
              )
              .order("desc")
              .take(cap)
          ).map((row) => ({
            id: row._id as string,
            at: row.updatedAt || row.createdAt,
            source: "portal_thread" as const,
            channel: "portal" as const,
            status: "delivered",
            subject: undefined,
            summary: row.body,
            recipients: [],
            providerKey: "portal_native",
          }))
        : [];

    return [...outboundItems, ...legacyEmailItems, ...portalItems]
      .sort((a, b) => b.at - a.at)
      .slice(0, cap);
  },
});

export const upsertDraft = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    channel: channelV,
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
    threadId: v.optional(v.id("communicationThreads")),
    subject: v.optional(v.string()),
    bodyText: v.string(),
    recipientSummary: v.array(v.string()),
    priority: v.optional(priorityV),
    isTestMode: v.optional(v.boolean()),
    channelAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => await upsertDraftRow(ctx, args),
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    outboundMessageId: v.id("outboundMessages"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outboundMessageId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Draft not found.");
    }
    await assertCommunicationAccess(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      channel: row.channel,
      relatedPipelineFileId: row.relatedPipelineFileId,
    });
    const attachments = await ctx.db
      .query("outboundMessageAttachments")
      .withIndex("by_message", (q) => q.eq("outboundMessageId", args.outboundMessageId))
      .collect();
    if (attachments.length >= MAX_ATTACHMENTS) {
      throw new Error(`Maximum ${MAX_ATTACHMENTS} attachments per message.`);
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachUploadToMessage = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    outboundMessageId: v.id("outboundMessages"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outboundMessageId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Draft not found.");
    }
    await assertCommunicationAccess(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      channel: row.channel,
      relatedPipelineFileId: row.relatedPipelineFileId,
    });
    await ctx.db.insert("outboundMessageAttachments", {
      outboundMessageId: args.outboundMessageId,
      storageId: args.storageId,
      fileName: args.fileName.trim().slice(0, 255) || "attachment",
      contentType: sanitizeString(args.contentType, 120),
      size: args.size,
      createdAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const removeAttachment = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    attachmentId: v.id("outboundMessageAttachments"),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) return { ok: false as const };
    const row = await ctx.db.get(attachment.outboundMessageId);
    if (!row || row.organizationId !== args.organizationId) return { ok: false as const };
    await assertCommunicationAccess(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      channel: row.channel,
      relatedPipelineFileId: row.relatedPipelineFileId,
    });
    await ctx.db.delete(args.attachmentId);
    return { ok: true as const };
  },
});

export const queueDraft = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    outboundMessageId: v.id("outboundMessages"),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => await queueDraftRow(ctx, args),
});

export const upsertTemplate = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    templateId: v.optional(v.id("communicationTemplates")),
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    channel: channelV,
    subjectTemplate: v.optional(v.string()),
    bodyTemplate: v.string(),
    customInputs: v.optional(v.array(customInputV)),
    publish: v.optional(v.boolean()),
  },
  returns: v.object({
    templateId: v.id("communicationTemplates"),
    versionId: v.id("communicationTemplateVersions"),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "settings.access");
    const now = Date.now();
    const key = (args.memberUserKey ?? "").trim() || "system";
    const customInputs = sanitizeCustomInputs(
      (args.customInputs ?? []) as CustomInputDefinition[],
    );
    const description = sanitizeString(args.description, 400);
    let templateId = args.templateId;
    let nextVersion = 1;

    if (!templateId) {
      templateId = await ctx.db.insert("communicationTemplates", {
        organizationId: args.organizationId,
        scope: "organization",
        slug: args.slug.trim().slice(0, 80),
        name: args.name.trim().slice(0, 120),
        description,
        channel: args.channel,
        status: args.publish ? "published" : "draft",
        customInputs,
        createdByUserKey: key,
        currentDraftVersion: 1,
        publishedVersion: args.publish ? 1 : undefined,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const existingTemplateId = templateId;
      const existing = await ctx.db.get(existingTemplateId);
      if (!existing || existing.organizationId !== args.organizationId) {
        throw new Error("Template not found in this organization.");
      }
      const versions = await ctx.db
        .query("communicationTemplateVersions")
        .withIndex("by_template_created", (q) =>
          q.eq("templateId", existingTemplateId),
        )
        .order("desc")
        .take(1);
      nextVersion = (versions[0]?.version ?? 0) + 1;
      await ctx.db.patch(existingTemplateId, {
        slug: args.slug.trim().slice(0, 80),
        name: args.name.trim().slice(0, 120),
        description,
        channel: args.channel,
        status: args.publish ? "published" : "draft",
        customInputs,
        currentDraftVersion: nextVersion,
        ...(args.publish ? { publishedVersion: nextVersion, archivedAt: undefined } : {}),
        updatedAt: now,
      });
    }

    if (!templateId) {
      throw new Error("Template could not be created.");
    }

    const version = await ctx.db.insert("communicationTemplateVersions", {
      templateId,
      organizationId: args.organizationId,
      version: nextVersion,
      status: args.publish ? "published" : "draft",
      subjectTemplate: sanitizeString(args.subjectTemplate, MAX_SUBJECT),
      bodyTemplate: args.bodyTemplate.slice(0, MAX_BODY),
      customInputs,
      createdByUserKey: key,
      createdAt: now,
    });
    return { templateId, versionId: version, version: nextVersion };
  },
});

export const archiveTemplate = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    templateId: v.id("communicationTemplates"),
    archive: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    status: templateStatusV,
  }),
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "settings.access");
    const row = await ctx.db.get(args.templateId);
    if (!row || row.organizationId !== args.organizationId) {
      throw new Error("Template not found in this organization.");
    }
    const now = Date.now();
    const shouldArchive = args.archive !== false;
    if (shouldArchive) {
      await ctx.db.patch(args.templateId, {
        status: "archived",
        archivedAt: now,
        updatedAt: now,
      });
      return { ok: true, status: "archived" as const };
    }
    await ctx.db.patch(args.templateId, {
      status: row.publishedVersion != null ? "published" : "draft",
      archivedAt: undefined,
      updatedAt: now,
    });
    return {
      ok: true,
      status: (row.publishedVersion != null ? "published" : "draft") as
        | "published"
        | "draft",
    };
  },
});

export const listAutomationRoutes = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "settings.access");
    return await ctx.db
      .query("communicationAutomationRoutes")
      .withIndex("by_org_enabled", (q) => q.eq("organizationId", args.organizationId).eq("enabled", true))
      .collect();
  },
});

export const upsertAutomationRoute = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    routeId: v.optional(v.id("communicationAutomationRoutes")),
    name: v.string(),
    enabled: v.boolean(),
    triggerKind: v.union(
      v.literal("pipeline_stage_changed"),
      v.literal("task_overdue"),
      v.literal("document_uploaded"),
      v.literal("comment_mentioned"),
      v.literal("assignment_changed"),
      v.literal("borrower_inactive"),
      v.literal("lender_response"),
      v.literal("manual_invocation"),
    ),
    channel: channelV,
    recipientMode: v.union(
      v.literal("explicit"),
      v.literal("file_contacts"),
      v.literal("assigned_user"),
      v.literal("watchers"),
      v.literal("lender_contacts"),
      v.literal("organization_role"),
    ),
    staticRecipients: v.optional(v.array(v.string())),
    timingMode: v.union(v.literal("immediate"), v.literal("delay"), v.literal("scheduled")),
    delayMinutes: v.optional(v.number()),
    priority: v.optional(priorityV),
    templateId: v.optional(v.id("communicationTemplates")),
    templateVersionId: v.optional(v.id("communicationTemplateVersions")),
  },
  handler: async (ctx, args) => {
    await assertOrgPermission(ctx, args.organizationId, args.memberUserKey, "settings.access");
    const now = Date.now();
    const patch = {
      name: args.name.trim(),
      enabled: args.enabled,
      triggerKind: args.triggerKind,
      channel: args.channel,
      recipientMode: args.recipientMode,
      staticRecipients: args.staticRecipients?.map((value) => value.trim()).filter(Boolean),
      timingMode: args.timingMode,
      delayMinutes: args.delayMinutes,
      priority: args.priority,
      templateId: args.templateId,
      templateVersionId: args.templateVersionId,
      updatedAt: now,
    };
    if (args.routeId) {
      await ctx.db.patch(args.routeId, patch);
      return { routeId: args.routeId };
    }
    const routeId = await ctx.db.insert("communicationAutomationRoutes", {
      organizationId: args.organizationId,
      createdByUserKey: (args.memberUserKey ?? "").trim() || "system",
      createdAt: now,
      ...patch,
    });
    return { routeId };
  },
});

export const invokeAutomationRoute = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
    routeId: v.id("communicationAutomationRoutes"),
    relatedPipelineFileId: v.optional(v.id("pipeline")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedLenderId: v.optional(v.id("lenders")),
  },
  handler: async (ctx, args) => {
    await assertOrgMember(ctx, args.organizationId, args.memberUserKey);
    const route = await ctx.db.get(args.routeId);
    if (!route || route.organizationId !== args.organizationId || !route.enabled) {
      throw new Error("Automation route not found.");
    }
    const version = route.templateVersionId
      ? await ctx.db.get(route.templateVersionId)
      : null;
    const variables = await buildVariables(ctx, {
      organizationId: args.organizationId,
      relatedPipelineFileId: args.relatedPipelineFileId,
      relatedContactId: args.relatedContactId,
      relatedLenderId: args.relatedLenderId,
      senderName: args.memberUserKey,
    });
    const preview = buildCommunicationPreview({
      subjectTemplate: version?.subjectTemplate,
      bodyTemplate: version?.bodyTemplate ?? "Automation message",
      variables,
    });
    const draft = await upsertDraftRow(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      channel: route.channel,
      relatedPipelineFileId: args.relatedPipelineFileId,
      relatedContactId: args.relatedContactId,
      relatedLenderId: args.relatedLenderId,
      subject: preview.subject,
      bodyText: preview.bodyText,
      recipientSummary: route.staticRecipients ?? [],
      priority: route.priority ?? "normal",
      isTestMode: false,
    });
    const scheduledFor =
      route.timingMode === "delay" && route.delayMinutes
        ? Date.now() + route.delayMinutes * 60_000
        : undefined;
    await queueDraftRow(ctx, {
      organizationId: args.organizationId,
      memberUserKey: args.memberUserKey,
      outboundMessageId: draft.outboundMessageId,
      scheduledFor,
    });
    return draft;
  },
});

export const internalGetDeliveryPayload = internalQuery({
  args: { outboundMessageId: v.id("outboundMessages") },
  handler: async (ctx, { outboundMessageId }) => {
    const message = await ctx.db.get(outboundMessageId);
    if (!message) return null;
    const attachments = await ctx.db
      .query("outboundMessageAttachments")
      .withIndex("by_message", (q) => q.eq("outboundMessageId", outboundMessageId))
      .collect();
    return { message, attachments };
  },
});

export const claimOutboundMessage = internalMutation({
  args: { outboundMessageId: v.id("outboundMessages") },
  handler: async (ctx, { outboundMessageId }) => {
    const row = await ctx.db.get(outboundMessageId);
    const now = Date.now();
    if (!row) return { claimed: false as const };
    if (row.status !== "queued" && row.status !== "scheduled") {
      return { claimed: false as const };
    }
    if ((row.scheduledFor ?? 0) > now) return { claimed: false as const };
    await ctx.db.patch(outboundMessageId, {
      status: "sending",
      sendingAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("outboundMessageAttempts", {
      outboundMessageId,
      organizationId: row.organizationId,
      attemptNumber: row.retryCount + 1,
      channel: row.channel,
      providerKey: row.providerKey,
      status: "sending",
      startedAt: now,
      createdAt: now,
    });
    await ctx.db.insert("outboundProviderEvents", {
      outboundMessageId,
      organizationId: row.organizationId,
      channel: row.channel,
      providerKey: row.providerKey,
      eventType: "sending",
      at: now,
      summary: `${row.channel} delivery started`,
    });
    return { claimed: true as const };
  },
});

export const markOutboundSuccess = internalMutation({
  args: {
    outboundMessageId: v.id("outboundMessages"),
    providerMessageId: v.string(),
    responsePayload: v.optional(v.any()),
    deliveredNow: v.optional(v.boolean()),
    mirrorEmailLog: v.optional(
      v.object({
        subject: v.string(),
        bodyText: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outboundMessageId);
    if (!row) return;
    const now = Date.now();
    const nextStatus =
      row.channel === "portal" || args.deliveredNow ? "delivered" : "sent";
    await ctx.db.patch(args.outboundMessageId, {
      status: nextStatus,
      providerMessageId: args.providerMessageId.slice(0, 160),
      sentAt: now,
      ...(nextStatus === "delivered" ? { deliveredAt: now } : {}),
      latestError: undefined,
      providerResponsePayload: args.responsePayload,
      updatedAt: now,
    });
    const attempts = await ctx.db
      .query("outboundMessageAttempts")
      .withIndex("by_message_attempt", (q) =>
        q.eq("outboundMessageId", args.outboundMessageId),
      )
      .order("desc")
      .take(1);
    if (attempts[0]) {
      await ctx.db.patch(attempts[0]._id, {
        status: nextStatus === "delivered" ? "delivered" : "sent",
        completedAt: now,
        providerResponsePayload: args.responsePayload,
      });
    }
    await ctx.db.insert("outboundProviderEvents", {
      outboundMessageId: args.outboundMessageId,
      organizationId: row.organizationId,
      channel: row.channel,
      providerKey: row.providerKey,
      eventType: nextStatus,
      at: now,
      summary: `${row.channel} ${nextStatus}`,
      payload: args.responsePayload,
    });

    if (row.threadId) {
      await ctx.db.patch(row.threadId, {
        lastMessageAt: now,
        updatedAt: now,
        ...(row.channel === "portal" && row.rootFileMessageId
          ? { rootFileMessageId: row.rootFileMessageId }
          : {}),
      });
    }

    if (row.channel === "email") {
      const existingMirror = await ctx.db
        .query("systemEmailLog")
        .withIndex("by_outbound_message", (q) =>
          q.eq("outboundMessageId", args.outboundMessageId),
        )
        .first();
      if (existingMirror) {
        await ctx.db.patch(existingMirror._id, {
          status: "sent",
          providerMessageId: args.providerMessageId.slice(0, 120),
          updatedAt: now,
          sentAt: now,
          errorMessage: undefined,
        });
      } else {
        const emailLogId = await ctx.db.insert("systemEmailLog", {
          organizationId: row.organizationId,
          sentByUserKey: row.senderUserKey,
          status: "sent",
          toAddresses: row.recipientSummary,
          subject: row.subject ?? "(no subject)",
          bodyText: args.mirrorEmailLog?.bodyText ?? row.bodyText,
          bodyHtmlForProvider: row.bodyHtml,
          relatedPipelineFileId: row.relatedPipelineFileId,
          relatedContactId: row.relatedContactId,
          outboundMessageId: row._id,
          provider: "resend",
          providerMessageId: args.providerMessageId.slice(0, 120),
          trackOpens: false,
          openCount: 0,
          correlationId: randomHexSync(16),
          hasInboundReply: false,
          createdAt: row.createdAt,
          updatedAt: now,
          sentAt: now,
        });
        await ctx.db.patch(args.outboundMessageId, {
          rootSystemEmailLogId: emailLogId,
          updatedAt: now,
        });
      }
    }

    const eventType =
      nextStatus === "delivered" ? "communication_delivered" : "communication_sent";
    await insertCollaborationActivityEvent(ctx, {
      organizationId: row.organizationId,
      eventType,
      visibility: "entity_participants",
      actorUserKey: row.senderUserKey,
      summary:
        row.channel === "email"
          ? `Email ${nextStatus} to ${row.recipientSummary.join(", ")}`
          : `Portal message ${nextStatus}`,
      pipelineFileId: row.relatedPipelineFileId,
      contactId: row.relatedContactId,
      lenderId: row.relatedLenderId,
      mirrorToFeed: true,
      at: now,
    });
  },
});

export const markOutboundFailure = internalMutation({
  args: {
    outboundMessageId: v.id("outboundMessages"),
    errorMessage: v.string(),
  },
  handler: async (ctx, { outboundMessageId, errorMessage }) => {
    const row = await ctx.db.get(outboundMessageId);
    if (!row) return { scheduled: false as const, dead: false as const };
    const now = Date.now();
    const nextRetryCount = row.retryCount + 1;
    const attempts = await ctx.db
      .query("outboundMessageAttempts")
      .withIndex("by_message_attempt", (q) => q.eq("outboundMessageId", outboundMessageId))
      .order("desc")
      .take(1);
    if (attempts[0]) {
      await ctx.db.patch(attempts[0]._id, {
        status: nextRetryCount > row.maxRetries ? "dead" : "failed",
        completedAt: now,
        nextRetryAt: nextRetryCount > row.maxRetries ? undefined : now + backoffMs(row.retryCount),
        errorMessage: errorMessage.slice(0, 4000),
      });
    }
    if (nextRetryCount > row.maxRetries) {
      await ctx.db.patch(outboundMessageId, {
        status: "failed",
        failedAt: now,
        retryCount: nextRetryCount,
        latestError: errorMessage.slice(0, 4000),
        updatedAt: now,
      });
      await ctx.db.insert("outboundProviderEvents", {
        outboundMessageId,
        organizationId: row.organizationId,
        channel: row.channel,
        providerKey: row.providerKey,
        eventType: "failed",
        at: now,
        summary: errorMessage.slice(0, 500),
      });
      const existingMirror = await ctx.db
        .query("systemEmailLog")
        .withIndex("by_outbound_message", (q) =>
          q.eq("outboundMessageId", outboundMessageId),
        )
        .first();
      if (existingMirror) {
        await ctx.db.patch(existingMirror._id, {
          status: "failed",
          errorMessage: errorMessage.slice(0, 4000),
          updatedAt: now,
        });
      }
      await insertCollaborationActivityEvent(ctx, {
        organizationId: row.organizationId,
        eventType: "communication_failed",
        visibility: "entity_participants",
        actorUserKey: row.senderUserKey,
        summary: `${row.channel} delivery failed`,
        delta: { errorMessage: errorMessage.slice(0, 500) },
        pipelineFileId: row.relatedPipelineFileId,
        contactId: row.relatedContactId,
        lenderId: row.relatedLenderId,
        mirrorToFeed: true,
        at: now,
      });
      return { scheduled: false as const, dead: true as const };
    }

    const nextAttemptAt = now + backoffMs(row.retryCount);
    await ctx.db.patch(outboundMessageId, {
      status: "queued",
      retryCount: nextRetryCount,
      latestError: errorMessage.slice(0, 4000),
      scheduledFor: nextAttemptAt,
      updatedAt: now,
    });
    await ctx.db.insert("outboundProviderEvents", {
      outboundMessageId,
      organizationId: row.organizationId,
      channel: row.channel,
      providerKey: row.providerKey,
      eventType: "retry_scheduled",
      at: now,
      summary: errorMessage.slice(0, 500),
    });
    await insertCollaborationActivityEvent(ctx, {
      organizationId: row.organizationId,
      eventType: "communication_retry_scheduled",
      visibility: "entity_participants",
      actorUserKey: row.senderUserKey,
      summary: `${row.channel} retry scheduled`,
      delta: { errorMessage: errorMessage.slice(0, 500), retryAt: nextAttemptAt },
      pipelineFileId: row.relatedPipelineFileId,
      contactId: row.relatedContactId,
      lenderId: row.relatedLenderId,
      mirrorToFeed: true,
      at: now,
    });
    await ctx.scheduler.runAfter(
      Math.max(0, nextAttemptAt - now),
      internal.communications.processOutboundMessage,
      { outboundMessageId },
    );
    return { scheduled: true as const, dead: false as const };
  },
});

export const deliverPortalMessage = internalMutation({
  args: { outboundMessageId: v.id("outboundMessages") },
  handler: async (ctx, { outboundMessageId }) => {
    const row = await ctx.db.get(outboundMessageId);
    if (!row || row.channel !== "portal" || !row.relatedPipelineFileId) {
      throw new Error("Portal message context is incomplete.");
    }
    const file = await ctx.db.get(row.relatedPipelineFileId);
    if (!file) throw new Error("Pipeline file not found.");
    let rootId: Id<"fileMessages"> | undefined = row.rootFileMessageId;
    if (!rootId && row.threadId) {
      const thread = await ctx.db.get(row.threadId);
      rootId = thread?.rootFileMessageId;
    }
    const now = Date.now();
    const newRoot = !rootId;
    const messageId = await ctx.db.insert("fileMessages", {
      pipelineFileId: row.relatedPipelineFileId,
      contactId: row.relatedContactId,
      audience: "portal",
      parentMessageId: rootId,
      isRoot: newRoot,
      threadRootId: rootId,
      body: row.bodyText,
      authorKind: "team",
      teamUserKey: row.senderUserKey,
      authorLabel: row.senderLabel ?? row.senderUserKey,
      createdAt: now,
      updatedAt: now,
    });
    if (newRoot) {
      rootId = messageId;
      await ctx.db.patch(messageId, { threadRootId: messageId });
      if (row.threadId) {
        await ctx.db.patch(row.threadId, {
          rootFileMessageId: messageId,
          updatedAt: now,
        });
      }
    }
    const attachments = await ctx.db
      .query("outboundMessageAttachments")
      .withIndex("by_message", (q) => q.eq("outboundMessageId", outboundMessageId))
      .collect();
    for (const attachment of attachments) {
      await ctx.db.insert("fileMessageAttachments", {
        messageId,
        storageId: attachment.storageId,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        createdAt: now,
      });
    }
    await ctx.db.patch(outboundMessageId, {
      rootFileMessageId: rootId,
      updatedAt: now,
    });
    return { rootFileMessageId: rootId, messageId };
  },
});

export const processOutboundMessage = internalAction({
  args: { outboundMessageId: v.id("outboundMessages") },
  handler: async (ctx, { outboundMessageId }) => {
    const claim = await ctx.runMutation(internal.communications.claimOutboundMessage, {
      outboundMessageId,
    });
    if (!claim.claimed) return { ok: false as const, reason: "not_due" };

    const payload = await ctx.runQuery(internal.communications.internalGetDeliveryPayload, {
      outboundMessageId,
    });
    if (!payload) return { ok: false as const, reason: "missing" };

    try {
      if (payload.message.channel === "portal") {
        const portalResult = await ctx.runMutation(internal.communications.deliverPortalMessage, {
          outboundMessageId,
        });
        await ctx.runMutation(internal.communications.markOutboundSuccess, {
          outboundMessageId,
          providerMessageId: `portal-${String(portalResult.messageId)}`,
          deliveredNow: true,
          responsePayload: portalResult,
        });
        return { ok: true as const };
      }

      const provider = resolveCommunicationProvider({
        channel: payload.message.channel,
        providerKey: payload.message.providerKey,
      });
      const attachmentDescriptors = payload.attachments.map(
        (attachment: Doc<"outboundMessageAttachments">) => ({
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
      }),
      );
      const result = await provider.send({
        channel: payload.message.channel,
        providerKey: payload.message.providerKey,
        recipients: payload.message.recipientSummary.map((value: string) => ({ value })),
        subject: payload.message.subject ?? "(no subject)",
        bodyText: payload.message.bodyText,
        bodyHtml: payload.message.bodyHtml,
        attachments: attachmentDescriptors,
        senderLabel: payload.message.senderLabel,
        metadata: {
          outboundMessageId,
          threadId: payload.message.threadId,
        },
      });
      await ctx.runMutation(internal.communications.markOutboundSuccess, {
        outboundMessageId,
        providerMessageId: result.providerMessageId,
        responsePayload: result.responsePayload,
      });
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.communications.markOutboundFailure, {
        outboundMessageId,
        errorMessage: message,
      });
      return { ok: false as const, reason: "send_failed" };
    }
  },
});

export const sweepDueOutboundMessages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const queued = await ctx.db
      .query("outboundMessages")
      .withIndex("by_status_schedule", (q) => q.eq("status", "queued"))
      .take(64);
    const scheduled = await ctx.db
      .query("outboundMessages")
      .withIndex("by_status_schedule", (q) => q.eq("status", "scheduled"))
      .take(64);
    for (const row of [...queued, ...scheduled]) {
      if ((row.scheduledFor ?? 0) > now) continue;
      await ctx.scheduler.runAfter(0, internal.communications.processOutboundMessage, {
        outboundMessageId: row._id,
      });
    }
    return { ok: true as const };
  },
});

export const recoverStaleSendingMessages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("outboundMessages")
      .withIndex("by_status_updated", (q) => q.eq("status", "sending"))
      .take(64);
    for (const row of rows) {
      if (row.status !== "sending") continue;
      if (!row.sendingAt || now - row.sendingAt < STALE_SENDING_MS) continue;
      await ctx.db.patch(row._id, {
        status: "queued",
        scheduledFor: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.communications.processOutboundMessage, {
        outboundMessageId: row._id,
      });
    }
    return { ok: true as const };
  },
});

export const sendPortalMagicLink = internalAction({
  args: {
    to: v.string(),
    plainToken: v.string(),
    workspaceLabel: v.string(),
    linkExpiresDescription: v.optional(v.string()),
    permissionLabel: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const origin = (
      process.env.CLIENT_PORTAL_ORIGIN?.trim() || "http://127.0.0.1:3004"
    ).replace(/\/$/, "");
    const url = `${origin}/portal/magic?t=${encodeURIComponent(args.plainToken)}`;
    const adapter = createResendEmailAdapter();
    const text = [
      `You've been invited to your loan file workspace (${args.workspaceLabel}).`,
      `Access level: ${args.permissionLabel ?? "View and upload documents"}.`,
      "",
      `Sign in (this link expires in ${args.linkExpiresDescription ?? "24 hours"}):`,
      url,
      "",
      "If you did not expect this message, you can ignore it.",
    ].join("\n");
    await adapter.send({
      channel: "email",
      providerKey: "resend",
      recipients: [{ value: args.to.trim() }],
      subject: `Sign in to your ${args.workspaceLabel} portal`,
      bodyText: text,
      bodyHtml: simpleHtmlFromText(text),
    });
    return { ok: true as const };
  },
});
