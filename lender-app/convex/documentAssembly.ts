import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  assertCanReadLibraryDocument,
  assertProofWrite,
  requireLinkForProof,
} from "./libraryDocuments";
import { syncLinkExpiresAt } from "./documentVaultCompliance";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const linkProof = v.union(
  v.object({ kind: v.literal("pipeline"), pipelineFileId: v.id("pipeline") }),
  v.object({ kind: v.literal("contact"), contactId: v.id("contacts") }),
  v.object({ kind: v.literal("task"), taskId: v.id("tasks") }),
);

const MAX_BYTES = 80 * 1024 * 1024;

type CommitArgs = {
  documentId: Id<"libraryDocuments">;
  proof:
    | { kind: "pipeline"; pipelineFileId: Id<"pipeline"> }
    | { kind: "contact"; contactId: Id<"contacts"> }
    | { kind: "task"; taskId: Id<"tasks"> };
  storageId: Id<"_storage">;
  fileName: string;
  contentType?: string;
  size?: number;
  memberUserKey?: string;
};

async function getStorageMetadataWithRetry(
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

async function commitAssembledPdf(ctx: MutationCtx, args: CommitArgs) {
  const {
    documentId,
    proof,
    storageId,
    fileName,
    contentType,
    size,
    memberUserKey,
  } = args;
  await assertProofWrite(ctx, proof, memberUserKey);
  await requireLinkForProof(ctx, documentId, proof);

  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found.");

  const meta = await getStorageMetadataWithRetry(ctx.storage, storageId);
  if (!meta) {
    throw new Error("Assembled PDF upload not found.");
  }
  const byteSize = size ?? meta.size ?? 0;
  if (typeof byteSize === "number" && byteSize > MAX_BYTES) {
    throw new Error("Assembled PDF exceeds maximum size.");
  }

  const safeName =
    fileName.replace(/[/\\]/g, "").trim().slice(0, 255) || "document.pdf";
  const ct = contentType || meta.contentType || "application/pdf";
  const key = memberUserKey?.trim() || "__system__";
  const now = Date.now();
  const nextVersion = doc.latestVersionNumber + 1;

  const versionId = await ctx.db.insert("libraryDocumentVersions", {
    documentId,
    version: nextVersion,
    storageId,
    fileName: safeName,
    contentType: ct,
    size: size ?? meta.size,
    uploadedByUserKey: key,
    uploadedAt: now,
  });

  await ctx.db.patch(documentId, {
    latestVersionNumber: nextVersion,
    latestVersionId: versionId,
    latestFileName: safeName,
    latestContentType: ct,
    latestSize: size ?? meta.size,
    latestUploadedAt: now,
    updatedAt: now,
  });

  const proofLink = await requireLinkForProof(ctx, documentId, proof);
  await syncLinkExpiresAt(ctx, proofLink, now);

  await ctx.db.insert("libraryDocumentAccessEvents", {
    documentId,
    pipelineFileId:
      proof.kind === "pipeline" ? proof.pipelineFileId : undefined,
    userKey: key,
    action: "edit",
    at: now,
  });

  return { versionId, version: nextVersion };
}

/** Internal payload for assembly (crop/rotate + PDF build). */
export const internalGetAssemblyPayload = internalQuery({
  args: {
    documentId: v.id("libraryDocuments"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { documentId, memberUserKey }) => {
    await assertCanReadLibraryDocument(ctx, documentId, memberUserKey);
    const doc = await ctx.db.get(documentId);
    if (!doc) return null;

    const rows = await ctx.db
      .query("documentPageAssets")
      .withIndex("by_document_order", (q) => q.eq("documentId", documentId))
      .collect();
    rows.sort((a, b) => a.order - b.order);
    if (rows.length === 0) return null;

    const pages = await Promise.all(
      rows.map(async (row) => {
        const url = await ctx.storage.getUrl(row.storageId);
        if (!url) throw new Error("Could not resolve page asset URL.");
        return {
          pageAssetId: row._id,
          url,
          sourceWidth: row.sourceWidth,
          sourceHeight: row.sourceHeight,
          cropData: row.cropData,
          rotation: row.rotation,
        };
      }),
    );

    const baseName = doc.latestFileName ?? doc.title ?? "document";
    return {
      documentId,
      fileName: baseName.toLowerCase().endsWith(".pdf")
        ? baseName
        : `${baseName.replace(/\.[^.]+$/, "")}.pdf`,
      pages,
    };
  },
});

export const internalCommitAssembledPdf = internalMutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => commitAssembledPdf(ctx, args),
});

/**
 * Commit a client-assembled PDF as the next library version.
 * Page assets (crop/rotation) remain in DB for resumable editing.
 */
export const finalizeDocument = mutation({
  args: {
    documentId: v.id("libraryDocuments"),
    proof: linkProof,
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => commitAssembledPdf(ctx, args),
});
