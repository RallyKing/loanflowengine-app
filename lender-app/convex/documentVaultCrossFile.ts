/**
 * Document Vault — move / copy folders, file tasks, and documents
 * to another loan file in the same organization (same-project siblings
 * preferred in the picker; any org file the caller can mutate is allowed).
 *
 * Reuses link-based document identity (no blob duplication) and
 * recreates / re-homes folder + file-task rows that are pipeline-scoped.
 */
import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import { filterPipelineRowsForMember } from "./resourceAccess";
import { loadPipelineFilesForProject } from "./pipelineHierarchyCompat";
import { requireLinkForProof } from "./libraryDocuments";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const modeV = v.union(v.literal("move"), v.literal("copy"));

const entityV = v.union(
  v.object({
    kind: v.literal("document"),
    documentId: v.id("libraryDocuments"),
  }),
  v.object({
    kind: v.literal("folder"),
    folderId: v.id("documentFolders"),
  }),
  v.object({
    kind: v.literal("fileTask"),
    fileTaskId: v.id("documentVaultFileTasks"),
  }),
);

const siblingFileV = v.object({
  _id: v.id("pipeline"),
  fileName: v.string(),
  status: v.string(),
  updatedAt: v.number(),
  /** Same project as the source file when both have a projectId. */
  sameProject: v.boolean(),
});

const ORG_TRANSFER_TARGET_LIMIT = 80;

async function loadPipelineOrThrow(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
): Promise<Doc<"pipeline">> {
  const row = await ctx.db.get(pipelineFileId);
  if (!row) throw new Error("Pipeline file not found.");
  return row;
}

async function assertSiblingTransferPair(
  ctx: MutationCtx,
  source: Doc<"pipeline">,
  target: Doc<"pipeline">,
  memberUserKey: string | undefined,
): Promise<void> {
  await assertCanMutatePipelineRow(ctx, source, memberUserKey);
  await assertCanMutatePipelineRow(ctx, target, memberUserKey);

  if (source._id === target._id) {
    throw new Error("Choose a different loan file.");
  }
  if (!source.organizationId || !target.organizationId) {
    throw new Error("Both files must belong to an organization.");
  }
  if (source.organizationId !== target.organizationId) {
    throw new Error("Target file is not in the same organization.");
  }
}

function collectFolderSubtree(
  allFolders: Doc<"documentFolders">[],
  rootFolderId: Id<"documentFolders">,
): Doc<"documentFolders">[] {
  const byParent = new Map<string, Doc<"documentFolders">[]>();
  for (const f of allFolders) {
    const key = f.parentFolderId ? String(f.parentFolderId) : "__root__";
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  const out: Doc<"documentFolders">[] = [];
  const queue: Id<"documentFolders">[] = [rootFolderId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(String(id))) continue;
    seen.add(String(id));
    const folder = allFolders.find((f) => f._id === id);
    if (!folder) continue;
    out.push(folder);
    for (const child of byParent.get(String(id)) ?? []) {
      queue.push(child._id);
    }
  }
  return out;
}

function collectTaskSubtreeFolders(
  allFolders: Doc<"documentFolders">[],
  fileTaskId: Id<"documentVaultFileTasks">,
): Doc<"documentFolders">[] {
  const roots = allFolders.filter((f) => f.fileTaskId === fileTaskId);
  const seen = new Set<string>();
  const out: Doc<"documentFolders">[] = [];
  for (const root of roots) {
    for (const f of collectFolderSubtree(allFolders, root._id)) {
      if (seen.has(String(f._id))) continue;
      seen.add(String(f._id));
      out.push(f);
    }
  }
  return out;
}

function uniqueFolderName(
  siblings: Doc<"documentFolders">[],
  desired: string,
  parentFolderId: Id<"documentFolders"> | null,
  fileTaskId: Id<"documentVaultFileTasks"> | null,
  excludeId?: Id<"documentFolders">,
): string {
  const parentKey = parentFolderId ?? null;
  const taskKey = fileTaskId ?? null;
  const taken = (name: string) =>
    siblings.some(
      (f) =>
        f._id !== excludeId &&
        (f.parentFolderId ?? null) === parentKey &&
        (f.fileTaskId ?? null) === taskKey &&
        f.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
    );
  if (!taken(desired)) return desired;
  for (let i = 2; i < 100; i++) {
    const candidate = `${desired} (${i})`;
    if (!taken(candidate)) return candidate;
  }
  return `${desired} (${Date.now()})`;
}

async function nextTaskSortOrder(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
): Promise<number> {
  const rows = await ctx.db
    .query("documentVaultFileTasks")
    .withIndex("by_pipeline_sort", (q) => q.eq("pipelineFileId", pipelineFileId))
    .collect();
  return rows.reduce((acc, row) => Math.max(acc, row.sortOrder), 0) + 1000;
}

function copyLinkMetadata(
  source: Doc<"libraryDocumentLinks">,
): Partial<Doc<"libraryDocumentLinks">> {
  return {
    documentCategory: source.documentCategory,
    taxYear: source.taxYear,
    customTags: source.customTags,
    expiresAt: source.expiresAt,
    assignedContactId: source.assignedContactId,
    assignedClientId: source.assignedClientId,
    assignedLenderId: source.assignedLenderId,
    // Keep client-share off until broker opts in on the destination.
    isSharedWithClient: false,
    reviewStatus: source.reviewStatus,
    rejectionReason: source.rejectionReason,
    rejectedAt: source.rejectedAt,
    rejectedByUserKey: source.rejectedByUserKey,
  };
}

async function transferDocument(
  ctx: MutationCtx,
  args: {
    documentId: Id<"libraryDocuments">;
    sourcePipelineFileId: Id<"pipeline">;
    targetPipelineFileId: Id<"pipeline">;
    mode: "move" | "copy";
    memberUserKey: string | undefined;
    folderId?: Id<"documentFolders">;
    fileTaskId?: Id<"documentVaultFileTasks">;
  },
): Promise<{ documentId: Id<"libraryDocuments">; linkId: Id<"libraryDocumentLinks"> }> {
  const sourceLink = await requireLinkForProof(ctx, args.documentId, {
    kind: "pipeline",
    pipelineFileId: args.sourcePipelineFileId,
  });

  const existingOnTarget = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
    .collect()
    .then((rows) =>
      rows.find((l) => l.pipelineFileId === args.targetPipelineFileId),
    );

  const key = args.memberUserKey?.trim() || "__system__";
  const now = Date.now();
  const meta = copyLinkMetadata(sourceLink);

  if (args.mode === "copy") {
    if (existingOnTarget) {
      throw new Error("This document is already linked to the target file.");
    }
    const linkId = await ctx.db.insert("libraryDocumentLinks", {
      documentId: args.documentId,
      pipelineFileId: args.targetPipelineFileId,
      ...(args.folderId ? { folderId: args.folderId } : {}),
      ...(args.fileTaskId ? { fileTaskId: args.fileTaskId } : {}),
      ...meta,
      linkedAt: now,
      linkedByUserKey: key,
    });
    await ctx.db.patch(args.documentId, { updatedAt: now });
    return { documentId: args.documentId, linkId };
  }

  // Move — retarget the existing pipeline link (no orphaned source link).
  if (existingOnTarget && existingOnTarget._id !== sourceLink._id) {
    throw new Error(
      "This document is already linked to the target file. Remove the other link first, or use Copy.",
    );
  }
  await ctx.db.patch(sourceLink._id, {
    pipelineFileId: args.targetPipelineFileId,
    folderId: args.folderId ?? undefined,
    fileTaskId: args.fileTaskId ?? undefined,
    isSharedWithClient: false,
  });
  await ctx.db.patch(args.documentId, { updatedAt: now });
  return { documentId: args.documentId, linkId: sourceLink._id };
}

async function cloneFolderTree(
  ctx: MutationCtx,
  args: {
    folders: Doc<"documentFolders">[];
    rootFolderId: Id<"documentFolders">;
    targetPipelineFileId: Id<"pipeline">;
    targetParentFolderId: Id<"documentFolders"> | null;
    targetFileTaskId: Id<"documentVaultFileTasks"> | null;
  },
): Promise<Map<string, Id<"documentFolders">>> {
  const idMap = new Map<string, Id<"documentFolders">>();
  // Create parents before children (subtree array is BFS-ordered).
  const now = Date.now();
  for (const folder of args.folders) {
    const isRoot = folder._id === args.rootFolderId;
    const parentMapped = isRoot
      ? args.targetParentFolderId
      : folder.parentFolderId
        ? (idMap.get(String(folder.parentFolderId)) ?? null)
        : null;
    const liveSiblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) =>
        q.eq("pipelineFileId", args.targetPipelineFileId),
      )
      .collect();
    const safeName = uniqueFolderName(
      liveSiblings,
      folder.name,
      parentMapped,
      args.targetFileTaskId,
    );

    const newId = await ctx.db.insert("documentFolders", {
      name: safeName,
      pipelineFileId: args.targetPipelineFileId,
      ...(parentMapped ? { parentFolderId: parentMapped } : {}),
      ...(args.targetFileTaskId
        ? { fileTaskId: args.targetFileTaskId }
        : {}),
      ...(folder.assignedContactId
        ? { assignedContactId: folder.assignedContactId }
        : {}),
      ...(folder.assignedClientId
        ? { assignedClientId: folder.assignedClientId }
        : {}),
      ...(folder.assignedLenderId
        ? { assignedLenderId: folder.assignedLenderId }
        : {}),
      sortOrder: folder.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    idMap.set(String(folder._id), newId);
  }

  return idMap;
}

async function transferFolder(
  ctx: MutationCtx,
  args: {
    folderId: Id<"documentFolders">;
    source: Doc<"pipeline">;
    target: Doc<"pipeline">;
    mode: "move" | "copy";
    memberUserKey: string | undefined;
  },
): Promise<{
  folderId: Id<"documentFolders">;
  foldersTransferred: number;
  documentsTransferred: number;
}> {
  const root = await ctx.db.get(args.folderId);
  if (!root || root.pipelineFileId !== args.source._id) {
    throw new Error("Folder not found on this loan file.");
  }

  const allFolders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", args.source._id))
    .collect();
  const subtree = collectFolderSubtree(allFolders, args.folderId);
  const subtreeIds = new Set(subtree.map((f) => String(f._id)));

  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", args.source._id),
    )
    .collect()
    .then((rows) =>
      rows.filter((l) => l.folderId != null && subtreeIds.has(String(l.folderId))),
    );

  if (args.mode === "move") {
    // Re-home in place: patch pipelineFileId, place root at destination root.
    const targetFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", args.target._id))
      .collect();
    const safeRootName = uniqueFolderName(
      targetFolders,
      root.name,
      null,
      null,
      root._id,
    );
    const now = Date.now();
    for (const folder of subtree) {
      const isRoot = folder._id === args.folderId;
      await ctx.db.patch(folder._id, {
        pipelineFileId: args.target._id,
        ...(isRoot
          ? {
              parentFolderId: undefined,
              name: safeRootName,
            }
          : {}),
        fileTaskId: undefined,
        updatedAt: now,
      });
    }
    for (const link of links) {
      await ctx.db.patch(link._id, {
        pipelineFileId: args.target._id,
        fileTaskId: undefined,
        isSharedWithClient: false,
      });
    }
    return {
      folderId: args.folderId,
      foldersTransferred: subtree.length,
      documentsTransferred: links.length,
    };
  }

  // Copy — clone tree + new links (shared document blobs).
  const idMap = await cloneFolderTree(ctx, {
    folders: subtree,
    rootFolderId: args.folderId,
    targetPipelineFileId: args.target._id,
    targetParentFolderId: null,
    targetFileTaskId: null,
  });

  let documentsTransferred = 0;
  for (const link of links) {
    const mappedFolder = link.folderId
      ? idMap.get(String(link.folderId))
      : undefined;
    try {
      await transferDocument(ctx, {
        documentId: link.documentId,
        sourcePipelineFileId: args.source._id,
        targetPipelineFileId: args.target._id,
        mode: "copy",
        memberUserKey: args.memberUserKey,
        folderId: mappedFolder,
      });
      documentsTransferred += 1;
    } catch (e) {
      // Skip docs already on target; continue cloning the rest.
      if (
        e instanceof Error &&
        e.message.includes("already linked to the target")
      ) {
        continue;
      }
      throw e;
    }
  }

  const newRootId = idMap.get(String(args.folderId));
  if (!newRootId) throw new Error("Failed to copy folder.");
  return {
    folderId: newRootId,
    foldersTransferred: subtree.length,
    documentsTransferred,
  };
}

async function transferFileTask(
  ctx: MutationCtx,
  args: {
    fileTaskId: Id<"documentVaultFileTasks">;
    source: Doc<"pipeline">;
    target: Doc<"pipeline">;
    mode: "move" | "copy";
    memberUserKey: string | undefined;
  },
): Promise<{
  fileTaskId: Id<"documentVaultFileTasks">;
  foldersTransferred: number;
  documentsTransferred: number;
}> {
  const task = await ctx.db.get(args.fileTaskId);
  if (!task || task.pipelineFileId !== args.source._id) {
    throw new Error("File task not found on this loan file.");
  }

  const allFolders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", args.source._id))
    .collect();
  const subtreeFolders = collectTaskSubtreeFolders(allFolders, args.fileTaskId);
  const subtreeIds = new Set(subtreeFolders.map((f) => String(f._id)));

  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", args.source._id),
    )
    .collect()
    .then((rows) =>
      rows.filter(
        (l) =>
          l.fileTaskId === args.fileTaskId ||
          (l.folderId != null && subtreeIds.has(String(l.folderId))),
      ),
    );

  if (args.mode === "move") {
    const now = Date.now();
    await ctx.db.patch(args.fileTaskId, {
      pipelineFileId: args.target._id,
      sortOrder: await nextTaskSortOrder(ctx, args.target._id),
      updatedAt: now,
    });
    for (const folder of subtreeFolders) {
      await ctx.db.patch(folder._id, {
        pipelineFileId: args.target._id,
        updatedAt: now,
      });
    }
    for (const link of links) {
      await ctx.db.patch(link._id, {
        pipelineFileId: args.target._id,
        isSharedWithClient: false,
      });
    }
    const tokens = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_fileTask", (q) => q.eq("fileTaskId", args.fileTaskId))
      .collect();
    for (const tok of tokens) {
      await ctx.db.patch(tok._id, { pipelineFileId: args.target._id });
    }
    return {
      fileTaskId: args.fileTaskId,
      foldersTransferred: subtreeFolders.length,
      documentsTransferred: links.length,
    };
  }

  // Copy — new task + cloned folders + new links (reuse template storageIds).
  const now = Date.now();
  const key = args.memberUserKey?.trim() || task.createdByUserKey || "__system__";
  const newTaskId = await ctx.db.insert("documentVaultFileTasks", {
    pipelineFileId: args.target._id,
    title: task.title,
    description: task.description,
    sortOrder: await nextTaskSortOrder(ctx, args.target._id),
    status: "incomplete",
    isRequired: task.isRequired,
    isPortalVisible: task.isPortalVisible,
    isArchived: false,
    dueDate: task.dueDate,
    priority: task.priority,
    taskType: task.taskType,
    clientInstructionText: task.clientInstructionText,
    instructionUrl: task.instructionUrl,
    clientTemplateAttachments: task.clientTemplateAttachments,
    assignedContactId: task.assignedContactId,
    assignedClientId: task.assignedClientId,
    assignedLenderId: task.assignedLenderId,
    assignedBlockEntries: task.assignedBlockEntries,
    assignedBlocks: task.assignedBlocks,
    createdByUserKey: key,
    createdAt: now,
    updatedAt: now,
  });

  // Clone folders preserving relative structure under the new task.
  const roots = subtreeFolders.filter(
    (f) =>
      f.fileTaskId === args.fileTaskId &&
      (f.parentFolderId == null ||
        !subtreeIds.has(String(f.parentFolderId))),
  );

  const idMap = new Map<string, Id<"documentFolders">>();
  // Process each root's BFS subtree so parents exist first.
  const ordered: Doc<"documentFolders">[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const f of collectFolderSubtree(subtreeFolders, root._id)) {
      if (seen.has(String(f._id))) continue;
      seen.add(String(f._id));
      ordered.push(f);
    }
  }
  // Also include any folders that somehow weren't reached (safety).
  for (const f of subtreeFolders) {
    if (!seen.has(String(f._id))) ordered.push(f);
  }

  for (const folder of ordered) {
    const isTaskRoot =
      folder.fileTaskId === args.fileTaskId &&
      (folder.parentFolderId == null ||
        !subtreeIds.has(String(folder.parentFolderId)));
    const parentMapped = isTaskRoot
      ? null
      : folder.parentFolderId
        ? (idMap.get(String(folder.parentFolderId)) ?? null)
        : null;

    const liveSiblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", args.target._id))
      .collect();
    const safeName = uniqueFolderName(
      liveSiblings,
      folder.name,
      parentMapped,
      newTaskId,
    );

    const newId = await ctx.db.insert("documentFolders", {
      name: safeName,
      pipelineFileId: args.target._id,
      ...(parentMapped ? { parentFolderId: parentMapped } : {}),
      fileTaskId: newTaskId,
      ...(folder.assignedContactId
        ? { assignedContactId: folder.assignedContactId }
        : {}),
      ...(folder.assignedClientId
        ? { assignedClientId: folder.assignedClientId }
        : {}),
      ...(folder.assignedLenderId
        ? { assignedLenderId: folder.assignedLenderId }
        : {}),
      sortOrder: folder.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    idMap.set(String(folder._id), newId);
  }

  let documentsTransferred = 0;
  for (const link of links) {
    const mappedFolder = link.folderId
      ? idMap.get(String(link.folderId))
      : undefined;
    try {
      await transferDocument(ctx, {
        documentId: link.documentId,
        sourcePipelineFileId: args.source._id,
        targetPipelineFileId: args.target._id,
        mode: "copy",
        memberUserKey: args.memberUserKey,
        folderId: mappedFolder,
        fileTaskId: newTaskId,
      });
      documentsTransferred += 1;
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("already linked to the target")
      ) {
        continue;
      }
      throw e;
    }
  }

  return {
    fileTaskId: newTaskId,
    foldersTransferred: ordered.length,
    documentsTransferred,
  };
}

/** Loan files the caller can move / copy vault items into (same org). */
export const listSiblingFiles = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  returns: v.object({
    projectId: v.union(v.id("projects"), v.null()),
    siblings: v.array(siblingFileV),
  }),
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) {
      return { projectId: null, siblings: [] };
    }
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);
    if (!pipeline.organizationId) {
      return { projectId: pipeline.projectId ?? null, siblings: [] };
    }

    const projectId = pipeline.projectId ?? null;
    const seen = new Set<string>([String(pipelineFileId)]);
    const targets: Array<{
      _id: Id<"pipeline">;
      fileName: string;
      status: string;
      updatedAt: number;
      sameProject: boolean;
    }> = [];

    if (projectId) {
      const projectRows = await loadPipelineFilesForProject(ctx, projectId);
      const visibleProject = await filterPipelineRowsForMember(
        ctx,
        projectRows,
        pipeline.organizationId,
        memberUserKey,
      );
      for (const f of visibleProject) {
        if (f._id === pipelineFileId) continue;
        if (f.archivedAt != null) continue;
        seen.add(String(f._id));
        targets.push({
          _id: f._id,
          fileName: f.fileName?.trim() || "Untitled file",
          status: f.status,
          updatedAt: f.updatedAt,
          sameProject: true,
        });
      }
    }

    const orgRows = await ctx.db
      .query("pipeline")
      .withIndex("by_organization_createdAt", (q) =>
        q.eq("organizationId", pipeline.organizationId!),
      )
      .order("desc")
      .take(ORG_TRANSFER_TARGET_LIMIT + 12);

    const visibleOrg = await filterPipelineRowsForMember(
      ctx,
      orgRows.filter((f) => f.archivedAt == null && !seen.has(String(f._id))),
      pipeline.organizationId,
      memberUserKey,
    );

    for (const f of visibleOrg) {
      if (targets.length >= ORG_TRANSFER_TARGET_LIMIT) break;
      if (f._id === pipelineFileId) continue;
      seen.add(String(f._id));
      targets.push({
        _id: f._id,
        fileName: f.fileName?.trim() || "Untitled file",
        status: f.status,
        updatedAt: f.updatedAt,
        sameProject: Boolean(
          projectId && f.projectId && f.projectId === projectId,
        ),
      });
    }

    targets.sort((a, b) => {
      if (a.sameProject !== b.sameProject) {
        return a.sameProject ? -1 : 1;
      }
      return a.fileName.localeCompare(b.fileName);
    });

    return {
      projectId,
      siblings: targets.slice(0, ORG_TRANSFER_TARGET_LIMIT),
    };
  },
});

/**
 * Move or copy a vault document, folder (with contents), or file task
 * to another loan file in the same organization.
 */
export const transferToSiblingFile = mutation({
  args: {
    sourcePipelineFileId: v.id("pipeline"),
    targetPipelineFileId: v.id("pipeline"),
    mode: modeV,
    entity: entityV,
    ...memberKeyArg,
  },
  returns: v.object({
    ok: v.literal(true),
    mode: modeV,
    kind: v.union(
      v.literal("document"),
      v.literal("folder"),
      v.literal("fileTask"),
    ),
    targetPipelineFileId: v.id("pipeline"),
    resultId: v.string(),
    foldersTransferred: v.number(),
    documentsTransferred: v.number(),
  }),
  handler: async (ctx, args) => {
    const source = await loadPipelineOrThrow(ctx, args.sourcePipelineFileId);
    const target = await loadPipelineOrThrow(ctx, args.targetPipelineFileId);
    await assertSiblingTransferPair(ctx, source, target, args.memberUserKey);

    if (args.entity.kind === "document") {
      const result = await transferDocument(ctx, {
        documentId: args.entity.documentId,
        sourcePipelineFileId: source._id,
        targetPipelineFileId: target._id,
        mode: args.mode,
        memberUserKey: args.memberUserKey,
      });
      return {
        ok: true as const,
        mode: args.mode,
        kind: "document" as const,
        targetPipelineFileId: target._id,
        resultId: String(result.documentId),
        foldersTransferred: 0,
        documentsTransferred: 1,
      };
    }

    if (args.entity.kind === "folder") {
      const result = await transferFolder(ctx, {
        folderId: args.entity.folderId,
        source,
        target,
        mode: args.mode,
        memberUserKey: args.memberUserKey,
      });
      return {
        ok: true as const,
        mode: args.mode,
        kind: "folder" as const,
        targetPipelineFileId: target._id,
        resultId: String(result.folderId),
        foldersTransferred: result.foldersTransferred,
        documentsTransferred: result.documentsTransferred,
      };
    }

    const result = await transferFileTask(ctx, {
      fileTaskId: args.entity.fileTaskId,
      source,
      target,
      mode: args.mode,
      memberUserKey: args.memberUserKey,
    });
    return {
      ok: true as const,
      mode: args.mode,
      kind: "fileTask" as const,
      targetPipelineFileId: target._id,
      resultId: String(result.fileTaskId),
      foldersTransferred: result.foldersTransferred,
      documentsTransferred: result.documentsTransferred,
    };
  },
});
