import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  assertOrgMember,
} from "./organizationAccess";
import { hashPassword, randomHex, sha256Hex } from "./clientPortalCrypto";
import { purgeLibraryDocumentIfOrphaned } from "./libraryDocumentsCleanup";
import {
  assignedBlockEntryV,
  fileTaskPriorityV,
  fileTaskTypeV,
  normalizeAssignedBlockEntriesFromDoc,
  persistAssignedBlocksPatch,
} from "./documentVaultTaskTypes";
import {
  clientPortalBlockLabel,
  isClientPortalAssignableBlock,
} from "../lib/documentVaultClientBlocks";
import {
  createEmptyPfsInstance,
  defaultPfsInstanceName,
  findPfsInstance,
  normalizePfsInstances,
  pfsDealPatchFromInstances,
  type PfsInstance,
} from "../lib/pfs/pfsInstances";
import {
  PFS_INTAKE_FORM_FIELD_KEYS,
  pfsAssociatedFormTitle,
  planPfsAssociations,
} from "../lib/pfs/pfsFormAssociation";
import {
  findSimplePlInstance,
  normalizeSimplePlInstances,
  simplePlDealPatchFromInstances,
  simplePlInstanceDisplayName,
  type SimplePlInstance,
} from "../lib/simplePl/simplePlInstances";
import { recordBrokerVaultReview } from "./documentVaultActivity";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";
import {
  clientTemplateAttachmentV,
  deleteRemovedClientTemplateStorage,
  taskTypeAllowsClientTemplateAttachments,
  validateClientTemplateAttachments,
  type ClientTemplateAttachment,
} from "./clientTemplateAttachments";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

function taskTypeAllowsClientTemplates(
  taskType: Doc<"documentVaultFileTasks">["taskType"],
): boolean {
  return taskTypeAllowsClientTemplateAttachments(taskType);
}

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
    return filtered
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ accessPasswordHash, accessPasswordSalt, ...row }) => ({
        ...row,
        passwordProtected: Boolean(
          accessPasswordHash?.trim() && accessPasswordSalt?.trim(),
        ),
      }));
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

export const generateUploadUrl = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    return await ctx.storage.generateUploadUrl();
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
    clientTemplateAttachments: v.optional(v.array(clientTemplateAttachmentV)),
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

    let clientTemplateAttachments: ClientTemplateAttachment[] | undefined;
    if (
      taskTypeAllowsClientTemplates(taskType) &&
      (args.clientTemplateAttachments?.length ?? 0) > 0
    ) {
      clientTemplateAttachments = await validateClientTemplateAttachments(
        ctx,
        args.clientTemplateAttachments ?? [],
      );
    }

    const id = await ctx.db.insert("documentVaultFileTasks", {
      pipelineFileId: args.pipelineFileId,
      title: normalizeTitle(args.title),
      description: args.description?.trim().slice(0, 4000) || undefined,
      sortOrder,
      status: "incomplete",
      taskType,
      clientInstructionText: instruction,
      instructionUrl,
      clientTemplateAttachments,
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
    clientTemplateAttachments: v.optional(v.array(clientTemplateAttachmentV)),
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

    if (args.clientTemplateAttachments !== undefined) {
      if (taskTypeAllowsClientTemplates(taskType)) {
        const next =
          args.clientTemplateAttachments.length > 0
            ? await validateClientTemplateAttachments(
                ctx,
                args.clientTemplateAttachments,
              )
            : undefined;
        await deleteRemovedClientTemplateStorage(
          ctx,
          task.clientTemplateAttachments,
          next,
        );
        patch.clientTemplateAttachments = next;
      } else {
        await deleteRemovedClientTemplateStorage(
          ctx,
          task.clientTemplateAttachments,
          undefined,
        );
        patch.clientTemplateAttachments = undefined;
      }
    } else if (!taskTypeAllowsClientTemplates(taskType)) {
      await deleteRemovedClientTemplateStorage(
        ctx,
        task.clientTemplateAttachments,
        undefined,
      );
      patch.clientTemplateAttachments = undefined;
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

/**
 * Find or create a portal-visible `block_assignment` file task that contains
 * exactly one atomic block (exclusive). Used by broker “Assign to client” and
 * “Copy client fill link” actions on pipeline blocks.
 */
export async function ensureExclusiveBlockAssignmentTask(
  ctx: MutationCtx,
  args: {
    pipelineFileId: Id<"pipeline">;
    blockId: string;
    memberUserKey?: string;
    assignedContactId?: Id<"contacts">;
    title?: string;
  },
): Promise<{
  fileTaskId: Id<"documentVaultFileTasks">;
  created: boolean;
  blockId: string;
  title: string;
}> {
  const blockPatch = persistAssignedBlocksPatch([
    { blockId: args.blockId.trim(), sortOrder: 1000 },
  ]);
  const exclusive = blockPatch.assignedBlockEntries ?? [];
  if (exclusive.length === 0) {
    throw new Error("This block cannot be assigned to a client.");
  }
  const atomicBlockId = exclusive[0]!.blockId;
  validateTaskConfig({
    taskType: "block_assignment",
    assignedBlockEntries: exclusive,
  });

  const title =
    args.title?.trim().slice(0, MAX_TITLE_LEN) ||
    `Complete: ${clientPortalBlockLabel(atomicBlockId)}`;

  const rows = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) =>
      q.eq("pipelineFileId", args.pipelineFileId),
    )
    .collect();

  /**
   * PFS / Simple P&L are multi-instance: never reuse a single exclusive
   * `pfs_statement` / `simple_pl` task. Per-period tasks are created via
   * `ensurePfsInstanceVaultTask` / `ensureSimplePlInstanceVaultTask`.
   */
  const exclusiveMatch =
    atomicBlockId === "pfs_statement" || atomicBlockId === "simple_pl"
      ? undefined
      : rows.find((task) => {
          if (task.isArchived) return false;
          if (task.status === "complete") return false;
          if ((task.taskType ?? "document_upload") !== "block_assignment") {
            return false;
          }
          const assigned = normalizeAssignedBlockEntriesFromDoc(task);
          return (
            assigned.length === 1 && assigned[0]!.blockId === atomicBlockId
          );
        });

  const key = args.memberUserKey?.trim() || "__system__";
  const now = Date.now();

  if (exclusiveMatch) {
    const patch: Partial<Doc<"documentVaultFileTasks">> = {
      updatedAt: now,
    };
    if (!exclusiveMatch.isPortalVisible) {
      patch.isPortalVisible = true;
    }
    if (
      args.assignedContactId &&
      exclusiveMatch.assignedContactId !== args.assignedContactId
    ) {
      patch.assignedContactId = args.assignedContactId;
      patch.assignedClientId = undefined;
      patch.assignedLenderId = undefined;
    }
    if (Object.keys(patch).length > 1) {
      await ctx.db.patch(exclusiveMatch._id, patch);
      if (patch.isPortalVisible === true) {
        await syncTaskPortalVisibilityToChildren(
          ctx,
          exclusiveMatch,
          true,
        );
      }
    }
    return {
      fileTaskId: exclusiveMatch._id,
      created: false,
      blockId: atomicBlockId,
      title: exclusiveMatch.title,
    };
  }

  const sortOrder = await nextSortOrder(ctx, args.pipelineFileId);
  const id = await ctx.db.insert("documentVaultFileTasks", {
    pipelineFileId: args.pipelineFileId,
    title,
    sortOrder,
    status: "incomplete",
    taskType: "block_assignment",
    ...blockPatch,
    isRequired: true,
    isPortalVisible: true,
    isArchived: false,
    assignedContactId: args.assignedContactId,
    createdByUserKey: key,
    createdAt: now,
    updatedAt: now,
  });

  return {
    fileTaskId: id,
    created: true,
    blockId: atomicBlockId,
    title,
  };
}

export const ensureBlockAssignmentTask = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    blockId: v.string(),
    assignedContactId: v.optional(v.id("contacts")),
    title: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await loadPipelineOrThrow(ctx, args.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    if (args.assignedContactId) {
      const contact = await ctx.db.get(args.assignedContactId);
      if (!contact) throw new Error("Contact not found.");
    }

    const result = await ensureExclusiveBlockAssignmentTask(ctx, {
      pipelineFileId: args.pipelineFileId,
      blockId: args.blockId,
      memberUserKey: args.memberUserKey,
      assignedContactId: args.assignedContactId,
      title: args.title,
    });

    return {
      ok: true as const,
      fileTaskId: result.fileTaskId,
      created: result.created,
      blockId: result.blockId,
      title: result.title,
    };
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

const MAX_TASK_PASSWORD_LEN = 128;

function dealPfsInstancesFromPipeline(pipeline: Doc<"pipeline">): PfsInstance[] {
  const deal =
    pipeline.dealData != null &&
    typeof pipeline.dealData === "object" &&
    !Array.isArray(pipeline.dealData)
      ? (pipeline.dealData as Record<string, unknown>)
      : {};
  return normalizePfsInstances(deal);
}

async function persistPfsInstancesOnPipeline(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
  instances: PfsInstance[],
): Promise<Doc<"pipeline">> {
  const { pfsInstances, pfs } = pfsDealPatchFromInstances(instances);
  const deal =
    pipeline.dealData != null &&
    typeof pipeline.dealData === "object" &&
    !Array.isArray(pipeline.dealData)
      ? { ...(pipeline.dealData as Record<string, unknown>) }
      : {};
  const now = Date.now();
  await ctx.db.patch(pipeline._id, {
    dealData: { ...deal, pfsInstances, pfs, updatedAt: now } as Doc<"pipeline">["dealData"],
    updatedAt: now,
  });
  if (pipeline.intakeSheetId) {
    const intakeRow = await ctx.db.get(pipeline.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(pipeline.intakeSheetId, {
        pfsInstances,
        pfs,
        updatedAt: now,
      });
    }
  }
  const refreshed = await ctx.db.get(pipeline._id);
  return refreshed ?? pipeline;
}

export async function ensurePfsInstanceVaultTaskForInstance(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    instances: PfsInstance[];
    instance: PfsInstance;
    memberUserKey?: string;
    assignedContactId?: Id<"contacts">;
    title?: string;
  },
): Promise<{
  fileTaskId: Id<"documentVaultFileTasks">;
  created: boolean;
  title: string;
  passwordProtected: boolean;
  instances: PfsInstance[];
  pipeline: Doc<"pipeline">;
}> {
  const { pipeline } = args;
  let instances = args.instances;
  const instance =
    findPfsInstance(instances, args.instance.id) ?? args.instance;

  if (args.assignedContactId) {
    const contact = await ctx.db.get(args.assignedContactId);
    if (!contact) throw new Error("Contact not found.");
  }

  const primaryContactId =
    args.assignedContactId ??
    (instance.assignedContactIds?.[0]
      ? (instance.assignedContactIds[0] as Id<"contacts">)
      : undefined);

  const title =
    args.title?.trim().slice(0, MAX_TITLE_LEN) || pfsAssociatedFormTitle(instance);

  if (instance.vaultFileTaskId) {
    const existing = await ctx.db.get(
      instance.vaultFileTaskId as Id<"documentVaultFileTasks">,
    );
    if (existing && !existing.isArchived) {
      const patch: Partial<Doc<"documentVaultFileTasks">> = {
        updatedAt: Date.now(),
      };
      if (!existing.isPortalVisible) patch.isPortalVisible = true;
      if (existing.title !== title) patch.title = title;
      if (!existing.sourceKind) patch.sourceKind = "pfs_instance";
      if (existing.sourceInstanceId !== instance.id) {
        patch.sourceInstanceId = instance.id;
      }
      if (primaryContactId && existing.assignedContactId !== primaryContactId) {
        patch.assignedContactId = primaryContactId;
        patch.assignedClientId = undefined;
        patch.assignedLenderId = undefined;
      }
      if (Object.keys(patch).length > 1) {
        await ctx.db.patch(existing._id, patch);
      }
      return {
        fileTaskId: existing._id,
        created: false,
        title: patch.title ?? existing.title,
        passwordProtected: Boolean(
          existing.accessPasswordHash?.trim() &&
            existing.accessPasswordSalt?.trim(),
        ),
        instances,
        pipeline,
      };
    }
  }

  const rows = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_source", (q) =>
      q
        .eq("pipelineFileId", pipeline._id)
        .eq("sourceKind", "pfs_instance")
        .eq("sourceInstanceId", instance.id),
    )
    .collect();
  const live = rows.find((t) => !t.isArchived);
  if (live) {
    if (live.title !== title) {
      await ctx.db.patch(live._id, { title, updatedAt: Date.now() });
    }
    instances = instances.map((inst) =>
      inst.id === instance.id
        ? { ...inst, vaultFileTaskId: String(live._id) }
        : inst,
    );
    const nextPipeline = await persistPfsInstancesOnPipeline(
      ctx,
      pipeline,
      instances,
    );
    return {
      fileTaskId: live._id,
      created: false,
      title: live.title !== title ? title : live.title,
      passwordProtected: Boolean(
        live.accessPasswordHash?.trim() && live.accessPasswordSalt?.trim(),
      ),
      instances,
      pipeline: nextPipeline,
    };
  }

  const blockPatch = persistAssignedBlocksPatch([
    { blockId: "pfs_statement", sortOrder: 1000 },
  ]);
  validateTaskConfig({
    taskType: "block_assignment",
    assignedBlockEntries: blockPatch.assignedBlockEntries,
  });
  const now = Date.now();
  const key = args.memberUserKey?.trim() || "__system__";
  const fileTaskId = await ctx.db.insert("documentVaultFileTasks", {
    pipelineFileId: pipeline._id,
    title,
    sortOrder: await nextSortOrder(ctx, pipeline._id),
    status: "incomplete",
    taskType: "block_assignment",
    ...blockPatch,
    isRequired: true,
    isPortalVisible: true,
    isArchived: false,
    assignedContactId: primaryContactId,
    sourceKind: "pfs_instance",
    sourceInstanceId: instance.id,
    createdByUserKey: key,
    createdAt: now,
    updatedAt: now,
  });

  instances = instances.map((inst) =>
    inst.id === instance.id
      ? { ...inst, vaultFileTaskId: String(fileTaskId) }
      : inst,
  );
  const nextPipeline = await persistPfsInstancesOnPipeline(
    ctx,
    pipeline,
    instances,
  );

  return {
    fileTaskId,
    created: true,
    title,
    passwordProtected: false,
    instances,
    pipeline: nextPipeline,
  };
}

/**
 * Find or create a portal-visible `block_assignment` vault task for one PFS
 * instance. Distinct from exclusive single-block tasks so 4–5 borrowers can
 * each have their own Document Vault / portal request.
 */
export const ensurePfsInstanceVaultTask = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    pfsInstanceId: v.string(),
    assignedContactId: v.optional(v.id("contacts")),
    title: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await loadPipelineOrThrow(ctx, args.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const instances = dealPfsInstancesFromPipeline(pipeline);
    const instance = findPfsInstance(instances, args.pfsInstanceId);
    if (!instance) throw new Error("Personal financial statement not found.");

    const result = await ensurePfsInstanceVaultTaskForInstance(ctx, {
      pipeline,
      instances,
      instance,
      memberUserKey: args.memberUserKey,
      assignedContactId: args.assignedContactId,
      title: args.title,
    });

    return {
      ok: true as const,
      fileTaskId: result.fileTaskId,
      created: result.created,
      title: result.title,
      passwordProtected: result.passwordProtected,
    };
  },
});

function dealSimplePlInstancesFromPipeline(
  pipeline: Doc<"pipeline">,
): SimplePlInstance[] {
  const deal =
    pipeline.dealData != null &&
    typeof pipeline.dealData === "object" &&
    !Array.isArray(pipeline.dealData)
      ? (pipeline.dealData as Record<string, unknown>)
      : {};
  return normalizeSimplePlInstances(deal);
}

async function persistSimplePlInstancesOnPipeline(
  ctx: MutationCtx,
  pipeline: Doc<"pipeline">,
  instances: SimplePlInstance[],
): Promise<void> {
  const { simplePlInstances, simplePl } =
    simplePlDealPatchFromInstances(instances);
  const deal =
    pipeline.dealData != null &&
    typeof pipeline.dealData === "object" &&
    !Array.isArray(pipeline.dealData)
      ? { ...(pipeline.dealData as Record<string, unknown>) }
      : {};
  const now = Date.now();
  await ctx.db.patch(pipeline._id, {
    dealData: {
      ...deal,
      simplePlInstances,
      simplePl,
      updatedAt: now,
    } as Doc<"pipeline">["dealData"],
    updatedAt: now,
  });
  if (pipeline.intakeSheetId) {
    const intakeRow = await ctx.db.get(pipeline.intakeSheetId);
    if (intakeRow) {
      await ctx.db.patch(pipeline.intakeSheetId, {
        simplePlInstances,
        simplePl,
        updatedAt: now,
      });
    }
  }
}

/**
 * Find or create a portal-visible `block_assignment` vault task for one Simple
 * P&L timeframe (YTD / past year / named period).
 */
export const ensureSimplePlInstanceVaultTask = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    simplePlInstanceId: v.string(),
    assignedContactId: v.optional(v.id("contacts")),
    title: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await loadPipelineOrThrow(ctx, args.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const instances = dealSimplePlInstancesFromPipeline(pipeline);
    const instance = findSimplePlInstance(instances, args.simplePlInstanceId);
    if (!instance) throw new Error("Simple P&L statement not found.");

    if (args.assignedContactId) {
      const contact = await ctx.db.get(args.assignedContactId);
      if (!contact) throw new Error("Contact not found.");
    }

    const primaryContactId =
      args.assignedContactId ??
      (instance.assignedContactIds?.[0]
        ? (instance.assignedContactIds[0] as Id<"contacts">)
        : undefined);

    const title =
      args.title?.trim().slice(0, MAX_TITLE_LEN) ||
      `P&L: ${simplePlInstanceDisplayName(instance)}`;

    if (instance.vaultFileTaskId) {
      const existing = await ctx.db.get(
        instance.vaultFileTaskId as Id<"documentVaultFileTasks">,
      );
      if (existing && !existing.isArchived) {
        const patch: Partial<Doc<"documentVaultFileTasks">> = {
          updatedAt: Date.now(),
        };
        if (!existing.isPortalVisible) patch.isPortalVisible = true;
        if (existing.title !== title) patch.title = title;
        if (!existing.sourceKind) patch.sourceKind = "simple_pl_instance";
        if (existing.sourceInstanceId !== instance.id) {
          patch.sourceInstanceId = instance.id;
        }
        if (primaryContactId && existing.assignedContactId !== primaryContactId) {
          patch.assignedContactId = primaryContactId;
          patch.assignedClientId = undefined;
          patch.assignedLenderId = undefined;
        }
        if (Object.keys(patch).length > 1) {
          await ctx.db.patch(existing._id, patch);
        }
        return {
          ok: true as const,
          fileTaskId: existing._id,
          created: false,
          title: patch.title ?? existing.title,
          passwordProtected: Boolean(
            existing.accessPasswordHash?.trim() &&
              existing.accessPasswordSalt?.trim(),
          ),
        };
      }
    }

    const rows = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_source", (q) =>
        q
          .eq("pipelineFileId", args.pipelineFileId)
          .eq("sourceKind", "simple_pl_instance")
          .eq("sourceInstanceId", instance.id),
      )
      .collect();
    const live = rows.find((t) => !t.isArchived);
    if (live) {
      const nextInstances = instances.map((inst) =>
        inst.id === instance.id
          ? { ...inst, vaultFileTaskId: String(live._id) }
          : inst,
      );
      await persistSimplePlInstancesOnPipeline(ctx, pipeline, nextInstances);
      return {
        ok: true as const,
        fileTaskId: live._id,
        created: false,
        title: live.title,
        passwordProtected: Boolean(
          live.accessPasswordHash?.trim() && live.accessPasswordSalt?.trim(),
        ),
      };
    }

    const blockPatch = persistAssignedBlocksPatch([
      { blockId: "simple_pl", sortOrder: 1000 },
    ]);
    validateTaskConfig({
      taskType: "block_assignment",
      assignedBlockEntries: blockPatch.assignedBlockEntries,
    });
    const now = Date.now();
    const key = args.memberUserKey?.trim() || "__system__";
    const fileTaskId = await ctx.db.insert("documentVaultFileTasks", {
      pipelineFileId: args.pipelineFileId,
      title,
      sortOrder: await nextSortOrder(ctx, args.pipelineFileId),
      status: "incomplete",
      taskType: "block_assignment",
      ...blockPatch,
      isRequired: true,
      isPortalVisible: true,
      isArchived: false,
      assignedContactId: primaryContactId,
      sourceKind: "simple_pl_instance",
      sourceInstanceId: instance.id,
      createdByUserKey: key,
      createdAt: now,
      updatedAt: now,
    });

    const nextInstances = instances.map((inst) =>
      inst.id === instance.id
        ? { ...inst, vaultFileTaskId: String(fileTaskId) }
        : inst,
    );
    await persistSimplePlInstancesOnPipeline(ctx, pipeline, nextInstances);

    return {
      ok: true as const,
      fileTaskId,
      created: true,
      title,
      passwordProtected: false,
    };
  },
});

async function ensurePfsIntakeFormForInstance(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    instance: PfsInstance;
    title: string;
    formId?: string;
    createForm: boolean;
    renameForm: boolean;
    memberUserKey?: string;
  },
): Promise<{ formId: Id<"intakeForms">; created: boolean }> {
  const orgId = args.pipeline.organizationId;
  if (!orgId) throw new Error("File is missing an organization.");
  const key = args.memberUserKey?.trim() || "__system__";
  if (args.memberUserKey?.trim()) {
    await assertOrgMember(ctx, orgId, args.memberUserKey);
  }

  if (args.formId && !args.createForm) {
    const existing = await ctx.db.get(args.formId as Id<"intakeForms">);
    if (existing && existing.fileId === args.pipeline._id) {
      const patch: Partial<Doc<"intakeForms">> = { updatedAt: Date.now() };
      if (args.renameForm && existing.name !== args.title) patch.name = args.title;
      if (existing.sourceKind !== "pfs_instance") patch.sourceKind = "pfs_instance";
      if (existing.sourceInstanceId !== args.instance.id) {
        patch.sourceInstanceId = args.instance.id;
      }
      if (Object.keys(patch).length > 1) {
        await ctx.db.patch(existing._id, patch);
      }
      return { formId: existing._id, created: false };
    }
  }

  const sourced = await ctx.db
    .query("intakeForms")
    .withIndex("by_file_source", (q) =>
      q
        .eq("fileId", args.pipeline._id)
        .eq("sourceKind", "pfs_instance")
        .eq("sourceInstanceId", args.instance.id),
    )
    .first();
  if (sourced) {
    if (args.renameForm && sourced.name !== args.title) {
      await ctx.db.patch(sourced._id, {
        name: args.title,
        updatedAt: Date.now(),
      });
    }
    return { formId: sourced._id, created: false };
  }

  const now = Date.now();
  const formId = await ctx.db.insert("intakeForms", {
    organizationId: orgId,
    fileId: args.pipeline._id,
    formType: "file_intake",
    name: args.title,
    fieldKeys: [...PFS_INTAKE_FORM_FIELD_KEYS],
    borrowerPartyType: "individual",
    sourceKind: "pfs_instance",
    sourceInstanceId: args.instance.id,
    createdByUserKey: key,
    createdAt: now,
    updatedAt: now,
  });
  return { formId, created: true };
}

/**
 * Link every PFS on a file to its own titled Forms & Applications form and
 * Document Vault / portal task. Creating a new instance is optional.
 */
export const ensurePfsInstanceAssociations = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    pfsInstanceId: v.optional(v.string()),
    createInstance: v.optional(v.boolean()),
    instanceName: v.optional(v.string()),
    assignedContactIds: v.optional(v.array(v.string())),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    let pipeline = await loadPipelineOrThrow(ctx, args.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    let instances = dealPfsInstancesFromPipeline(pipeline);
    let createdInstanceId: string | undefined;

    if (args.pfsInstanceId && args.instanceName?.trim() && !args.createInstance) {
      const existing = findPfsInstance(instances, args.pfsInstanceId);
      if (existing && existing.name !== args.instanceName.trim()) {
        instances = instances.map((inst) =>
          inst.id === args.pfsInstanceId
            ? { ...inst, name: args.instanceName!.trim() }
            : inst,
        );
        pipeline = await persistPfsInstancesOnPipeline(ctx, pipeline, instances);
      }
    }

    if (args.createInstance) {
      const nextInst = createEmptyPfsInstance({
        name:
          args.instanceName?.trim() ||
          defaultPfsInstanceName(instances.length),
        assignedContactIds: args.assignedContactIds,
      });
      instances = [...instances, nextInst];
      createdInstanceId = nextInst.id;
      pipeline = await persistPfsInstancesOnPipeline(ctx, pipeline, instances);
    }

    const forms = await ctx.db
      .query("intakeForms")
      .withIndex("by_file", (q) => q.eq("fileId", args.pipelineFileId))
      .collect();
    const vaultTasks = await ctx.db
      .query("documentVaultFileTasks")
      .withIndex("by_pipeline_sort", (q) =>
        q.eq("pipelineFileId", args.pipelineFileId),
      )
      .collect();

    const plan = planPfsAssociations({
      instances,
      forms: forms.map((f) => ({
        id: String(f._id),
        name: f.name,
        sourceKind: f.sourceKind,
        sourceInstanceId: f.sourceInstanceId,
      })),
      vaultTasks: vaultTasks.map((t) => ({
        id: String(t._id),
        title: t.title,
        sourceKind: t.sourceKind,
        sourceInstanceId: t.sourceInstanceId,
        assignedBlockIds: normalizeAssignedBlockEntriesFromDoc(t).map(
          (e) => e.blockId,
        ),
        isArchived: t.isArchived,
        status: t.status,
        taskType: t.taskType,
      })),
    });

    const targetIds = args.pfsInstanceId
      ? new Set([args.pfsInstanceId, ...(createdInstanceId ? [createdInstanceId] : [])])
      : createdInstanceId
        ? new Set([createdInstanceId])
        : null;
    const backfillAll = !targetIds;

    const items = plan.filter((item) => {
      if (targetIds) return targetIds.has(item.instanceId);
      if (!backfillAll) return true;
      const inst = findPfsInstance(instances, item.instanceId);
      if (!inst) return false;
      if (inst.vaultFileTaskId || inst.intakeFormId) return true;
      if (item.formId || item.vaultFileTaskId) return true;
      return instances.length > 1;
    });

    let createdForms = 0;
    let createdTasks = 0;
    const linked: Array<{
      pfsInstanceId: string;
      title: string;
      intakeFormId: string;
      vaultFileTaskId: string;
    }> = [];

    for (const item of items) {
      const instance = findPfsInstance(instances, item.instanceId);
      if (!instance) continue;

      if (item.vaultFileTaskId && !item.createVaultTask) {
        const existing = await ctx.db.get(
          item.vaultFileTaskId as Id<"documentVaultFileTasks">,
        );
        if (existing && !existing.isArchived) {
          const patch: Partial<Doc<"documentVaultFileTasks">> = {
            updatedAt: Date.now(),
          };
          if (item.renameVaultTask && existing.title !== item.title) {
            patch.title = item.title;
          }
          if (existing.sourceKind !== "pfs_instance") {
            patch.sourceKind = "pfs_instance";
          }
          if (existing.sourceInstanceId !== instance.id) {
            patch.sourceInstanceId = instance.id;
          }
          if (!existing.isPortalVisible) patch.isPortalVisible = true;
          if (Object.keys(patch).length > 1) {
            await ctx.db.patch(existing._id, patch);
          }
          if (instance.vaultFileTaskId !== String(existing._id)) {
            instances = instances.map((inst) =>
              inst.id === instance.id
                ? { ...inst, vaultFileTaskId: String(existing._id) }
                : inst,
            );
            pipeline = await persistPfsInstancesOnPipeline(
              ctx,
              pipeline,
              instances,
            );
          }
        }
      } else {
        const ensured = await ensurePfsInstanceVaultTaskForInstance(ctx, {
          pipeline,
          instances,
          instance,
          memberUserKey: args.memberUserKey,
          assignedContactId: instance.assignedContactIds?.[0]
            ? (instance.assignedContactIds[0] as Id<"contacts">)
            : undefined,
          title: item.title,
        });
        instances = ensured.instances;
        pipeline = ensured.pipeline;
        if (ensured.created) createdTasks += 1;
      }

      const formResult = await ensurePfsIntakeFormForInstance(ctx, {
        pipeline,
        instance: findPfsInstance(instances, item.instanceId) ?? instance,
        title: item.title,
        formId: item.formId,
        createForm: item.createForm,
        renameForm: item.renameForm,
        memberUserKey: args.memberUserKey,
      });
      if (formResult.created) createdForms += 1;
      const current = findPfsInstance(instances, item.instanceId) ?? instance;
      if (current.intakeFormId !== String(formResult.formId)) {
        instances = instances.map((inst) =>
          inst.id === item.instanceId
            ? { ...inst, intakeFormId: String(formResult.formId) }
            : inst,
        );
        pipeline = await persistPfsInstancesOnPipeline(ctx, pipeline, instances);
      }

      const linkedInst = findPfsInstance(instances, item.instanceId);
      if (linkedInst?.intakeFormId && linkedInst.vaultFileTaskId) {
        linked.push({
          pfsInstanceId: linkedInst.id,
          title: item.title,
          intakeFormId: linkedInst.intakeFormId,
          vaultFileTaskId: linkedInst.vaultFileTaskId,
        });
      }
    }

    return {
      ok: true as const,
      createdInstanceId,
      createdForms,
      createdTasks,
      linked,
      pfsInstances: instances,
    };
  },
});

export const setFileTaskAccessPassword = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    password: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, password, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const plain = password.trim();
    if (!plain) throw new Error("Enter a password.");
    if (plain.length > MAX_TASK_PASSWORD_LEN) {
      throw new Error("Password is too long.");
    }
    const salt = randomHex(16);
    const hash = await hashPassword(plain, salt);
    await ctx.db.patch(fileTaskId, {
      accessPasswordSalt: salt,
      accessPasswordHash: hash,
      updatedAt: Date.now(),
    });
    return { ok: true as const, passwordProtected: true as const };
  },
});

export const clearFileTaskAccessPassword = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    ...memberKeyArg,
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await loadTaskOrThrow(ctx, fileTaskId);
    const pipeline = await loadPipelineOrThrow(ctx, task.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await ctx.db.patch(fileTaskId, {
      accessPasswordSalt: undefined,
      accessPasswordHash: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const, passwordProtected: false as const };
  },
});

