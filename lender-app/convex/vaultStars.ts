import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  assertCanAccessFile,
  resolveMemberUserKey,
} from "./organizationAccess";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const starListReturns = v.object({
  documentIds: v.array(v.id("libraryDocuments")),
  folderIds: v.array(v.id("documentFolders")),
});

const toggleReturns = v.object({
  starred: v.boolean(),
  targetKind: v.union(v.literal("document"), v.literal("folder")),
});

export const listForPipeline = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  returns: starListReturns,
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await assertCanAccessFile(
      ctx,
      pipelineFileId,
      memberUserKey,
    );
    const key = await resolveMemberUserKey(ctx, memberUserKey);
    const rows = await ctx.db
      .query("vaultStars")
      .withIndex("by_user_pipeline", (q) =>
        q.eq("memberUserKey", key).eq("pipelineFileId", pipelineFileId),
      )
      .collect();

    const orgId = pipeline.organizationId;
    const documentIds: Id<"libraryDocuments">[] = [];
    const folderIds: Id<"documentFolders">[] = [];
    for (const row of rows) {
      if (orgId && row.organizationId && row.organizationId !== orgId) {
        continue;
      }
      if (row.targetKind === "document" && row.documentId) {
        documentIds.push(row.documentId);
      } else if (row.targetKind === "folder" && row.folderId) {
        folderIds.push(row.folderId);
      }
    }
    return { documentIds, folderIds };
  },
});

export const toggle = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    targetKind: v.union(v.literal("document"), v.literal("folder")),
    documentId: v.optional(v.id("libraryDocuments")),
    folderId: v.optional(v.id("documentFolders")),
    ...memberKeyArg,
  },
  returns: toggleReturns,
  handler: async (ctx, args) => {
    const { pipelineFileId, targetKind, documentId, folderId, memberUserKey } =
      args;
    if (targetKind === "document") {
      if (!documentId) throw new Error("documentId is required.");
    } else if (!folderId) {
      throw new Error("folderId is required.");
    }

    const pipeline = await assertCanAccessFile(
      ctx,
      pipelineFileId,
      memberUserKey,
    );
    const key = await resolveMemberUserKey(ctx, memberUserKey);

    if (targetKind === "document" && documentId) {
      const doc = await ctx.db.get(documentId);
      if (!doc) throw new Error("Document not found.");
      const link = await ctx.db
        .query("libraryDocumentLinks")
        .withIndex("by_document", (q) => q.eq("documentId", documentId))
        .collect();
      const onFile = link.some((l) => l.pipelineFileId === pipelineFileId);
      if (!onFile) {
        throw new Error("Document is not in this file vault.");
      }
    }

    if (targetKind === "folder" && folderId) {
      const folder = await ctx.db.get(folderId);
      if (!folder) throw new Error("Folder not found.");
      if (folder.pipelineFileId !== pipelineFileId) {
        throw new Error("Folder belongs to a different file.");
      }
    }

    const existing = await ctx.db
      .query("vaultStars")
      .withIndex("by_user_pipeline", (q) =>
        q.eq("memberUserKey", key).eq("pipelineFileId", pipelineFileId),
      )
      .collect();

    const match = existing.find((row) =>
      targetKind === "document"
        ? row.documentId === documentId
        : row.folderId === folderId,
    );

    if (match) {
      await ctx.db.delete(match._id);
      return { starred: false, targetKind };
    }

    await ctx.db.insert("vaultStars", {
      organizationId: pipeline.organizationId,
      memberUserKey: key,
      pipelineFileId,
      targetKind,
      documentId: targetKind === "document" ? documentId : undefined,
      folderId: targetKind === "folder" ? folderId : undefined,
      starredAt: Date.now(),
    });
    return { starred: true, targetKind };
  },
});
