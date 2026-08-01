import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
  pipelineFileReadable,
} from "./organizationAccess";
import { purgeLibraryDocumentIfOrphaned } from "./libraryDocumentsCleanup";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const MAX_FOLDER_NAME_LEN = 200;

function normalizeFolderName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Folder name is required.");
  return trimmed.slice(0, MAX_FOLDER_NAME_LEN);
}

const DEFAULT_VAULT_ROOT_LABEL = "Root";

function readVaultRootLabel(
  pipeline: Doc<"pipeline"> | null | undefined,
): string {
  if (!pipeline) return DEFAULT_VAULT_ROOT_LABEL;
  const raw = pipeline.documentVaultRootLabel;
  if (typeof raw !== "string") return DEFAULT_VAULT_ROOT_LABEL;
  const trimmed = raw.trim();
  return trimmed || DEFAULT_VAULT_ROOT_LABEL;
}

async function loadPipelineOrThrow(
  ctx: { db: { get: (id: Id<"pipeline">) => Promise<Doc<"pipeline"> | null> } },
  pipelineFileId: Id<"pipeline">,
): Promise<Doc<"pipeline">> {
  const row = await ctx.db.get(pipelineFileId);
  if (!row) throw new Error("Pipeline file not found.");
  return row;
}

async function loadFolderOrThrow(
  ctx: { db: { get: (id: Id<"documentFolders">) => Promise<Doc<"documentFolders"> | null> } },
  folderId: Id<"documentFolders">,
): Promise<Doc<"documentFolders">> {
  const folder = await ctx.db.get(folderId);
  if (!folder) throw new Error("Folder not found.");
  return folder;
}

async function assertParentFolderMatchesPipeline(
  ctx: { db: { get: (id: Id<"documentFolders">) => Promise<Doc<"documentFolders"> | null> } },
  parentFolderId: Id<"documentFolders">,
  pipelineFileId: Id<"pipeline">,
): Promise<void> {
  const parent = await loadFolderOrThrow(ctx, parentFolderId);
  if (parent.pipelineFileId !== pipelineFileId) {
    throw new Error("Parent folder belongs to a different file.");
  }
}

async function folderHasChildFolders(
  ctx: QueryCtx | MutationCtx,
  pipelineFileId: Id<"pipeline">,
  folderId: Id<"documentFolders">,
): Promise<boolean> {
  const siblings = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", pipelineFileId))
    .collect();
  return siblings.some((f) => f.parentFolderId === folderId);
}

async function folderHasDocuments(
  ctx: QueryCtx | MutationCtx,
  folderId: Id<"documentFolders">,
): Promise<boolean> {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_folder", (q) => q.eq("folderId", folderId))
    .first();
  return links != null;
}

export const listFoldersByPipeline = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);
    const rows = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    return rows.sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  },
});

export const createFolder = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    name: v.string(),
    parentFolderId: v.optional(v.id("documentFolders")),
    fileTaskId: v.optional(v.id("documentVaultFileTasks")),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, name, parentFolderId, fileTaskId, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const safeName = normalizeFolderName(name);
    if (parentFolderId) {
      await assertParentFolderMatchesPipeline(ctx, parentFolderId, pipelineFileId);
    }
    if (fileTaskId) {
      const task = await ctx.db.get(fileTaskId);
      if (!task || task.pipelineFileId !== pipelineFileId) {
        throw new Error("File task does not belong to this pipeline file.");
      }
    }

    const siblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    const parentKey = parentFolderId ?? null;
    const taskKey = fileTaskId ?? null;
    const nameTaken = siblings.some(
      (f) =>
        (f.parentFolderId ?? null) === parentKey &&
        (f.fileTaskId ?? null) === taskKey &&
        f.name.localeCompare(safeName, undefined, { sensitivity: "base" }) ===
          0,
    );
    if (nameTaken) {
      throw new Error(`A folder named "${safeName}" already exists here.`);
    }

    const now = Date.now();
    const siblingOrders = siblings
      .filter(
        (f) =>
          (f.parentFolderId ?? null) === parentKey &&
          (f.fileTaskId ?? null) === taskKey,
      )
      .map((f) => (typeof f.sortOrder === "number" && Number.isFinite(f.sortOrder) ? f.sortOrder : 0));
    const maxOrder =
      siblingOrders.length > 0 ? Math.max(...siblingOrders) : 0;
    const nextSortOrder = maxOrder + 1000;
    const folderId = await ctx.db.insert("documentFolders", {
      name: safeName,
      pipelineFileId,
      ...(parentFolderId != null ? { parentFolderId } : {}),
      ...(fileTaskId != null ? { fileTaskId } : {}),
      sortOrder: nextSortOrder,
      createdAt: now,
      updatedAt: now,
    });
    return { folderId };
  },
});

export const renameFolder = mutation({
  args: {
    folderId: v.id("documentFolders"),
    name: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, name, memberUserKey }) => {
    const folder = await loadFolderOrThrow(ctx, folderId);
    const pipeline = await loadPipelineOrThrow(ctx, folder.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const safeName = normalizeFolderName(name);
    const siblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", folder.pipelineFileId))
      .collect();
    const parentKey = folder.parentFolderId ?? null;
    const nameTaken = siblings.some(
      (f) =>
        f._id !== folderId &&
        (f.parentFolderId ?? null) === parentKey &&
        f.name.localeCompare(safeName, undefined, { sensitivity: "base" }) ===
          0,
    );
    if (nameTaken) {
      throw new Error(`A folder named "${safeName}" already exists here.`);
    }

    await ctx.db.patch(folderId, { name: safeName, updatedAt: Date.now() });
    return { ok: true as const, name: safeName, folderId };
  },
});

export const deleteFolder = mutation({
  args: {
    folderId: v.id("documentFolders"),
    strategy: v.optional(
      v.union(v.literal("move_to_parent"), v.literal("delete_contents")),
    ),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, strategy, memberUserKey }) => {
    const folder = await loadFolderOrThrow(ctx, folderId);
    const pipeline = await loadPipelineOrThrow(ctx, folder.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const mode = strategy ?? "move_to_parent";
    const now = Date.now();

    if (mode === "move_to_parent") {
      await moveFolderContentsToParent(ctx, folder, now);
      await ctx.db.delete(folderId);
      return { ok: true as const, strategy: mode };
    }

    await cascadeDeleteFolderTree(ctx, folder, memberUserKey);
    return { ok: true as const, strategy: mode };
  },
});

async function moveFolderContentsToParent(
  ctx: MutationCtx,
  folder: Doc<"documentFolders">,
  now: number,
): Promise<void> {
  const parentId = folder.parentFolderId ?? null;
  const allFolders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", folder.pipelineFileId))
    .collect();

  for (const child of allFolders.filter((f) => f.parentFolderId === folder._id)) {
    await ctx.db.patch(child._id, {
      parentFolderId: parentId ?? undefined,
      updatedAt: now,
    });
  }

  const docLinks = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
    .collect();
  for (const link of docLinks) {
    await ctx.db.patch(link._id, {
      folderId: parentId ?? undefined,
    });
  }
}

async function collectSubtreeFolderIds(
  allFolders: Doc<"documentFolders">[],
  rootId: Id<"documentFolders">,
): Promise<Id<"documentFolders">[]> {
  const out: Id<"documentFolders">[] = [];
  const queue: Id<"documentFolders">[] = [rootId];
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

async function cascadeDeleteFolderTree(
  ctx: MutationCtx,
  folder: Doc<"documentFolders">,
  memberUserKey: string | undefined,
): Promise<void> {
  const pipeline = await loadPipelineOrThrow(ctx, folder.pipelineFileId);
  const allFolders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", folder.pipelineFileId))
    .collect();
  const subtreeIds = await collectSubtreeFolderIds(allFolders, folder._id);
  const subtreeSet = new Set(subtreeIds.map(String));

  const pipelineLinks = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", folder.pipelineFileId),
    )
    .collect();

  const documentIds = new Set<Id<"libraryDocuments">>();
  for (const link of pipelineLinks) {
    if (link.folderId && subtreeSet.has(String(link.folderId))) {
      documentIds.add(link.documentId);
    }
  }

  for (const documentId of documentIds) {
    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect();
    const hit = links.find((l) => l.pipelineFileId === folder.pipelineFileId);
    if (hit) {
      await ctx.db.delete(hit._id);
      await purgeLibraryDocumentIfOrphaned(ctx, documentId);
    }
  }

  for (const id of [...subtreeIds].reverse()) {
    await ctx.db.delete(id);
  }
}

export const getFolderDeletePreview = query({
  args: {
    folderId: v.id("documentFolders"),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, memberUserKey }) => {
    const folder = await loadFolderOrThrow(ctx, folderId);
    const pipeline = await loadPipelineOrThrow(ctx, folder.pipelineFileId);
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);

    const allFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", folder.pipelineFileId))
      .collect();
    const subtreeIds = await collectSubtreeFolderIds(allFolders, folder._id);
    const subtreeSet = new Set(subtreeIds.map(String));
    const subfolderCount = Math.max(0, subtreeIds.length - 1);

    const pipelineLinks = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_pipeline_linkedAt", (q) =>
        q.eq("pipelineFileId", folder.pipelineFileId),
      )
      .collect();
    const documentCount = pipelineLinks.filter(
      (l) => l.folderId && subtreeSet.has(String(l.folderId)),
    ).length;

    const parentFolder = folder.parentFolderId
      ? await ctx.db.get(folder.parentFolderId)
      : null;

    return {
      folderName: folder.name,
      subfolderCount,
      documentCount,
      parentFolderName: parentFolder?.name ?? null,
      isRootChild: folder.parentFolderId == null,
    };
  },
});

function folderIsDescendantOf(
  folders: Doc<"documentFolders">[],
  folderId: Id<"documentFolders">,
  potentialAncestorId: Id<"documentFolders">,
): boolean {
  const byId = new Map(folders.map((f) => [String(f._id), f]));
  let cursor: Id<"documentFolders"> | undefined = folderId;
  const guard = new Set<string>();
  while (cursor && !guard.has(String(cursor))) {
    guard.add(String(cursor));
    if (cursor === potentialAncestorId) return true;
    cursor = byId.get(String(cursor))?.parentFolderId;
  }
  return false;
}

/** Move folder to a new parent and/or sort position. */
export const moveFolder = mutation({
  args: {
    folderId: v.id("documentFolders"),
    parentFolderId: v.optional(
      v.union(v.id("documentFolders"), v.null()),
    ),
    fileTaskId: v.optional(
      v.union(v.id("documentVaultFileTasks"), v.null()),
    ),
    sortOrder: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, parentFolderId, fileTaskId, sortOrder, memberUserKey }) => {
    const folder = await loadFolderOrThrow(ctx, folderId);
    const pipeline = await loadPipelineOrThrow(ctx, folder.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const siblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", folder.pipelineFileId))
      .collect();

    const nextParent =
      parentFolderId === undefined
        ? (folder.parentFolderId ?? null)
        : parentFolderId;

    if (nextParent === folderId) {
      throw new Error("A folder cannot be moved into itself.");
    }
    if (nextParent && folderIsDescendantOf(siblings, nextParent, folderId)) {
      throw new Error("Cannot move a folder into its own subfolder.");
    }
    if (nextParent) {
      await assertParentFolderMatchesPipeline(ctx, nextParent, folder.pipelineFileId);
    }

    const nextFileTask =
      fileTaskId === undefined
        ? (folder.fileTaskId ?? null)
        : fileTaskId;
    if (nextFileTask) {
      const task = await ctx.db.get(nextFileTask);
      if (!task || task.pipelineFileId !== folder.pipelineFileId) {
        throw new Error("File task does not belong to this pipeline file.");
      }
    }

    const parentKey = nextParent ?? null;
    const taskKey = nextFileTask ?? null;
    const nameTaken = siblings.some(
      (f) =>
        f._id !== folderId &&
        (f.parentFolderId ?? null) === parentKey &&
        (f.fileTaskId ?? null) === taskKey &&
        f.name.localeCompare(folder.name, undefined, { sensitivity: "base" }) ===
          0,
    );
    if (nameTaken) {
      throw new Error(
        `A folder named "${folder.name}" already exists in the destination.`,
      );
    }

    const patch: {
      parentFolderId?: Id<"documentFolders">;
      fileTaskId?: Id<"documentVaultFileTasks">;
      sortOrder?: number;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (parentFolderId !== undefined) {
      patch.parentFolderId = nextParent ?? undefined;
    }
    if (fileTaskId !== undefined) {
      patch.fileTaskId = nextFileTask ?? undefined;
    }
    if (sortOrder !== undefined) {
      patch.sortOrder = sortOrder;
    }

    await ctx.db.patch(folderId, patch);
    return { ok: true as const };
  },
});

/** Reorder sibling folders under the same parent (root when parent omitted). */
export const reorderSiblingFolders = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    parentFolderId: v.optional(v.id("documentFolders")),
    orderedFolderIds: v.array(v.id("documentFolders")),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const { pipelineFileId, parentFolderId, orderedFolderIds, memberUserKey } =
      args;
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const parentKey = parentFolderId ?? null;
    const siblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect()
      .then((rows) =>
        rows.filter((f) => (f.parentFolderId ?? null) === parentKey),
      );

    const siblingIds = new Set(siblings.map((f) => String(f._id)));
    if (orderedFolderIds.length !== siblings.length) {
      throw new Error("Folder order must include every sibling.");
    }
    for (const id of orderedFolderIds) {
      if (!siblingIds.has(String(id))) {
        throw new Error("Invalid folder in reorder list.");
      }
    }

    const now = Date.now();
    for (let i = 0; i < orderedFolderIds.length; i++) {
      await ctx.db.patch(orderedFolderIds[i]!, {
        sortOrder: i * 1000,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});

/** Phase 40.3 — vault root display label (virtual root node). */
export const getVaultRootLabel = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    try {
      const pipeline = await ctx.db.get(pipelineFileId);
      if (!pipeline) {
        return { rootLabel: DEFAULT_VAULT_ROOT_LABEL };
      }
      const readable = await pipelineFileReadable(
        ctx,
        pipeline,
        memberUserKey,
      );
      if (!readable) {
        return { rootLabel: DEFAULT_VAULT_ROOT_LABEL };
      }
      return { rootLabel: readVaultRootLabel(pipeline) };
    } catch {
      return { rootLabel: DEFAULT_VAULT_ROOT_LABEL };
    }
  },
});

export const renameVaultRoot = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    label: v.string(),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, label, memberUserKey }) => {
    const pipeline = await loadPipelineOrThrow(ctx, pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const trimmed = label.trim().slice(0, MAX_FOLDER_NAME_LEN);
    if (!trimmed) throw new Error("Root label is required.");
    await ctx.db.patch(pipelineFileId, {
      documentVaultRootLabel: trimmed,
      updatedAt: Date.now(),
    });
    return { ok: true as const, rootLabel: trimmed };
  },
});

/** Assign a folder (and its subtree) to a File Task container root. */
export const assignFolderToFileTask = mutation({
  args: {
    folderId: v.id("documentFolders"),
    fileTaskId: v.union(v.id("documentVaultFileTasks"), v.null()),
    ...memberKeyArg,
  },
  handler: async (ctx, { folderId, fileTaskId, memberUserKey }) => {
    const folder = await loadFolderOrThrow(ctx, folderId);
    const pipeline = await loadPipelineOrThrow(ctx, folder.pipelineFileId);
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    if (fileTaskId) {
      const task = await ctx.db.get(fileTaskId);
      if (!task || task.pipelineFileId !== folder.pipelineFileId) {
        throw new Error("File task does not belong to this pipeline file.");
      }
    }

    const allFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) =>
        q.eq("pipelineFileId", folder.pipelineFileId),
      )
      .collect();

    const subtreeIds: Id<"documentFolders">[] = [];
    const queue: Id<"documentFolders">[] = [folderId];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(String(id))) continue;
      seen.add(String(id));
      subtreeIds.push(id);
      for (const child of allFolders.filter((f) => f.parentFolderId === id)) {
        queue.push(child._id);
      }
    }

    const now = Date.now();
    for (const id of subtreeIds) {
      await ctx.db.patch(id, {
        fileTaskId: fileTaskId ?? undefined,
        ...(id === folderId && fileTaskId
          ? { parentFolderId: undefined }
          : {}),
        updatedAt: now,
      });
    }

    const subtreeSet = new Set(subtreeIds.map(String));
    const links = await ctx.db
      .query("libraryDocumentLinks")
      .withIndex("by_pipeline_linkedAt", (q) =>
        q.eq("pipelineFileId", folder.pipelineFileId),
      )
      .collect();
    for (const link of links) {
      const inSubtreeFolder =
        link.folderId != null && subtreeSet.has(String(link.folderId));
      if (inSubtreeFolder) {
        await ctx.db.patch(link._id, {
          fileTaskId: fileTaskId ?? undefined,
        });
      }
    }

    return { ok: true as const };
  },
});
