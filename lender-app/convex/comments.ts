import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOrgPermission } from "./organizationRbac";
import { assertOrganizationId } from "./organizationValidators";
import { resolveMemberUserKey } from "./organizationAccess";
import { dispatchUserNotification } from "./notifications";
import { insertCollaborationActivityEvent } from "./activityEvents";

const subjectKindV = v.union(
  v.literal("pipeline_file"),
  v.literal("task"),
  v.literal("lender"),
  v.literal("library_document"),
  v.literal("internal_note"),
);

const audienceV = v.union(v.literal("internal"), v.literal("portal"));

const MAX_COMMENT = 12000;

function extractMentionKeys(body: string): string[] {
  const keys = new Set<string>();
  const re = /@([a-zA-Z0-9_./@-]{1,128})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const k = m[1]?.trim();
    if (k) keys.add(k);
  }
  return [...keys];
}

type SubjectKind = Doc<"collaborationThreads">["subjectKind"];

function assertSubjectKeys(
  subjectKind: SubjectKind,
  pipelineFileId: Id<"pipeline"> | undefined,
  taskId: Id<"tasks"> | undefined,
  lenderId: Id<"lenders"> | undefined,
  libraryDocumentId: Id<"libraryDocuments"> | undefined,
  internalNoteKey: string | undefined,
) {
  if (subjectKind === "pipeline_file" && !pipelineFileId) {
    throw new Error("pipelineFileId required.");
  }
  if (subjectKind === "task" && !taskId) throw new Error("taskId required.");
  if (subjectKind === "lender" && !lenderId) throw new Error("lenderId required.");
  if (subjectKind === "library_document" && !libraryDocumentId) {
    throw new Error("libraryDocumentId required.");
  }
  if (subjectKind === "internal_note" && !internalNoteKey?.trim()) {
    throw new Error("internalNoteKey required.");
  }
}

export const createThread = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    subjectKind: subjectKindV,
    title: v.optional(v.string()),
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    internalNoteKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      subjectKind,
      title,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      internalNoteKey,
    },
  ) => {
    const actor = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, actor, "files.edit");
    assertSubjectKeys(
      subjectKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      internalNoteKey,
    );
    const now = Date.now();
    return await ctx.db.insert("collaborationThreads", {
      organizationId,
      subjectKind,
      title: title?.trim() || undefined,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      internalNoteKey: internalNoteKey?.trim() || undefined,
      createdByUserKey: actor,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addComment = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    threadId: v.id("collaborationThreads"),
    body: v.string(),
    parentCommentId: v.optional(v.id("collaborationComments")),
    audience: audienceV,
    mentionUserKeys: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      threadId,
      body,
      parentCommentId,
      audience,
      mentionUserKeys,
    },
  ) => {
    const actor = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, actor, "files.edit");

    const thread = await ctx.db.get(threadId);
    if (!thread || thread.organizationId !== organizationId) {
      throw new Error("Thread not found.");
    }

    const text = body.trim();
    if (!text || text.length > MAX_COMMENT) {
      throw new Error("Invalid comment body.");
    }

    const autoMentions = extractMentionKeys(text);
    const mentions = [
      ...new Set([...(mentionUserKeys ?? []), ...autoMentions]),
    ];

    const now = Date.now();
    const id = await ctx.db.insert("collaborationComments", {
      organizationId,
      threadId,
      parentCommentId,
      body: text,
      authorUserKey: actor,
      mentionUserKeys: mentions.length ? mentions : undefined,
      audience,
      createdAt: now,
    });

    await ctx.db.patch(threadId, { updatedAt: now });

    await insertCollaborationActivityEvent(ctx, {
      organizationId,
      eventType: "comment_added",
      visibility: audience === "portal" ? "entity_participants" : "org_wide",
      actorUserKey: actor,
      summary: "New comment",
      delta: { threadId, commentId: id, parentCommentId },
      pipelineFileId: thread.pipelineFileId,
      taskId: thread.taskId,
      lenderId: thread.lenderId,
      libraryDocumentId: thread.libraryDocumentId,
      collaborationThreadId: threadId,
    });

    for (const m of mentions) {
      if (m === actor) continue;
      await dispatchUserNotification(ctx, {
        userKey: m,
        category: "comment_activity",
        summary: "You were mentioned in a thread",
        detail: text.slice(0, 280),
        actorUserKey: actor,
        fileId: thread.pipelineFileId,
        taskId: thread.taskId,
        lenderId: thread.lenderId,
        libraryDocumentId: thread.libraryDocumentId,
        collaborationThreadId: threadId,
        dedupeKey: `mention:${id}:${m}`,
      });
    }

    return id;
  },
});

export const listThreadsForSubject = query({
  args: {
    memberUserKey: v.optional(v.string()),
    organizationId: v.id("organizations"),
    subjectKind: subjectKindV,
    pipelineFileId: v.optional(v.id("pipeline")),
    taskId: v.optional(v.id("tasks")),
    lenderId: v.optional(v.id("lenders")),
    libraryDocumentId: v.optional(v.id("libraryDocuments")),
    internalNoteKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      memberUserKey,
      organizationId,
      subjectKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      internalNoteKey,
    },
  ) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const { id: orgId } = await assertOrganizationId(ctx, organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    assertSubjectKeys(
      subjectKind,
      pipelineFileId,
      taskId,
      lenderId,
      libraryDocumentId,
      internalNoteKey,
    );

    if (subjectKind === "internal_note" && internalNoteKey?.trim()) {
      return await ctx.db
        .query("collaborationThreads")
        .withIndex("by_org_note_key", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("internalNoteKey", internalNoteKey.trim()),
        )
        .order("desc")
        .take(80);
    }
    if (subjectKind === "pipeline_file" && pipelineFileId) {
      return await ctx.db
        .query("collaborationThreads")
        .withIndex("by_org_file", (q) =>
          q.eq("organizationId", organizationId).eq("pipelineFileId", pipelineFileId),
        )
        .order("desc")
        .take(80);
    }
    if (subjectKind === "task" && taskId) {
      return await ctx.db
        .query("collaborationThreads")
        .withIndex("by_org_task", (q) =>
          q.eq("organizationId", organizationId).eq("taskId", taskId),
        )
        .order("desc")
        .take(80);
    }
    if (subjectKind === "lender" && lenderId) {
      return await ctx.db
        .query("collaborationThreads")
        .withIndex("by_org_lender", (q) =>
          q.eq("organizationId", organizationId).eq("lenderId", lenderId),
        )
        .order("desc")
        .take(80);
    }
    if (subjectKind === "library_document" && libraryDocumentId) {
      return await ctx.db
        .query("collaborationThreads")
        .withIndex("by_org_doc", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("libraryDocumentId", libraryDocumentId),
        )
        .order("desc")
        .take(80);
    }
    return [];
  },
});

export const listCommentsForThread = query({
  args: {
    memberUserKey: v.optional(v.string()),
    threadId: v.id("collaborationThreads"),
  },
  handler: async (ctx, { memberUserKey, threadId }) => {
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const thread = await ctx.db.get(threadId);
    if (!thread) return [];
    const { id: orgId } = await assertOrganizationId(ctx, thread.organizationId);
    await assertOrgPermission(ctx, orgId, key, "files.view");
    return await ctx.db
      .query("collaborationComments")
      .withIndex("by_thread_created", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(200);
  },
});

export const resolveThread = mutation({
  args: {
    memberUserKey: v.optional(v.string()),
    threadId: v.id("collaborationThreads"),
  },
  handler: async (ctx, { memberUserKey, threadId }) => {
    const actor = await resolveMemberUserKey(ctx, memberUserKey);
    const thread = await ctx.db.get(threadId);
    if (!thread) throw new Error("Thread not found.");
    const { id: orgId } = await assertOrganizationId(ctx, thread.organizationId);
    await assertOrgPermission(ctx, orgId, actor, "files.edit");
    const now = Date.now();
    await ctx.db.patch(threadId, {
      resolvedAt: now,
      resolvedByUserKey: actor,
      updatedAt: now,
    });
  },
});
