import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { randomHex, normalizePortalToken, sha256Hex } from "./clientPortalCrypto";
import { assertCanMutatePipelineRow } from "./organizationAccess";
import {
  loadLinkByTokenHash,
  registerLenderPortalLink,
  resolveCompanySlugForPipeline,
} from "./clientPortalLinks";
import { buildClientPortalUrl } from "../lib/clientPortalUrl";
import { assertLinkAccessAllowed } from "./portalAccessVerification";
import {
  normalizeAssignedBlockEntriesFromDoc,
  resolveTaskTypeFromDoc,
} from "./documentVaultTaskTypes";
import { isClientPortalAssignableBlock } from "../lib/documentVaultClientBlocks";
import { embeddedDealPayloadIsSubstantive } from "../lib/file/embeddedDealPresence";
import { pickIntakeShapedPreviewPayload } from "../lib/pipeline/pickIntakeShapedPreviewPayload";
import {
  isAtomicPortalBlockId,
  isClientEditableAtomicBlock,
} from "../lib/atomicPortalBlockRegistry";
import { recordLenderDeliveryAccess } from "./documentVaultActivity";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const EXPIRY_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function portalOrigin(): string {
  return (
    process.env.CLIENT_PORTAL_ORIGIN?.trim() || "http://127.0.0.1:3004"
  ).replace(/\/$/, "");
}

async function resolveIncludedDocuments(
  ctx: QueryCtx,
  pipelineFileId: Id<"pipeline">,
  documentIds: Id<"libraryDocuments">[],
  folderIds: Id<"documentFolders">[],
  fileTaskIds: Id<"documentVaultFileTasks">[],
): Promise<Id<"libraryDocuments">[]> {
  const out = new Set<string>();
  for (const docId of documentIds) {
    out.add(String(docId));
  }

  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", pipelineFileId),
    )
    .collect();

  const folderSet = new Set(folderIds.map(String));
  const taskSet = new Set(fileTaskIds.map(String));

  for (const link of links) {
    if (link.pipelineFileId !== pipelineFileId) continue;
    const inFolder =
      link.folderId != null && folderSet.has(String(link.folderId));
    const inTask =
      link.fileTaskId != null && taskSet.has(String(link.fileTaskId));
    if (inFolder || inTask) {
      out.add(String(link.documentId));
    }
  }

  return [...out].map((id) => id as Id<"libraryDocuments">);
}

async function authorizeDeliveryToken(
  ctx: QueryCtx,
  token: string,
): Promise<
  | { ok: false; reason: "invalid" | "revoked" | "expired" }
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof loadDeliveryRow>>> }
> {
  const trimmed = normalizePortalToken(token);
  if (!trimmed) return { ok: false, reason: "invalid" };
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
  const row = await loadDeliveryRow(ctx, tokenHash);
  if (!row || row.status !== "active") {
    return {
      ok: false,
      reason: row?.status === "revoked" ? "revoked" : "invalid",
    };
  }
  if (row.expiresAt < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, row };
}

async function loadDeliveryRow(ctx: QueryCtx, tokenHash: string) {
  return await ctx.db
    .query("lenderDeliveryTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
}

function collectFolderSubtreeIds(
  folders: { _id: Id<"documentFolders">; parentFolderId?: Id<"documentFolders"> }[],
  rootFolderId: Id<"documentFolders">,
): Set<string> {
  const out = new Set<string>([String(rootFolderId)]);
  const queue: Id<"documentFolders">[] = [rootFolderId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const f of folders) {
      if (f.parentFolderId === id) {
        const key = String(f._id);
        if (!out.has(key)) {
          out.add(key);
          queue.push(f._id);
        }
      }
    }
  }
  return out;
}

async function authorizeDeliveryTask(
  ctx: QueryCtx,
  token: string,
  fileTaskId: Id<"documentVaultFileTasks">,
): Promise<
  | { ok: false; reason: "invalid" | "revoked" | "expired" | "unauthorized" }
  | {
      ok: true;
      row: NonNullable<Awaited<ReturnType<typeof loadDeliveryRow>>>;
      task: Doc<"documentVaultFileTasks">;
      pipeline: Doc<"pipeline">;
    }
> {
  const auth = await authorizeDeliveryToken(ctx, token);
  if (!auth.ok) return { ok: false, reason: auth.reason };
  if (
    !auth.row.includedFileTaskIds.some((id) => String(id) === String(fileTaskId))
  ) {
    return { ok: false, reason: "unauthorized" };
  }
  const task = await ctx.db.get(fileTaskId);
  if (!task || task.isArchived) return { ok: false, reason: "unauthorized" };
  const pipeline = await ctx.db.get(auth.row.pipelineFileId);
  if (!pipeline) return { ok: false, reason: "invalid" };
  return { ok: true, row: auth.row, task, pipeline };
}

export const getDeliveryByToken = query({
  args: {
    token: v.string(),
    accessProof: v.optional(v.string()),
  },
  handler: async (ctx, { token, accessProof }) => {
    const auth = await authorizeDeliveryToken(ctx, token);
    if (!auth.ok) {
      return { status: auth.reason } as const;
    }
    const trimmed = normalizePortalToken(token);
    const tokenHash = await sha256Hex(trimmed);
    const registry = await loadLinkByTokenHash(ctx, tokenHash);
    if (registry) {
      const gate = await assertLinkAccessAllowed(ctx, registry, accessProof);
      if (!gate.ok) {
        return {
          status: "verification_required" as const,
          verificationType: gate.verificationType,
        };
      }
    }
    const row = auth.row;

    const lender = await ctx.db.get(row.lenderId);
    const pipeline = await ctx.db.get(row.pipelineFileId);
    if (!lender || !pipeline) return { status: "not_found" as const };

    const allFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_pipeline", (q) => q.eq("pipelineFileId", row.pipelineFileId))
      .collect();

    const includedFolderSubtree = new Set<string>();
    for (const folderId of row.includedFolderIds) {
      for (const id of collectFolderSubtreeIds(allFolders, folderId)) {
        includedFolderSubtree.add(id);
      }
    }
    for (const taskId of row.includedFileTaskIds) {
      const taskRoots = allFolders.filter((f) => f.fileTaskId === taskId);
      for (const root of taskRoots) {
        for (const id of collectFolderSubtreeIds(allFolders, root._id)) {
          includedFolderSubtree.add(id);
        }
      }
    }

    const folders = allFolders
      .filter((f) => includedFolderSubtree.has(String(f._id)))
      .map((f) => ({
        _id: f._id,
        name: f.name,
        parentFolderId: f.parentFolderId,
        fileTaskId: f.fileTaskId,
        sortOrder: f.sortOrder,
      }));

    const documents: {
      documentId: Id<"libraryDocuments">;
      versionId?: Id<"libraryDocumentVersions">;
      title: string;
      fileName?: string;
      contentType?: string;
      size?: number;
      url?: string;
      folderId?: Id<"documentFolders">;
      fileTaskId?: Id<"documentVaultFileTasks">;
    }[] = [];

    const resolvedDocIds = await resolveIncludedDocuments(
      ctx,
      row.pipelineFileId,
      row.includedDocumentIds,
      row.includedFolderIds,
      row.includedFileTaskIds,
    );

    for (const docId of resolvedDocIds) {
      const doc = await ctx.db.get(docId);
      if (!doc) continue;
      const link = await ctx.db
        .query("libraryDocumentLinks")
        .withIndex("by_document", (q) => q.eq("documentId", docId))
        .filter((q) => q.eq(q.field("pipelineFileId"), row.pipelineFileId))
        .first();
      let url: string | undefined;
      if (doc.latestVersionId) {
        const ver = await ctx.db.get(doc.latestVersionId);
        if (ver) {
          url = (await ctx.storage.getUrl(ver.storageId)) ?? undefined;
        }
      }
      documents.push({
        documentId: doc._id,
        versionId: doc.latestVersionId,
        title: doc.title,
        fileName: doc.latestFileName,
        contentType: doc.latestContentType,
        size: doc.latestSize,
        url,
        folderId: link?.folderId,
        fileTaskId: link?.fileTaskId,
      });
    }

    const fileTasks: {
      fileTaskId: Id<"documentVaultFileTasks">;
      title: string;
      taskType: ReturnType<typeof resolveTaskTypeFromDoc>;
      assignedBlocks: string[];
    }[] = [];

    for (const taskId of row.includedFileTaskIds) {
      const task = await ctx.db.get(taskId);
      if (!task || task.isArchived) continue;
      const taskType = resolveTaskTypeFromDoc(task);
      const entries = normalizeAssignedBlockEntriesFromDoc(task);
      const blockIds = entries
        .map((e) => e.blockId)
        .filter((id) => isClientPortalAssignableBlock(id));
      if (blockIds.length === 0 && taskType !== "block_assignment") continue;
      fileTasks.push({
        fileTaskId: task._id,
        title: task.title,
        taskType,
        assignedBlocks: blockIds,
      });
    }

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;

    return {
      status: "ok" as const,
      permission: row.permission,
      pipelineFileId: row.pipelineFileId,
      lenderName: lender.company?.trim() || "Lender",
      fileLabel:
        pipeline.fileName?.trim() ||
        pipeline.propertyAddress?.trim() ||
        "Loan file",
      workspaceName:
        org?.name?.trim() && org.name.trim().length > 0
          ? org.name.trim()
          : "Direct Lending Connection",
      registryLinkId: registry?._id,
      companySlug: registry?.companySlug,
      documents,
      folders,
      fileTasks,
      expiresAt: row.expiresAt,
    };
  },
});

/** Token-authorized deal sheet for lender data room read-only blocks. */
export const getLenderDeliveryDealSheet = query({
  args: {
    token: v.string(),
    fileTaskId: v.id("documentVaultFileTasks"),
  },
  handler: async (ctx, { token, fileTaskId }) => {
    const auth = await authorizeDeliveryTask(ctx, token, fileTaskId);
    if (!auth.ok) {
      return { status: auth.reason } as const;
    }
    const { task, pipeline } = auth;

    const linked =
      pipeline.intakeSheetId != null
        ? await ctx.db.get(pipeline.intakeSheetId)
        : null;
    const embedded = embeddedDealPayloadIsSubstantive(pipeline.dealData)
      ? (pipeline.dealData as Doc<"intakeSheets">)
      : null;
    const sheet = pickIntakeShapedPreviewPayload(
      embedded,
      linked,
      pipeline.updatedAt,
    );

    const assigned = normalizeAssignedBlockEntriesFromDoc(task);
    const blockEditable: Record<string, boolean> = {};
    for (const entry of assigned) {
      if (isAtomicPortalBlockId(entry.blockId)) {
        blockEditable[entry.blockId] = isClientEditableAtomicBlock(entry.blockId);
      }
    }

    const needsConstruction = assigned.some(
      (e) => e.blockId === "construction_budget",
    );
    const constructionBudgetLines = needsConstruction
      ? await ctx.db
          .query("constructionBudgetLines")
          .withIndex("by_file_sort", (q) => q.eq("fileId", pipeline._id))
          .collect()
      : [];

    return {
      status: "ok" as const,
      pipelineFileId: pipeline._id,
      organizationId: pipeline.organizationId,
      pipelineUpdatedAt: pipeline.updatedAt,
      sheet,
      assignedBlockIds: assigned.map((e) => e.blockId),
      blockEditable,
      constructionBudgetLines,
    };
  },
});

export const getDeliveryDocumentUrl = query({
  args: {
    token: v.string(),
    documentId: v.id("libraryDocuments"),
  },
  handler: async (ctx, { token, documentId }) => {
    const auth = await authorizeDeliveryToken(ctx, token);
    if (!auth.ok) {
      return { status: auth.reason } as const;
    }
    const row = auth.row;
    const allowed = await resolveIncludedDocuments(
      ctx,
      row.pipelineFileId,
      row.includedDocumentIds,
      row.includedFolderIds,
      row.includedFileTaskIds,
    );
    if (!allowed.some((id) => String(id) === String(documentId))) {
      return { status: "not_found" as const };
    }

    const doc = await ctx.db.get(documentId);
    if (!doc?.latestVersionId) return { status: "not_found" as const };
    const ver = await ctx.db.get(doc.latestVersionId);
    if (!ver) return { status: "not_found" as const };

    const url = await ctx.storage.getUrl(ver.storageId);
    if (!url) return { status: "not_found" as const };

    return {
      status: "ok" as const,
      url,
      permission: row.permission,
      fileName: ver.fileName,
      contentType: ver.contentType,
    };
  },
});

export const issueDeliveryToken = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    expiryPreset: v.union(
      v.literal("24h"),
      v.literal("3d"),
      v.literal("7d"),
    ),
    permission: v.union(v.literal("view_only"), v.literal("downloadable")),
    includedDocumentIds: v.array(v.id("libraryDocuments")),
    includedFolderIds: v.array(v.id("documentFolders")),
    includedFileTaskIds: v.array(v.id("documentVaultFileTasks")),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const lender = await ctx.db.get(args.lenderId);
    if (!lender) throw new Error("Lender not found.");

    const resolvedDocIds = await resolveIncludedDocuments(
      ctx,
      args.pipelineFileId,
      args.includedDocumentIds,
      args.includedFolderIds,
      args.includedFileTaskIds,
    );

    if (resolvedDocIds.length === 0) {
      throw new Error("Select at least one document, folder, or file task with content.");
    }

    const now = Date.now();
    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const key = args.memberUserKey?.trim() || "__system__";
    const expiresAt = now + (EXPIRY_MS[args.expiryPreset] ?? EXPIRY_MS["7d"]!);

    const companySlug = await resolveCompanySlugForPipeline(ctx, pipeline);

    const deliveryId = await ctx.db.insert("lenderDeliveryTokens", {
      pipelineFileId: args.pipelineFileId,
      lenderId: args.lenderId,
      tokenHash,
      status: "active",
      permission: args.permission,
      includedDocumentIds: resolvedDocIds,
      includedFolderIds: args.includedFolderIds,
      includedFileTaskIds: args.includedFileTaskIds,
      expiresAt,
      createdByUserKey: key,
      createdAt: now,
    });

    await registerLenderPortalLink(ctx, {
      pipelineFileId: args.pipelineFileId,
      organizationId: pipeline.organizationId,
      lenderDeliveryTokenId: deliveryId,
      lenderId: args.lenderId,
      targetName: lender.company?.trim() || "Lender",
      companySlug,
      tokenHash,
      expiresAt,
      createdByUserKey: key,
      createdAt: now,
      issuedUrl: buildClientPortalUrl(companySlug, plainToken),
    });

    const deliveryUrl = buildClientPortalUrl(companySlug, plainToken);
    return {
      ok: true as const,
      token: plainToken,
      deliveryUrl,
      companySlug,
      documentCount: resolvedDocIds.length,
      expiresAt,
    };
  },
});

export const sendDeliveryToLender = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    lenderId: v.id("lenders"),
    deliveryUrl: v.string(),
    expiryPreset: v.union(
      v.literal("24h"),
      v.literal("3d"),
      v.literal("7d"),
    ),
    permission: v.union(v.literal("view_only"), v.literal("downloadable")),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const pipeline = await ctx.db.get(args.pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, args.memberUserKey);

    const lender = await ctx.db.get(args.lenderId);
    if (!lender) throw new Error("Lender not found.");

    const to = (lender.email ?? "").trim();
    if (!to) {
      throw new Error(
        "This lender has no email on file. Add an email in the Global Registry first.",
      );
    }

    const org = pipeline.organizationId
      ? await ctx.db.get(pipeline.organizationId)
      : null;
    const workspaceLabel =
      org?.name?.trim() && org.name.trim().length > 0
        ? org.name.trim()
        : "Direct Lending Connection";

    const fileLabel =
      pipeline.fileName?.trim() ||
      pipeline.propertyAddress?.trim() ||
      "Loan file";

    const expiryLabels: Record<string, string> = {
      "24h": "24 hours",
      "3d": "3 days",
      "7d": "7 days",
    };
    const permissionLabel =
      args.permission === "downloadable"
        ? "View and download documents"
        : "View only (no downloads)";

    await ctx.scheduler.runAfter(
      0,
      internal.clientPortalEmails.deliverLenderDeliveryInvite,
      {
        to,
        deliveryUrl: args.deliveryUrl.trim(),
        lenderName: lender.company?.trim() || "Lender",
        fileLabel,
        workspaceLabel,
        linkExpiresDescription:
          expiryLabels[args.expiryPreset] ?? expiryLabels["7d"]!,
        permissionLabel,
      },
    );

    return { ok: true as const, sentTo: to };
  },
});

/** Immutable audit log when a lender opens the secure data room (portal load). */
export const recordDeliveryPortalAccess = mutation({
  args: {
    token: v.string(),
    clientIp: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { token, clientIp, userAgent }) => {
    const auth = await authorizeDeliveryToken(ctx, token);
    if (!auth.ok) return { ok: false as const, reason: auth.reason };
    const row = auth.row;
    const pipeline = await ctx.db.get(row.pipelineFileId);
    const lender = await ctx.db.get(row.lenderId);
    if (!pipeline || !lender) return { ok: false as const, reason: "not_found" };
    await recordLenderDeliveryAccess(ctx, {
      pipeline,
      lenderId: lender._id,
      lenderName: lender.company?.trim() || lender.contactName?.trim() || "Lender",
      clientIp,
      userAgent,
    });
    await scheduleWebhookQueueEvent(ctx, {
      organizationId: pipeline.organizationId,
      event: "lender_portal_accessed",
      data: {
        lenderName: lender.company?.trim() || lender.contactName?.trim() || "Lender",
        ipAddress: clientIp?.trim(),
        ...webhookVaultContext(pipeline._id, pipelineDealName(pipeline)),
        lenderId: String(lender._id),
      },
    });
    return { ok: true as const };
  },
});
