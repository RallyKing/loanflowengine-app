import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  resolveOrgPipelineFileAccessLevel,
} from "./organizationAccess";
import { resolvePreferredEmail } from "../lib/contact/contactMethods";

export const MAX_FILE_MESSAGE_BODY_LEN = 8000;
const MAX_BODY_LEN = MAX_FILE_MESSAGE_BODY_LEN;
export const MAX_FILE_MESSAGE_ATTACHMENTS = 8;
const MAX_ATTACHMENTS_PER_MESSAGE = MAX_FILE_MESSAGE_ATTACHMENTS;
export const MAX_FILE_MESSAGE_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const audienceV = v.union(v.literal("internal"), v.literal("portal"));

function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, "").trim().slice(0, 255) || "attachment";
}

function teamAuthorLabel(userKey: string): string {
  const k = userKey.trim();
  if (!k) return "Team";
  return k.length <= 24 ? k : `${k.slice(0, 21)}…`;
}

async function assertOptionalContactLinkedToFile(
  ctx: MutationCtx,
  file: Doc<"pipeline">,
  contactId: Id<"contacts"> | undefined,
): Promise<void> {
  if (!contactId) return;
  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found.");
  const fo = file.organizationId;
  const co = contact.organizationId;
  if (fo && co && fo !== co) {
    throw new Error("Contact belongs to a different organization than this file.");
  }
  const link = await ctx.db
    .query("contactFileLinks")
    .withIndex("by_contact_file", (q) =>
      q.eq("contactId", contactId).eq("fileId", file._id),
    )
    .first();
  if (!link) {
    throw new Error("Link this contact to the file before mentioning them on a message.");
  }
}

async function attachmentCount(ctx: MutationCtx, messageId: Id<"fileMessages">) {
  return await ctx.db
    .query("fileMessageAttachments")
    .withIndex("by_message", (q) => q.eq("messageId", messageId))
    .collect()
    .then((r) => r.length);
}

async function getStorageMetaWithRetry(
  storage: MutationCtx["storage"],
  storageId: Id<"_storage">,
) {
  for (let i = 0; i < 15; i++) {
    const meta = await storage.getMetadata(storageId);
    if (meta) return meta;
    await new Promise<void>((r) => setTimeout(r, 100));
  }
  return null;
}

export const getCapabilities = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const file = await ctx.db.get(pipelineFileId);
    if (!file) return null;
    try {
      await assertCanReadPipelineRow(ctx, file, memberUserKey);
    } catch {
      return { canRead: false as const, canPost: false as const };
    }
    if (!file.organizationId) {
      return { canRead: true as const, canPost: true as const };
    }
    const key = memberUserKey?.trim();
    if (!key) {
      return { canRead: false as const, canPost: false as const };
    }
    const level = await resolveOrgPipelineFileAccessLevel(ctx, file, memberUserKey);
    return {
      canRead: level !== "none",
      canPost: level === "edit",
    };
  },
});

export const listLinkedContactsForMessaging = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const file = await ctx.db.get(pipelineFileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const links = await ctx.db
      .query("contactFileLinks")
      .withIndex("by_file", (q) => q.eq("fileId", pipelineFileId))
      .order("desc")
      .collect();
    const out: Array<{
      contactId: Id<"contacts">;
      name: string;
      email: string;
      role: string;
    }> = [];
    for (const link of links) {
      const c = await ctx.db.get(link.contactId);
      if (c) {
        out.push({
          contactId: c._id,
          name: c.name,
          email: resolvePreferredEmail(c),
          role: link.role,
        });
      }
    }
    return out;
  },
});

export const listThreadRoots = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    audience: audienceV,
    contactId: v.optional(v.id("contacts")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, args.memberUserKey);

    const cap = Math.min(80, Math.max(1, args.limit ?? 40));
    const roots = await ctx.db
      .query("fileMessages")
      .withIndex("by_file_audience_root_created", (q) =>
        q
          .eq("pipelineFileId", args.pipelineFileId)
          .eq("audience", args.audience)
          .eq("isRoot", true),
      )
      .order("desc")
      .take(cap * 2);

    const filtered = roots.filter((m) => {
      if (args.contactId && m.contactId !== args.contactId) return false;
      return true;
    });

    const slice = filtered.slice(0, cap);
    const out: Array<{
      message: Doc<"fileMessages">;
      replyCount: number;
      attachmentCount: number;
    }> = [];
    for (const root of slice) {
      const thread = await ctx.db
        .query("fileMessages")
        .withIndex("by_thread_created", (q) => q.eq("threadRootId", root._id))
        .collect();
      const replyCount = Math.max(0, thread.length - 1);
      const att = await ctx.db
        .query("fileMessageAttachments")
        .withIndex("by_message", (q) => q.eq("messageId", root._id))
        .collect();
      out.push({ message: root, replyCount, attachmentCount: att.length });
    }
    return out;
  },
});

export const listThreadMessages = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    threadRootId: v.id("fileMessages"),
  },
  handler: async (ctx, { pipelineFileId, memberUserKey, threadRootId }) => {
    const file = await ctx.db.get(pipelineFileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const root = await ctx.db.get(threadRootId);
    if (!root || root.pipelineFileId !== pipelineFileId) return [];

    const rows = await ctx.db
      .query("fileMessages")
      .withIndex("by_thread_created", (q) => q.eq("threadRootId", threadRootId))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);

    const enriched: Array<{
      message: Doc<"fileMessages">;
      attachments: Doc<"fileMessageAttachments">[];
    }> = [];
    for (const m of rows) {
      const att = await ctx.db
        .query("fileMessageAttachments")
        .withIndex("by_message", (q) => q.eq("messageId", m._id))
        .collect();
      att.sort((a, b) => a.createdAt - b.createdAt);
      enriched.push({ message: m, attachments: att });
    }
    return enriched;
  },
});

export const getAttachmentUrl = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    attachmentId: v.id("fileMessageAttachments"),
  },
  handler: async (ctx, { pipelineFileId, memberUserKey, attachmentId }) => {
    const file = await ctx.db.get(pipelineFileId);
    if (!file) return { status: "not_found" as const };
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const att = await ctx.db.get(attachmentId);
    if (!att) return { status: "not_found" as const };
    const msg = await ctx.db.get(att.messageId);
    if (!msg || msg.pipelineFileId !== pipelineFileId) {
      return { status: "forbidden" as const };
    }
    const url = await ctx.storage.getUrl(att.storageId);
    return {
      status: "ok" as const,
      url,
      fileName: att.fileName,
    };
  },
});

export const postThreadRoot = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    audience: audienceV,
    body: v.string(),
    contactId: v.optional(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file) throw new Error("File not found.");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    await assertOptionalContactLinkedToFile(ctx, file, args.contactId);
    const body = args.body.trim().slice(0, MAX_BODY_LEN);
    if (!body) throw new Error("Message cannot be empty.");

    const now = Date.now();
    const userKey = (args.memberUserKey ?? "").trim();
    const id = await ctx.db.insert("fileMessages", {
      pipelineFileId: args.pipelineFileId,
      contactId: args.contactId,
      audience: args.audience,
      parentMessageId: undefined,
      isRoot: true,
      threadRootId: undefined,
      body,
      authorKind: "team",
      teamUserKey: userKey,
      clientEmailKey: undefined,
      authorLabel: teamAuthorLabel(userKey),
      organizationId: file.organizationId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, { threadRootId: id });
    return { messageId: id };
  },
});

export const postThreadReply = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    parentMessageId: v.id("fileMessages"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file) throw new Error("File not found.");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const parent = await ctx.db.get(args.parentMessageId);
    if (!parent || parent.pipelineFileId !== args.pipelineFileId) {
      throw new Error("Parent message not found.");
    }
    const threadRootId = parent.threadRootId ?? parent._id;
    if (!threadRootId) throw new Error("Invalid thread.");

    const body = args.body.trim().slice(0, MAX_BODY_LEN);
    if (!body) throw new Error("Message cannot be empty.");

    const now = Date.now();
    const userKey = (args.memberUserKey ?? "").trim();
    const id = await ctx.db.insert("fileMessages", {
      pipelineFileId: args.pipelineFileId,
      contactId: parent.contactId,
      audience: parent.audience,
      parentMessageId: parent._id,
      isRoot: false,
      threadRootId,
      body,
      authorKind: "team",
      teamUserKey: userKey,
      clientEmailKey: undefined,
      authorLabel: teamAuthorLabel(userKey),
      organizationId: file.organizationId,
      createdAt: now,
      updatedAt: now,
    });
    return { messageId: id };
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    messageId: v.id("fileMessages"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file) throw new Error("File not found.");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.pipelineFileId !== args.pipelineFileId) {
      throw new Error("Message not found.");
    }
    const n = await attachmentCount(ctx, args.messageId);
    if (n >= MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachUploadToMessage = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    memberUserKey: v.optional(v.string()),
    messageId: v.id("fileMessages"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file) throw new Error("File not found.");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.pipelineFileId !== args.pipelineFileId) {
      throw new Error("Message not found.");
    }
    const n = await attachmentCount(ctx, args.messageId);
    if (n >= MAX_ATTACHMENTS_PER_MESSAGE) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* best effort */
      }
      throw new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);
    }

    const meta = await getStorageMetaWithRetry(ctx.storage, args.storageId);
    if (!meta) {
      throw new Error("Upload not found. Try again.");
    }
    const byteSize = args.size ?? meta.size ?? 0;
    if (byteSize > MAX_FILE_MESSAGE_ATTACHMENT_BYTES) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* best effort */
      }
      throw new Error(
        `File exceeds maximum size (${Math.round(MAX_FILE_MESSAGE_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
      );
    }

    const id = await ctx.db.insert("fileMessageAttachments", {
      messageId: args.messageId,
      storageId: args.storageId,
      fileName: safeFileName(args.fileName),
      contentType: args.contentType || meta.contentType || undefined,
      size: args.size ?? meta.size,
      createdAt: Date.now(),
    });
    return { attachmentId: id };
  },
});
