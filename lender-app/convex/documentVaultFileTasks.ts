import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import { randomHex, sha256Hex } from "./clientPortalCrypto";
import { purgeLibraryDocumentIfOrphaned } from "./libraryDocumentsCleanup";
import {
  assignedBlockEntryV,
  fileTaskPriorityV,
  fileTaskTypeV,
  persistAssignedBlocksPatch,
} from "./documentVaultTaskTypes";
import { isClientPortalAssignableBlock } from "../lib/documentVaultClientBlocks";
import { recordBrokerVaultReview } from "./documentVaultActivity";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

function validateTaskConfig(args: {
  taskType: Doc<"documentVaultFileTasks">["taskType"];
  clientInstructionText?: string;
  instructionUrl?: string;
  assignedBlockEntries?: { blockId: string; sortOrder: number }[];
}): void {
  const taskType = args.taskType ?? "document_upload";
  if (taskType === "client_instruction") {
    const text = args.clientInstructionText?.trim() ?? "";
    const url = args.instructionUrl?.trim() ?? "";
    if (!text && !url) {
      throw new Error("Add instruction text or a website link.");
    }
  }
  if (taskType === "block_assignment") {
    const entries =
      args.assignedBlockEntries?.filter((e) =>
        isClientPortalAssignableBlock(e.blockId.trim()),
      ) ?? [];
    if (entries.length === 0) {
      throw new Error("Select at least one pipeline block.");
    }
  }
}

function portalVisibleForTaskType(
  taskType: NonNullable<Doc<"documentVaultFileTasks">["taskType"]>,
  requested?: boolean,
): boolean {
  if (taskType === "internal_task") return false;
  return requested ?? true;
}

const MAX_TITLE_LEN = 200;

export const fileTaskStatusV = v.union(
  v.literal("incomplete"),
  v.literal("pending_review"),
  v.literal("complete"),
);

async function loadPipelineOrThrow(
  ctx: { db: { get: (id: Id<"pipeline">) => Promise<Doc<"pipeline"> | null> } },
  pipelineFileId: Id<"pipeline">,
): Promise<Doc<"pipeline">> {
  const row = await ctx.db.get(pipelineFileId);
  if (!row) throw new Error("Pipeline file not found.");
  return row;
}

async function loadTaskOrThrow(
  ctx: { db: { get: (id: Id<"documentVaultFileTasks">) => Promise<Doc<"documentVaultFileTasks"> | null> } },
  fileTaskId: Id<"documentVaultFileTasks">,
): Promise<Doc<"documentVaultFileTasks">> {
  const row = await ctx.db.get(fileTaskId);
  if (!row) throw new Error("File task not found.");
  return row;
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Title is required.");
  return trimmed.slice(0, MAX_TITLE_LEN);
}

async function nextSortOrder(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
): Promise<number> {
  const rows = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
    .collect();
  const max = rows.reduce(
    (acc, row) => Math.max(acc, row.sortOrder),
    0,
  );
  return max + 1000;
}

async function syncTaskPortalVisibilityToChildren(
  ctx: MutationCtx,
  fileTask: Doc<"documentVaultFileTasks">,
  isPortalVisible: boolean,
): Promise<void> {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", fileTask.pipelineFileId),
    )
    .collect();

  const folders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) =>
      q.eq("pipelineFileId", fileTask.pipelineFileId),
    )
    .collect();
  const subtreeFolderIds = collectTaskSubtreeFolderIds(
    folders,
    fileTask._id,
  );
  const subtreeSet = new Set(subtreeFolderIds.map(String));

  for (const link of links) {
    const inTask =
      link.fileTaskId === fileTask._id ||
      (link.folderId != null && subtreeSet.has(String(link.folderId)));
    if (inTask) {
      await ctx.db.patch(link._id, { isSharedWithClient: isPortalVisible });
    }
  }
}

function collectTaskSubtreeFolderIds(
  allFolders: Doc<"documentFolders">[],
  fileTaskId: Id<"documentVaultFileTasks">,
): Id<"documentFolders">[] {
  const roots = allFolders.filter((f) => f.fileTaskId === fileTaskId);
  const out: Id<"documentFolders">[] = [];
  const queue = [...roots.map((f) => f._id)];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(String(id))) continue;
    seen.add(String(id));
    out.push(id);
    for (const child of allFolders.filter((f) => f.parentFolderId === id)) {
      queue.push(child._id);
    }
  }
  return out;
}

export const listByPipeline = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    includeArchived: v.optional(v.boolean()),
    archivedOnly: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, includeArchived, archivedOnly, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);
    const rows = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    let filtered = rows;
    if (archivedOnly) {
      filtered = rows.filter((r) => r.isArchived);
    } else if (!includeArchived) {
      filtered = rows.filter((r) => !r.isArchived);
    }
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const countPendingReviewByPipeline = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);
    const rows = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    const count = rows.filter(
      (r) => !r.isArchived && r.status === "pending_review",
    ).length;
    return { count };
  },
});

export const batchCreate = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    titles: v.array(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, titles, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const normalized = [
      ...new Set(
        titles
          .map((t) => t.trim().replace(/\s+/g, " "))
          .filter((t) => t.length > 0)
          .map((t) => t.slice(0, MAX_TITLE_LEN)),
      ),
    ];
    if (normalized.length === 0) {
      throw new Error("Add at least one file task title.");
    }

    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    let sortOrder = await nextSortOrder(ctx, pipelineFileId);
    const ids: Id<"documentVaultFileTasks">[] = [];

    for (const title of normalized) {
      const id = await ctx.db.insert("documentVaultFileTasks", {
        pipelineFileId,
        title,
        sortOrder,
        status: "incomplete",
        isRequired: true,
        isPortalVisible: false,
        isArchived: false,
        createdByUserKey: key,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
      sortOrder += 1000;
    }

    return { ok: true as const, fileTaskIds: ids, created: ids.length };
  },
});

export const createWithConfig = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    title: v.string(),
    description: v.optional(v.string()),
    taskType: fileTaskTypeV,
    clientInstructionText: v.optional(v.string()),
    instructionUrl: v.optional(v.string()),
    assignedBlockEntries: v.optional(v.array(assignedBlockEntryV)),
    isRequired: v.optional(v.boolean()),
    isPortalVisible: v.optional(v.boolean()),
    dueDate: v.optional(v.number()),
    priority: v.optional(fileTaskPriorityV),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await loadPipelineOrThrow(ctx, args.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const taskType = args.taskType;
    const blockPatch = persistAssignedBlocksPatch(args.assignedBlockEntries ?? []);
    validateTaskConfig({
      taskType,
      clientInstructionText: args.clientInstructionText,
      instructionUrl: args.instructionUrl,
      assignedBlockEntries: blockPatch.assignedBlockEntries,
    });

    const key = args.memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const sortOrder = await nextSortOrder(ctx, args.pipelineFileId);
    const instruction =
      taskType === "client_instruction"
        ? args.clientInstructionText?.trim().slice(0, 8000)
        : undefined;
    const instructionUrl =
      taskType === "client_instruction"
        ? args.instructionUrl?.trim().slice(0, 2000) || undefined
        : undefined;

    const id = await ctx.db.insert("documentVaultFileTasks", {
      pipelineFileId: args.pipelineFileId,
      title: normalizeTitle(args.title),
      description: args.description?.trim().slice(0, 4000) || undefined,
      sortOrder,
      status: "incomplete",
      taskType,
      clientInstructionText: instruction,
      instructionUrl,
      ...blockPatch,
      isRequired: args.isRequired ?? true,
      isPortalVisible: portalVisibleForTaskType(taskType, args.isPortalVisible),
      dueDate: args.dueDate,
      priority: args.priority,
      isArchived: false,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true as const, fileTaskId: id };
  },
});

export const updateTaskConfig = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    taskType: v.optional(fileTaskTypeV),
    clientInstructionText: v.optional(v.string()),
    instructionUrl: v.optional(v.string()),
    assignedBlockEntries: v.optional(v.array(assignedBlockEntryV)),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isRequired: v.optional(v.boolean()),
    isPortalVisible: v.optional(v.boolean()),
    dueDate: v.optional(v.union(v.number(), v.null())),
    priority: v.optional(v.union(fileTaskPriorityV, v.null())),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const task = await loadTaskOrThrow(ctx, args.fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const taskType = args.taskType ?? task.taskType ?? "document_upload";
    const blockPatch =
      args.assignedBlockEntries !== undefined
        ? persistAssignedBlocksPatch(args.assignedBlockEntries)
        : {
            assignedBlockEntries: task.assignedBlockEntries,
            assignedBlocks: task.assignedBlocks,
          };

    const instruction =
      args.clientInstructionText !== undefined
        ? args.clientInstructionText.trim().slice(0, 8000)
        : task.clientInstructionText;
    const instructionUrl =
      args.instructionUrl !== undefined
        ? args.instructionUrl.trim().slice(0, 2000) || undefined
        : task.instructionUrl;

    validateTaskConfig({
      taskType,
      clientInstructionText: instruction,
      instructionUrl,
      assignedBlockEntries: blockPatch.assignedBlockEntries,
    });

    const patch: Partial<Doc<"documentVaultFileTasks">> = {
      taskType,
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) patch.title = normalizeTitle(args.title);
    if (args.description !== undefined) {
      patch.description = args.description.trim().slice(0, 4000) || undefined;
    }
    if (args.isRequired !== undefined) patch.isRequired = args.isRequired;
    if (taskType === "client_instruction") {
      patch.clientInstructionText = instruction || undefined;
      patch.instructionUrl = instructionUrl;
    } else {
      patch.clientInstructionText = undefined;
      patch.instructionUrl = undefined;
    }
    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate === null ? undefined : args.dueDate;
    }
    if (args.priority !== undefined) {
      patch.priority = args.priority === null ? undefined : args.priority;
    }
    if (args.assignedBlockEntries !== undefined) {
      Object.assign(patch, blockPatch);
    } else if (taskType !== "block_assignment") {
      patch.assignedBlockEntries = undefined;
      patch.assignedBlocks = undefined;
    }

    const portalVisible = portalVisibleForTaskType(
      taskType,
      args.isPortalVisible ?? task.isPortalVisible,
    );
    patch.isPortalVisible = portalVisible;

    await ctx.db.patch(args.fileTaskId, patch);
    if (args.isPortalVisible !== undefined || taskType !== task.taskType) {
      await syncTaskPortalVisibilityToChildren(ctx, task, portalVisible);
    }

    return { ok: true as const, fileTaskId: args.fileTaskId };
  },
});

export const updateTitle = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    title: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, title, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const safeTitle = normalizeTitle(title);
    await ctx.db.patch(fileTaskId, { title: safeTitle, updatedAt: Date.now() });
    return { ok: true as const, title: safeTitle };
  },
});

export const toggleStatus = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    status: fileTaskStatusV,
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, status, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const oldStatus = task.status;
    await ctx.db.patch(fileTaskId, { status, updatedAt: Date.now() });
    if (oldStatus !== status) {
      await scheduleWebhookQueueEvent(ctx, {
        organizationId: pipeline.organizationId,
        event: "task_status_changed",
        data: {
          taskTitle: task.title.trim(),
          oldStatus,
          newStatus: status,
          taskId: String(fileTaskId),
          taskKind: "file_task",
          pipelineFileId: String(pipeline._id),
          revisionNotes: task.rejectionNote,
        },
      });
    }
    return { ok: true as const, status };
  },
});

export const toggleRequired = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    isRequired: v.boolean(),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, isRequired, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, { isRequired, updatedAt: Date.now() });
    return { ok: true as const, isRequired };
  },
});

export const togglePortalVisible = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    isPortalVisible: v.boolean(),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, isPortalVisible, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, { isPortalVisible, updatedAt: Date.now() });
    await syncTaskPortalVisibilityToChildren(ctx, task, isPortalVisible);
    return { ok: true as const, isPortalVisible };
  },
});

export const reorder = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    orderedFileTaskIds: v.array(v.id("documentVaultFileTasks")),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, orderedFileTaskIds, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const rows = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    const rowIds = new Set(rows.map((r) => String(r._id)));
    if (orderedFileTaskIds.length !== rows.length) {
      throw new Error("Reorder list must include every file task.");
    }
    for (const id of orderedFileTaskIds) {
      if (!rowIds.has(String(id))) {
        throw new Error("Invalid file task in reorder list.");
      }
    }

    const now = Date.now();
    for (let i = 0; i < orderedFileTaskIds.length; i++) {
      await ctx.db.patch(orderedFileTaskIds[i]!, {
        sortOrder: i * 1000,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

export const notifyClient = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const now = Date.now();

    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const expiresAt = now + 90 * 24 * 60 * 60 * 1000;

    const existingTokens = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_fileTask", (q) => q.eq("fileTaskId", fileTaskId))
      .collect();
    for (const row of existingTokens) {
      if (row.status === "active") {
        await ctx.db.patch(row._id, { status: "revoked" });
      }
    }
    const key = memberUserKey?.trim() || "__system__";
    await ctx.db.insert("documentVaultFileTaskUploadTokens", {
      fileTaskId,
      pipelineFileId: task.pipelineFileId,
      tokenHash,
      status: "active",
      createdByUserKey: key,
      createdAt: now,
      expiresAt,
      uploadCount: 0,
    });

    const origin = (
      process.env.CLIENT_PORTAL_ORIGIN?.trim() || "http://127.0.0.1:3004"
    ).replace(/\/$/, "");
    const uploadUrl = `${origin}/upload/${encodeURIComponent(plainToken)}`;

    const grants = await ctx.db
      .query("clientPortalGrants")
      .withIndex("by_file", (q) => q.eq("pipelineFileId", task.pipelineFileId))
      .collect();
    const activeEmails = [
      ...new Set(
        grants
          .filter((g) => g.status === "active")
          .map((g) => g.emailKey)
          .filter((e) => e.includes("@")),
      ),
    ];

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const workspaceLabel =
      org?.name?.trim() && org.name.trim().length > 0
        ? org.name.trim()
        : "Your lender";

    let emailsQueued = 0;
    for (const email of activeEmails) {
      await ctx.scheduler.runAfter(
        0,
        internal.clientPortalEmails.deliverFileTaskReminder,
        {
          to: email,
          taskTitle: task.title,
          isRequired: task.isRequired,
          uploadUrl,
          workspaceLabel,
        },
      );
      emailsQueued += 1;
    }

    await ctx.db.patch(fileTaskId, { lastNotifiedAt: now, updatedAt: now });
    return {
      ok: true as const,
      lastNotifiedAt: now,
      uploadUrl,
      emailsQueued,
    };
  },
});

export const deleteFileTask = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    strategy: v.optional(
      v.union(v.literal("unassign_contents"), v.literal("delete_contents")),
    ),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, strategy, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const mode = strategy ?? "unassign_contents";
    const now = Date.now();

    const allFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) =>
        q.eq("pipelineFileId", task.pipelineFileId),
      )
      .collect();
    const subtreeIds = new Set(
      collectTaskSubtreeFolderIds(allFolders, fileTaskId).map(String),
    );
    const folders = allFolders.filter(
      (f) =>
        f.fileTaskId === fileTaskId || subtreeIds.has(String(f._id)),
    );

    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_pipeline_linkedAt", (q) =>
        q.eq("pipelineFileId", task.pipelineFileId),
      )
      .collect()
      .then((rows) =>
        rows.filter(
          (l) =>
            l.fileTaskId === fileTaskId ||
            (l.folderId != null && subtreeIds.has(String(l.folderId))),
        ),
      );

    if (mode === "unassign_contents") {
      for (const folder of folders) {
        await ctx.db.patch(folder._id, {
          fileTaskId: undefined,
          updatedAt: now,
        });
      }
      for (const link of links) {
        await ctx.db.patch(link._id, {
          fileTaskId: undefined,
          isSharedWithClient: false,
        });
      }
    } else {
      const docIds = new Set<string>();
      for (const link of links) {
        docIds.add(String(link.documentId));
        await ctx.db.delete(link._id);
      }
      for (const docId of docIds) {
        await purgeLibraryDocumentIfOrphaned(
          ctx,
          docId as Id<"libraryDocuments">,
        );
      }
      for (const folder of folders) {
        await ctx.db.delete(folder._id);
      }
    }

    const uploadTokens = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_fileTask", (q) => q.eq("fileTaskId", fileTaskId))
      .collect();
    for (const tok of uploadTokens) {
      await ctx.db.delete(tok._id);
    }

    await ctx.db.delete(fileTaskId);
    return { ok: true as const, strategy: mode };
  },
});

export const updateAssignedBlocks = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    assignedBlockEntries: v.array(assignedBlockEntryV),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, assignedBlockEntries, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const blockPatch = persistAssignedBlocksPatch(assignedBlockEntries);
    await ctx.db.patch(fileTaskId, {
      ...blockPatch,
      taskType: task.taskType ?? "block_assignment",
      updatedAt: Date.now(),
    });
    return {
      ok: true as const,
      assignedBlockEntries: blockPatch.assignedBlockEntries ?? [],
    };
  },
});

export const acceptFileTaskReview = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    if (task.status !== "pending_review") {
      throw new Error("Only tasks awaiting review can be approved.");
    }
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, {
      status: "complete",
      rejectionNote: undefined,
      updatedAt: Date.now(),
    });
    await recordBrokerVaultReview(ctx, {
      pipeline,
      task,
      action: "approved",
      brokerUserKey: memberUserKey,
    });
    await scheduleWebhookQueueEvent(ctx, {
      organizationId: pipeline.organizationId,
      event: "task_status_changed",
      data: {
        taskTitle: task.title.trim(),
        oldStatus: "pending_review",
        newStatus: "complete",
        taskId: String(fileTaskId),
        taskKind: "file_task",
        pipelineFileId: String(pipeline._id),
      },
    });
    return { ok: true as const, status: "complete" as const };
  },
});

export const rejectFileTaskReview = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    rejectionNote: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, rejectionNote, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    if (task.status !== "pending_review") {
      throw new Error("Only tasks awaiting review can be sent back for revision.");
    }
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const note = rejectionNote.trim().slice(0, 2000);
    if (!note) {
      throw new Error("A revision note is required so the client knows what to fix.");
    }
    await ctx.db.patch(fileTaskId, {
      status: "incomplete",
      rejectionNote: note,
      updatedAt: Date.now(),
    });
    await recordBrokerVaultReview(ctx, {
      pipeline,
      task,
      action: "revision_requested",
      revisionNote: note,
      brokerUserKey: memberUserKey,
    });
    await scheduleWebhookQueueEvent(ctx, {
      organizationId: pipeline.organizationId,
      event: "task_status_changed",
      data: {
        taskTitle: task.title.trim(),
        oldStatus: "pending_review",
        newStatus: "incomplete",
        revisionNotes: note,
        taskId: String(fileTaskId),
        taskKind: "file_task",
        pipelineFileId: String(pipeline._id),
      },
    });
    return { ok: true as const, status: "incomplete" as const };
  },
});

export const resetFileTaskForClient = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, {
      status: "incomplete",
      rejectionNote: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const, status: "incomplete" as const };
  },
});

const registryKindV = v.union(
  v.literal("contact"),
  v.literal("entity"),
  v.literal("lender"),
);

export const assignRegistry = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    registryKind: registryKindV,
    registryId: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, registryKind, registryId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const patch: Partial<Doc<"documentVaultFileTasks">> = {
      assignedContactId: undefined,
      assignedClientId: undefined,
      assignedLenderId: undefined,
      updatedAt: Date.now(),
    };

    if (registryKind === "contact") {
      const contact = await ctx.db.get(registryId as Id<"contacts">);
      if (!contact) throw new Error("Contact not found.");
      patch.assignedContactId = contact._id;
    } else if (registryKind === "entity") {
      const client = await ctx.db.get(registryId as Id<"clients">);
      if (!client) throw new Error("Entity not found.");
      patch.assignedClientId = client._id;
    } else {
      const lender = await ctx.db.get(registryId as Id<"lenders">);
      if (!lender) throw new Error("Lender not found.");
      patch.assignedLenderId = lender._id;
    }

    await ctx.db.patch(fileTaskId, patch);
    return { ok: true as const, registryKind };
  },
});

export const clearRegistryAssignment = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, {
      assignedContactId: undefined,
      assignedClientId: undefined,
      assignedLenderId: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const archiveFileTask = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, { isArchived: true, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const restoreFileTask = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, { isArchived: false, updatedAt: Date.now() });
    return { ok: true as const };
  },
});
