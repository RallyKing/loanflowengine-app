import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { randomHex, sha256Hex, normalizePortalToken } from "./clientPortalCrypto";
import { assertCanMutatePipelineRow } from "./organizationAccess";
import { recordClientVaultUpload } from "./documentVaultActivity";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";
import {
  loadLinkByTokenHash,
  registerTaskUploadPortalLink,
} from "./clientPortalLinks";
import { assertLinkAccessAllowed } from "./portalAccessVerification";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function titleFromVaultFileName(fileName: string): string {
  const base = fileName.replace(/[/\\]/g, "").trim() || "Document";
  const withoutExt = base.replace(/\.[^.]+$/, "").trim();
  return withoutExt || base;
}

function portalOrigin(): string {
  return (
    process.env.CLIENT_PORTAL_ORIGIN?.trim() || "http://127.0.0.1:3004"
  ).replace(/\/$/, "");
}

function safeFileName(name: string): string {
  return name.replace(/[/\\]/g, "").trim().slice(0, 255) || "document";
}

async function loadTokenByPlain(
  ctx: MutationCtx,
  plainToken: string,
): Promise<
  | { ok: true; row: Doc<"documentVaultFileTaskUploadTokens"> }
  | { ok: false; reason: "invalid" | "revoked" | "expired" }
> {
  const trimmed = normalizePortalToken(plainToken);
  if (!trimmed || trimmed.length > 128) {
    return { ok: false, reason: "invalid" };
  }
  const tokenHash = await sha256Hex(trimmed);
  const registry = await loadLinkByTokenHash(ctx, tokenHash);
  if (!registry) {
    return { ok: false, reason: "invalid" };
  }
  if (registry.status === "revoked") {
    return { ok: false, reason: "revoked" };
  }
  if (registry.expiresAt < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  const row = await ctx.db
    .query("documentVaultFileTaskUploadTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!row || row.status !== "active") {
    return { ok: false, reason: row?.status === "revoked" ? "revoked" : "invalid" };
  }
  if (row.expiresAt < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  const task = await ctx.db.get(row.fileTaskId);
  if (!task || task.isArchived) return { ok: false, reason: "revoked" };
  if (task.status === "complete") return { ok: false, reason: "revoked" };
  return { ok: true, row };
}

export const getPortalByToken = query({
  args: {
    token: v.string(),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { token, accessProof }) => {
    const trimmed = normalizePortalToken(token);
    if (!trimmed) return { status: "not_found" as const };
    const tokenHash = await sha256Hex(trimmed);
    const registry = await loadLinkByTokenHash(ctx, tokenHash);
    if (!registry) return { status: "not_found" as const };
    if (registry.status === "revoked") return { status: "revoked" as const };
    if (registry.expiresAt < Date.now()) return { status: "expired" as const };

    const gate = await assertLinkAccessAllowed(ctx, registry, accessProof);
    if (!gate.ok) {
      return {
        status: "verification_required" as const,
        verificationType: gate.verificationType,
      };
    }

    const row = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!row || row.status !== "active") {
      return { status: row?.status === "revoked" ? "revoked" as const : "not_found" as const };
    }
    if (row.expiresAt < Date.now()) {
      return { status: "expired" as const };
    }
    const task = await ctx.db.get(row.fileTaskId);
    if (!task || task.isArchived) return { status: "not_found" as const };
    const pipeline = await ctx.db.get(task.pipelineFileId);
    if (!pipeline) return { status: "not_found" as const };

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const workspaceName =
      org?.name?.trim() && org.name.trim().length > 0
        ? org.name.trim()
        : "Your lender";

    const fileLabel =
      pipeline.fileName?.trim() ||
      pipeline.propertyAddress?.trim() ||
      "Loan file";

    const clientTemplates: Array<{
      fileName: string;
      mimeType: string;
      size: number;
      url: string;
    }> = [];
    for (const att of task.clientTemplateAttachments ?? []) {
      const url = await ctx.storage.getUrl(att.storageId);
      if (!url) continue;
      clientTemplates.push({
        fileName: att.fileName,
        mimeType: att.mimeType,
        size: att.size,
        url,
      });
    }

    return {
      status: "ok" as const,
      taskTitle: task.title,
      isRequired: task.isRequired,
      fileLabel,
      workspaceName,
      pipelineFileId: task.pipelineFileId,
      fileTaskId: task._id,
      clientTemplates:
        clientTemplates.length > 0 ? clientTemplates : undefined,
    };
  },
});

export const issueUploadToken = mutation({
  args: {
    fileTaskId: v.id("documentVaultFileTasks"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { fileTaskId, memberUserKey }) => {
    const task = await ctx.db.get(fileTaskId);
    if (!task) throw new Error("File task not found.");
    const pipeline = await ctx.db.get(task.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const existing = await ctx.db
      .query("documentVaultFileTaskUploadTokens")
      .withIndex("by_fileTask", (q) => q.eq("fileTaskId", fileTaskId))
      .collect();
    const now = Date.now();
    for (const row of existing) {
      if (row.status === "active") {
        await ctx.db.patch(row._id, { status: "revoked" });
      }
    }

    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const expiresAt = now + TOKEN_TTL_MS;
    const key = memberUserKey?.trim() || "__system__";

    const uploadId = await ctx.db.insert("documentVaultFileTaskUploadTokens", {
      fileTaskId,
      pipelineFileId: task.pipelineFileId,
      tokenHash,
      status: "active",
      createdByUserKey: key,
      createdAt: now,
      expiresAt,
      uploadCount: 0,
    });

    const uploadUrl = `${portalOrigin()}/upload/${encodeURIComponent(plainToken)}`;

    await registerTaskUploadPortalLink(ctx, {
      pipelineFileId: task.pipelineFileId,
      organizationId: pipeline.organizationId,
      fileTaskUploadTokenId: uploadId,
      fileTaskId,
      tokenHash,
      title: `Task Upload: ${task.title}`,
      expiresAt,
      createdByUserKey: key,
      createdAt: now,
      issuedUrl: uploadUrl,
    });

    return {
      ok: true as const,
      uploadUrl,
      expiresAt,
    };
  },
});

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const auth = await loadTokenByPlain(ctx, token);
    if (!auth.ok) {
      throw new Error(
        auth.reason === "expired"
          ? "This upload link has expired."
          : "This upload link is invalid.",
      );
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const ingestUpload = mutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await loadTokenByPlain(ctx, args.token);
    if (!auth.ok) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* best effort */
      }
      throw new Error(
        auth.reason === "expired"
          ? "This upload link has expired."
          : "This upload link is invalid.",
      );
    }

    const tokenRow = auth.row;
    const task = await ctx.db.get(tokenRow.fileTaskId);
    if (!task) throw new Error("File task not found.");
    const pipeline = await ctx.db.get(task.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");

    const byteSize = args.size ?? 0;
    if (typeof byteSize === "number" && byteSize > MAX_UPLOAD_BYTES) {
      try {
        await ctx.storage.delete(args.storageId);
      } catch {
        /* best effort */
      }
      throw new Error("File is too large (max 25 MB).");
    }

    const meta = await ctx.storage.getMetadata(args.storageId);
    if (!meta) {
      throw new Error("Upload not found. Try again.");
    }

    const safeName = safeFileName(args.fileName);
    const now = Date.now();
    const title = titleFromVaultFileName(safeName);

    const docId = await ctx.db.insert("libraryDocuments", {
      organizationId: pipeline.organizationId,
      title,
      createdByUserKey: "__file_task_upload__",
      latestVersionNumber: 0,
      createdAt: now,
      updatedAt: now,
    });

    const linkId = await ctx.db.insert("libraryDocumentLinks", {
      documentId: docId,
      pipelineFileId: task.pipelineFileId,
      fileTaskId: task._id,
      isSharedWithClient: task.isPortalVisible,
      linkedAt: now,
      linkedByUserKey: "__file_task_upload__",
    });

    const versionId = await ctx.db.insert("libraryDocumentVersions", {
      documentId: docId,
      version: 1,
      storageId: args.storageId,
      fileName: safeName,
      contentType: args.contentType || meta.contentType || undefined,
      size: args.size ?? meta.size,
      uploadedByUserKey: "__file_task_upload__",
      uploadedAt: now,
    });

    await ctx.db.patch(docId, {
      latestVersionNumber: 1,
      latestVersionId: versionId,
      latestFileName: safeName,
      latestContentType: args.contentType || meta.contentType || undefined,
      latestSize: args.size ?? meta.size,
      latestUploadedAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(tokenRow._id, {
      lastUsedAt: now,
      uploadCount: (tokenRow.uploadCount ?? 0) + 1,
    });

    if (task.status === "incomplete") {
      await ctx.db.patch(task._id, {
        status: "pending_review",
        updatedAt: now,
      });
    }

    await recordClientVaultUpload(ctx, {
      pipeline,
      task,
      fileName: safeName,
      documentId: docId,
    });

    await scheduleWebhookQueueEvent(ctx, {
      organizationId: pipeline.organizationId,
      event: "client_document_uploaded",
      data: {
        ...webhookVaultContext(pipeline._id, pipelineDealName(pipeline)),
        folderName: "Root",
        fileName: safeName,
        fileTaskId: String(task._id),
        documentId: String(docId),
      },
    });

    return {
      ok: true as const,
      documentId: docId,
      linkId,
      title,
    };
  },
});
