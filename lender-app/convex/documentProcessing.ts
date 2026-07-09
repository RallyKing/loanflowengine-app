import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanReadLibraryDocument,
  assertProofWrite,
  requireLinkForProof,
} from "./libraryDocuments";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const linkProof = v.union(
  v.object({ kind: v.literal("pipeline"), pipelineFileId: v.id("pipeline") }),
  v.object({ kind: v.literal("contact"), contactId: v.id("contacts") }),
  v.object({ kind: v.literal("task"), taskId: v.id("tasks") }),
);

export const pageAssetCropV = v.object({
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
});

const normalizedPageV = v.object({
  storageId: v.id("_storage"),
  order: v.number(),
  sourceWidth: v.number(),
  sourceHeight: v.number(),
  rotation: v.optional(v.number()),
  cropData: v.optional(pageAssetCropV),
});

async function deletePageAssetRows(
  ctx: MutationCtx,
  documentId: Id<"libraryDocuments">,
) {
  const existing = await ctx.db
    .query("documentPageAssets")
    .withIndex("by_document_order", (q) => q.eq("documentId", documentId))
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
}

export const listPageAssets = query({
  args: {
    documentId: v.id("libraryDocuments"),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const rows = await ctx.db
      .query("documentPageAssets")
      .withIndex("by_document_order", (q) => q.eq("documentId", documentId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    const pages = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        url: await ctx.storage.getUrl(row.storageId),
      })),
    );
    return pages;
  },
});

/** Replace all page assets after client-side PDF/image normalization. */
export const uploadAndNormalize = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    pages: v.array(normalizedPageV),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, proof, pages, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);
    if (pages.length === 0) {
      throw new Error("At least one page is required.");
    }

    await deletePageAssetRows(ctx, documentId);
    const now = Date.now();
    const ids: Id<"documentPageAssets">[] = [];
    for (const page of pages) {
      const meta = await ctx.storage.getMetadata(page.storageId);
      if (!meta) {
        throw new Error("Page upload not found. POST bytes before normalizing.");
      }
      const id = await ctx.db.insert("documentPageAssets", {
        documentId,
        storageId: page.storageId,
        order: page.order,
        sourceWidth: page.sourceWidth,
        sourceHeight: page.sourceHeight,
        cropData: page.cropData,
        rotation: page.rotation ?? 0,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    return { pageAssetIds: ids, count: ids.length };
  },
});

export const patchPageAsset = mutation({
  args: {
    pageAssetId: v.id("documentPageAssets"),
    proof: linkProof,
    cropData: v.optional(v.union(pageAssetCropV, v.null())),
    rotation: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, { pageAssetId, proof, cropData, rotation, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    const row = await ctx.db.get(pageAssetId);
    if (!row) throw new Error("Page asset not found.");
    await requireLinkForProof(ctx, row.documentId, proof);

    const patch: Partial<Doc<"documentPageAssets">> = { updatedAt: Date.now() };
    if (cropData !== undefined) {
      patch.cropData = cropData === null ? undefined : cropData;
    }
    if (rotation !== undefined) {
      const normalized = ((rotation % 360) + 360) % 360;
      patch.rotation = normalized;
    }
    await ctx.db.patch(pageAssetId, patch);
    return { ok: true as const };
  },
});

export const reorderPageAssets = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    orderedPageAssetIds: v.array(v.id("documentPageAssets")),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, proof, orderedPageAssetIds, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);

    const rows = await ctx.db
      .query("documentPageAssets")
      .withIndex("by_document_order", (q) => q.eq("documentId", documentId))
      .collect();
    const idSet = new Set(rows.map((r) => r._id));
    if (orderedPageAssetIds.length !== rows.length) {
      throw new Error("Reorder must include every page asset for this document.");
    }
    for (const id of orderedPageAssetIds) {
      if (!idSet.has(id)) {
        throw new Error("Invalid page asset in reorder list.");
      }
    }

    const now = Date.now();
    for (let i = 0; i < orderedPageAssetIds.length; i++) {
      await ctx.db.patch(orderedPageAssetIds[i], { order: i, updatedAt: now });
    }
    return { ok: true as const };
  },
});

export const removePageAsset = mutation({
  args: {
    pageAssetId: v.id("documentPageAssets"),
    proof: linkProof,
    ...memberKeyArg,
  },
  handler: async (ctx, { pageAssetId, proof, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    const row = await ctx.db.get(pageAssetId);
    if (!row) throw new Error("Page asset not found.");
    await requireLinkForProof(ctx, row.documentId, proof);

    const siblings = await ctx.db
      .query("documentPageAssets")
      .withIndex("by_document_order", (q) => q.eq("documentId", row.documentId))
      .collect();
    siblings.sort((a, b) => a.order - b.order);

    await ctx.db.delete(pageAssetId);

    const now = Date.now();
    let order = 0;
    for (const s of siblings) {
      if (s._id === pageAssetId) continue;
      await ctx.db.patch(s._id, { order, updatedAt: now });
      order += 1;
    }
    return { ok: true as const };
  },
});

/** Append normalized pages from another upload batch (merge / convert). */
export const appendPageAssets = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    pages: v.array(normalizedPageV),
    ...memberKeyArg,
  },
  handler: async (ctx, { documentId, proof, pages, memberUserKey }) => {
    await assertProofWrite(ctx, proof, memberUserKey);
    await requireLinkForProof(ctx, documentId, proof);
    if (pages.length === 0) return { count: 0 };

    const existing = await ctx.db
      .query("documentPageAssets")
      .withIndex("by_document_order", (q) => q.eq("documentId", documentId))
      .collect();
    let nextOrder =
      existing.length > 0
        ? Math.max(...existing.map((r) => r.order)) + 1
        : 0;

    const now = Date.now();
    const ids: Id<"documentPageAssets">[] = [];
    for (const page of pages) {
      const meta = await ctx.storage.getMetadata(page.storageId);
      if (!meta) {
        throw new Error("Page upload not found.");
      }
      const id = await ctx.db.insert("documentPageAssets", {
        documentId,
        storageId: page.storageId,
        order: nextOrder,
        sourceWidth: page.sourceWidth,
        sourceHeight: page.sourceHeight,
        cropData: page.cropData,
        rotation: page.rotation ?? 0,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
      nextOrder += 1;
    }
    return { pageAssetIds: ids, count: ids.length };
  },
});
