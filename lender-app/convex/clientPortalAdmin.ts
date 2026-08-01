import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  assertCanMutatePipelineRow,
  assertCanMutateContactRow,
  resolveOrgPipelineFileAccessLevel,
} from "./organizationAccess";
import {
  normalizePortalEmailKey,
  randomHex,
  sha256Hex,
} from "./clientPortalCrypto";
import { appendPortalAudit } from "./clientPortalAudit";
import { sealOptionalPortalPlaintext } from "./portalFieldCrypto";
import {
  invalidateSessionsForGrant,
  isGrantUsable,
  resolvePortalGrantContactId,
} from "./clientPortalShared";
import {
  loadLinkByGrantId,
  registerPortalGrantLink,
} from "./clientPortalLinks";
import { libraryDocumentCategoryV } from "./contactStickyData/validators";

const memberKeyArg = {
  memberUserKey: v.optional(v.string()),
};

const portalPermissionV = v.union(
  v.literal("view"),
  v.literal("view_upload"),
);

const linkExpiresPresetV = v.union(
  v.literal("1h"),
  v.literal("24h"),
  v.literal("7d"),
  v.literal("30d"),
);

const grantExpiresPresetV = v.union(
  v.literal("never"),
  v.literal("30d"),
  v.literal("90d"),
);

function linkExpiresMs(preset: "1h" | "24h" | "7d" | "30d"): number {
  const m = {
    "1h": 3600000,
    "24h": 86400000,
    "7d": 604800000,
    "30d": 2592000000,
  };
  return m[preset];
}

export function linkExpiryDescription(
  preset: "1h" | "24h" | "7d" | "30d",
): string {
  const d: Record<string, string> = {
    "1h": "1 hour",
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
  };
  return d[preset] ?? preset;
}

function grantExpiresAtFrom(
  now: number,
  preset: "never" | "30d" | "90d",
): number | undefined {
  if (preset === "never") return undefined;
  if (preset === "30d") return now + 30 * 86400000;
  return now + 90 * 86400000;
}

function orgScopeFromPipelineRow(row: Doc<"pipeline">): string {
  return row.organizationId ? String(row.organizationId) : "none";
}

async function workspaceLabelFromScope(
  ctx: MutationCtx,
  orgScope: string,
): Promise<string> {
  if (orgScope === "none") return "Loan Flow Engine";
  const org = await ctx.db.get(orgScope as Id<"organizations">);
  return org?.name?.trim() || "Your loan team";
}

async function ensureActiveGrant(
  ctx: MutationCtx,
  args: {
    pipeline: Doc<"pipeline">;
    emailKey: string;
    orgScope: string;
    invitedByUserKey: string;
    label?: string;
    permission: "view" | "view_upload";
    grantExpiresAt?: number;
  },
): Promise<Id<"clientPortalGrants">> {
  const existing = await ctx.db
    .query("clientPortalGrants")
    .withIndex("by_email_file", (q) =>
      q.eq("emailKey", args.emailKey).eq("pipelineFileId", args.pipeline._id),
    )
    .first();
  const now = Date.now();
  if (existing) {
    if (existing.status === "revoked") {
      await ctx.db.patch(existing._id, {
        status: "active",
        orgScope: args.orgScope,
        invitedByUserKey: args.invitedByUserKey,
        label: args.label,
        permission: args.permission,
        grantExpiresAt: args.grantExpiresAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        label: args.label ?? existing.label,
        permission: args.permission,
        grantExpiresAt: args.grantExpiresAt,
        updatedAt: now,
      });
    }
    return existing._id;
  }
  return await ctx.db.insert("clientPortalGrants", {
    orgScope: args.orgScope,
    emailKey: args.emailKey,
    pipelineFileId: args.pipeline._id,
    status: "active",
    invitedByUserKey: args.invitedByUserKey,
    label: args.label,
    permission: args.permission,
    grantExpiresAt: args.grantExpiresAt,
    createdAt: now,
    updatedAt: now,
  });
}

export const inviteClient = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    clientEmail: v.string(),
    label: v.optional(v.string()),
    sendEmail: v.optional(v.boolean()),
    permission: v.optional(portalPermissionV),
    linkExpires: v.optional(linkExpiresPresetV),
    grantExpires: v.optional(grantExpiresPresetV),
    ...memberKeyArg,
  },
  handler: async (
    ctx,
    {
      pipelineFileId,
      clientEmail,
      label,
      sendEmail = true,
      permission = "view_upload",
      linkExpires = "24h",
      grantExpires = "never",
      memberUserKey,
    },
  ) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const emailKey = normalizePortalEmailKey(clientEmail);
    if (!emailKey.includes("@")) {
      throw new Error("Enter a valid client email.");
    }
    const inviter = memberUserKey?.trim() || "__system__";
    const orgScope = orgScopeFromPipelineRow(pipeline);
    const now = Date.now();
    const grantExp = grantExpiresAtFrom(now, grantExpires);
    const grantId = await ensureActiveGrant(ctx, {
      pipeline,
      emailKey,
      orgScope,
      invitedByUserKey: inviter,
      label,
      permission,
      grantExpiresAt: grantExp,
    });

    // Phase Modular-E — consume the loan-strategy template checklist queued at
    // file creation: create the document requests on the fresh grant, then
    // clear the queue so later invites don't re-apply it.
    const pendingChecklist = pipeline.pendingPortalChecklist ?? [];
    if (pendingChecklist.length > 0) {
      const grant = await ctx.db.get(grantId);
      if (grant) {
        await createChecklistRequestsForGrant(ctx, {
          grant,
          checklistName: "Loan template checklist",
          items: pendingChecklist,
          poster: inviter,
        });
        await ctx.db.patch(pipelineFileId, {
          pendingPortalChecklist: undefined,
          updatedAt: Date.now(),
        });
      }
    }

    const plainToken = randomHex(24);
    const tokenHash = await sha256Hex(plainToken);
    const linkExpAt = now + linkExpiresMs(linkExpires);
    await ctx.db.insert("clientPortalMagicLinks", {
      tokenHash,
      orgScope,
      emailKey,
      grantIds: [grantId],
      expiresAt: linkExpAt,
      createdAt: now,
    });

    const origin = (
      process.env.CLIENT_PORTAL_ORIGIN?.trim() || "http://127.0.0.1:3004"
    ).replace(/\/$/, "");
    const signInUrl = `${origin}/portal/magic?t=${encodeURIComponent(plainToken)}`;
    const linkHuman = linkExpiryDescription(linkExpires);

    await appendPortalAudit(ctx, {
      orgScope,
      kind: "broker_invite_sent",
      actorType: "broker",
      actorKey: inviter,
      detail: `email=${emailKey}; permission=${permission}; link=${linkExpires}; grant=${grantExpires}`,
      pipelineFileId,
      grantId,
    });

    if (sendEmail) {
      const workspaceLabel = await workspaceLabelFromScope(ctx, orgScope);
      await ctx.scheduler.runAfter(0, internal.clientPortalEmails.deliverMagicLink, {
        to: clientEmail.trim(),
        plainToken,
        workspaceLabel,
        linkExpiresDescription: linkHuman,
        permissionLabel:
          permission === "view" ? "View only" : "View and upload documents",
      });
    }

    const existingLink = await loadLinkByGrantId(ctx, grantId);
    if (!existingLink) {
      const grant = await ctx.db.get(grantId);
      if (grant) {
        await registerPortalGrantLink(ctx, {
          pipelineFileId,
          organizationId: pipeline.organizationId,
          grantId,
          emailKey,
          title: label?.trim()
            ? `Portal grant: ${label.trim()}`
            : `Portal grant: ${emailKey}`,
          targetName: emailKey,
          expiresAt: grantExp ?? now + 10 * 365 * 24 * 60 * 60 * 1000,
          createdByUserKey: inviter,
          createdAt: grant.createdAt,
        });
      }
    }

    return {
      grantId,
      signInUrl,
      emailDispatched: Boolean(sendEmail),
      orgScope,
      linkExpiresAt: linkExpAt,
      permission,
    };
  },
});

export const revokeGrant = mutation({
  args: {
    grantId: v.id("clientPortalGrants"),
    ...memberKeyArg,
  },
  handler: async (ctx, { grantId, memberUserKey }) => {
    const grant = await ctx.db.get(grantId);
    if (!grant) return { ok: false as const };
    const pipeline = await ctx.db.get(grant.pipelineFileId);
    const inviter = memberUserKey?.trim() || "__system__";

    if (!pipeline) {
      await invalidateSessionsForGrant(ctx, grantId);
      await ctx.db.patch(grantId, { status: "revoked", updatedAt: Date.now() });
      await appendPortalAudit(ctx, {
        orgScope: grant.orgScope,
        kind: "broker_grant_revoked",
        actorType: "broker",
        actorKey: inviter,
        detail: "pipeline row missing",
        pipelineFileId: grant.pipelineFileId,
        grantId,
      });
      return { ok: true as const };
    }
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    await invalidateSessionsForGrant(ctx, grantId);
    await ctx.db.patch(grantId, { status: "revoked", updatedAt: Date.now() });
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "broker_grant_revoked",
      actorType: "broker",
      actorKey: inviter,
      pipelineFileId: grant.pipelineFileId,
      grantId,
    });
    return { ok: true as const };
  },
});

export const listAccessForFile = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) return [];
    const level = await resolveOrgPipelineFileAccessLevel(
      ctx,
      pipeline,
      memberUserKey,
    );
    if (level !== "edit") return [];
    const rows = await ctx.db
      .query("clientPortalGrants")
      .withIndex("by_file", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();
    return rows
      .filter((r) => r.status === "active")
      .map((r) => ({
        _id: r._id,
        emailKey: r.emailKey,
        label: r.label,
        permission: r.permission ?? ("view_upload" as const),
        grantExpiresAt: r.grantExpiresAt,
        createdAt: r.createdAt,
      }));
  },
});

export const listAuditForFile = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    limit: v.optional(v.number()),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey, limit }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) return [];
    const level = await resolveOrgPipelineFileAccessLevel(
      ctx,
      pipeline,
      memberUserKey,
    );
    if (level !== "edit") return [];
    const cap = Math.min(Math.max(1, limit ?? 100), 250);
    const rows = await ctx.db
      .query("clientPortalAudit")
      .withIndex("by_file_at", (q) => q.eq("pipelineFileId", pipelineFileId))
      .order("desc")
      .take(cap);
    return rows.map((r) => ({
      _id: r._id,
      at: r.at,
      kind: r.kind,
      actorType: r.actorType,
      actorKey: r.actorKey,
      detail: r.detail,
      grantId: r.grantId,
    }));
  },
});

export const postClientUpdate = mutation({
  args: {
    grantId: v.id("clientPortalGrants"),
    summary: v.string(),
    detail: v.optional(v.string()),
    ...memberKeyArg,
  },
  handler: async (ctx, { grantId, summary, detail, memberUserKey }) => {
    const grant = await ctx.db.get(grantId);
    if (!grant || !isGrantUsable(grant)) {
      throw new Error("Grant not found or access expired.");
    }
    const pipeline = await ctx.db.get(grant.pipelineFileId);
    if (!pipeline) throw new Error("File not found");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    const poster = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    await ctx.db.insert("clientPortalUpdates", {
      grantId,
      pipelineFileId: grant.pipelineFileId,
      summary: summary.trim().slice(0, 400),
      detail: detail?.trim().slice(0, 4000) || undefined,
      createdByUserKey: poster,
      createdAt: now,
    });
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "broker_posted_update",
      actorType: "broker",
      actorKey: poster,
      detail: summary.trim().slice(0, 200),
      pipelineFileId: grant.pipelineFileId,
      grantId,
    });
    return { ok: true as const };
  },
});

export const createClientRequest = mutation({
  args: {
    grantId: v.id("clientPortalGrants"),
    title: v.string(),
    description: v.optional(v.string()),
    targetFolderId: v.optional(v.id("documentFolders")),
    ...memberKeyArg,
  },
  handler: async (ctx, { grantId, title, description, targetFolderId, memberUserKey }) => {
    const grant = await ctx.db.get(grantId);
    if (!grant || !isGrantUsable(grant)) {
      throw new Error("Grant not found or access expired.");
    }
    const pipeline = await ctx.db.get(grant.pipelineFileId);
    if (!pipeline) throw new Error("File not found");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    if (targetFolderId) {
      await assertTargetFolderOnPipelineFile(
        ctx,
        grant.pipelineFileId,
        targetFolderId,
      );
    }
    const poster = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const sealedDescription = await sealOptionalPortalPlaintext(
      description?.trim().slice(0, 4000) || undefined,
    );
    const id = await ctx.db.insert("clientPortalRequests", {
      grantId,
      pipelineFileId: grant.pipelineFileId,
      title: title.trim().slice(0, 200),
      description: sealedDescription,
      targetFolderId,
      status: "open",
      createdByUserKey: poster,
      createdAt: now,
      updatedAt: now,
      requestKind: "manual",
    });
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "broker_created_request",
      actorType: "broker",
      actorKey: poster,
      detail: title.trim().slice(0, 200),
      pipelineFileId: grant.pipelineFileId,
      grantId,
    });
    return { id };
  },
});

/**
 * Phase Modular-D — bulk-create portal document requests from a named checklist.
 *
 * Consumed manually from the portal control room now; Phase E loan-strategy
 * templates call it when a borrower is invited to the portal. Idempotent per
 * grant: items whose normalized title matches an existing open request are
 * skipped, so re-applying a checklist never duplicates requests.
 */
type PortalChecklistItemInput = {
  title: string;
  description?: string;
  folderName?: string;
};

/**
 * Shared core for checklist request creation (manual apply + template queue).
 * Idempotent per grant: items whose normalized title matches an existing open
 * request are skipped.
 */
async function createChecklistRequestsForGrant(
  ctx: MutationCtx,
  args: {
    grant: Doc<"clientPortalGrants">;
    checklistName: string;
    items: readonly PortalChecklistItemInput[];
    poster: string;
  },
): Promise<{
  createdCount: number;
  skippedCount: number;
  requestIds: Id<"clientPortalRequests">[];
}> {
  const { grant, checklistName, items, poster } = args;
  const grantId = grant._id;

  const cleanItems = items
    .map((item) => ({
      title: item.title.trim().slice(0, 200),
      description: item.description?.trim().slice(0, 4000) || undefined,
      folderName: item.folderName?.trim().slice(0, 120) || undefined,
    }))
    .filter((item) => item.title.length > 0);
  if (cleanItems.length === 0) {
    return { createdCount: 0, skippedCount: 0, requestIds: [] };
  }

  const existingRequests = await ctx.db
    .query("clientPortalRequests")
    .withIndex("by_grant", (q) => q.eq("grantId", grantId))
    .collect();
  const openTitles = new Set(
    existingRequests
      .filter((r) => r.status === "open")
      .map((r) => r.title.trim().toLowerCase()),
  );

  const fileFolders = await ctx.db
    .query("documentFolders")
    .withIndex("by_pipeline", (q) =>
      q.eq("pipelineFileId", grant.pipelineFileId),
    )
    .collect();
  const folderIdByName = new Map(
    fileFolders.map((f) => [f.name.trim().toLowerCase(), f._id] as const),
  );

  const now = Date.now();
  const requestIds: Id<"clientPortalRequests">[] = [];
  let skippedCount = 0;

  for (const item of cleanItems) {
    if (openTitles.has(item.title.toLowerCase())) {
      skippedCount += 1;
      continue;
    }
    openTitles.add(item.title.toLowerCase());

    let targetFolderId: Id<"documentFolders"> | undefined;
    if (item.folderName) {
      const folderKey = item.folderName.toLowerCase();
      const existingFolderId = folderIdByName.get(folderKey);
      if (existingFolderId) {
        targetFolderId = existingFolderId;
      } else {
        targetFolderId = await ctx.db.insert("documentFolders", {
          name: item.folderName,
          pipelineFileId: grant.pipelineFileId,
          createdAt: now,
          updatedAt: now,
        });
        folderIdByName.set(folderKey, targetFolderId);
      }
    }

    const sealedDescription = await sealOptionalPortalPlaintext(
      item.description,
    );
    const id = await ctx.db.insert("clientPortalRequests", {
      grantId,
      pipelineFileId: grant.pipelineFileId,
      title: item.title,
      description: sealedDescription,
      targetFolderId,
      status: "open",
      createdByUserKey: poster,
      createdAt: now,
      updatedAt: now,
      requestKind: "manual",
    });
    requestIds.push(id);
  }

  if (requestIds.length > 0) {
    await appendPortalAudit(ctx, {
      orgScope: grant.orgScope,
      kind: "broker_created_request",
      actorType: "broker",
      actorKey: poster,
      detail: `Checklist "${checklistName.trim().slice(0, 120)}" — ${requestIds.length} request${requestIds.length === 1 ? "" : "s"} created`,
      pipelineFileId: grant.pipelineFileId,
      grantId,
    });
  }

  return { createdCount: requestIds.length, skippedCount, requestIds };
}

export const applyRequestChecklist = mutation({
  args: {
    grantId: v.id("clientPortalGrants"),
    /** Display name for the checklist (audit trail only). */
    checklistName: v.string(),
    items: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        /** Vault subfolder for fulfilled uploads — found or created per file. */
        folderName: v.optional(v.string()),
      }),
    ),
    ...memberKeyArg,
  },
  handler: async (ctx, { grantId, checklistName, items, memberUserKey }) => {
    const grant = await ctx.db.get(grantId);
    if (!grant || !isGrantUsable(grant)) {
      throw new Error("Grant not found or access expired.");
    }
    const pipeline = await ctx.db.get(grant.pipelineFileId);
    if (!pipeline) throw new Error("File not found");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    return await createChecklistRequestsForGrant(ctx, {
      grant,
      checklistName,
      items,
      poster: memberUserKey?.trim() || "__system__",
    });
  },
});

const portalUploadReviewStatusV = v.union(
  v.literal("unreviewed"),
  v.literal("archived"),
);

export const listPortalUploadsForBroker = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    ...memberKeyArg,
  },
  handler: async (ctx, { pipelineFileId, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) return [];
    const level = await resolveOrgPipelineFileAccessLevel(
      ctx,
      pipeline,
      memberUserKey,
    );
    if (level !== "edit") return [];

    const rows = await ctx.db
      .query("clientPortalUploads")
      .withIndex("by_file_created", (q) =>
        q.eq("pipelineFileId", pipelineFileId),
      )
      .order("desc")
      .collect();

    const grantEmailCache = new Map<
      Id<"clientPortalGrants">,
      string | null
    >();

    return await Promise.all(
      rows.map(async (row) => {
        if (!grantEmailCache.has(row.grantId)) {
          const grant = await ctx.db.get(row.grantId);
          grantEmailCache.set(row.grantId, grant?.emailKey ?? null);
        }
        const clientEmail = grantEmailCache.get(row.grantId) ?? null;

        return {
          _id: row._id,
          fileName: row.fileName,
          contentType: row.contentType,
          size: row.size,
          createdAt: row.createdAt,
          reviewStatus: row.reviewStatus ?? ("unreviewed" as const),
          clientEmail: clientEmail ?? null,
          promotedLibraryDocumentId: row.promotedLibraryDocumentId ?? null,
        };
      }),
    );
  },
});

export const updatePortalUploadStatus = mutation({
  args: {
    uploadId: v.id("clientPortalUploads"),
    status: portalUploadReviewStatusV,
    ...memberKeyArg,
  },
  handler: async (ctx, { uploadId, status, memberUserKey }) => {
    const upload = await ctx.db.get(uploadId);
    if (!upload) throw new Error("Upload not found.");

    const pipeline = await ctx.db.get(upload.pipelineFileId);
    if (!pipeline) throw new Error("File not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const now = Date.now();
    await ctx.db.patch(uploadId, {
      reviewStatus: status,
      updatedAt: now,
    });

    const grant = await ctx.db.get(upload.grantId);
    await appendPortalAudit(ctx, {
      orgScope: grant?.orgScope ?? orgScopeFromPipelineRow(pipeline),
      kind:
        status === "archived"
          ? "broker_archived_portal_upload"
          : "broker_restored_portal_upload",
      actorType: "broker",
      actorKey: memberUserKey?.trim() || "__system__",
      detail: upload.fileName.slice(0, 200),
      pipelineFileId: upload.pipelineFileId,
      grantId: upload.grantId,
    });

    return { ok: true as const };
  },
});

function safePortalPromotedFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "").trim() || "document";
  return base.slice(0, 255);
}

const EVERGREEN_DOCUMENT_CATEGORIES = new Set([
  "id",
  "dd214",
  "tax_return",
]);

function isEvergreenDocumentCategory(category: string): boolean {
  return EVERGREEN_DOCUMENT_CATEGORIES.has(category);
}

async function assertTargetFolderOnPipelineFile(
  ctx: MutationCtx,
  pipelineFileId: Id<"pipeline">,
  targetFolderId: Id<"documentFolders">,
): Promise<void> {
  const folder = await ctx.db.get(targetFolderId);
  if (!folder) throw new Error("Destination folder not found.");
  if (folder.pipelineFileId !== pipelineFileId) {
    throw new Error("Destination folder belongs to a different file.");
  }
}

async function resolveTargetFolderIdForUpload(
  ctx: MutationCtx,
  upload: Doc<"clientPortalUploads">,
  pipelineFileId: Id<"pipeline">,
): Promise<Id<"documentFolders"> | undefined> {
  if (!upload.fulfilledRequestId) return undefined;
  const request = await ctx.db.get(upload.fulfilledRequestId);
  if (!request || request.pipelineFileId !== pipelineFileId) return undefined;
  if (!request.targetFolderId) return undefined;
  const folder = await ctx.db.get(request.targetFolderId);
  if (!folder || folder.pipelineFileId !== pipelineFileId) return undefined;
  return request.targetFolderId;
}

export const promotePortalUploadToLibrary = mutation({
  args: {
    uploadId: v.id("clientPortalUploads"),
    pipelineFileId: v.id("pipeline"),
    documentCategory: v.optional(libraryDocumentCategoryV),
    ...memberKeyArg,
  },
  handler: async (ctx, args) => {
    const {
      uploadId,
      pipelineFileId,
      documentCategory = "client_submitted",
      memberUserKey,
    } = args;

    const upload = await ctx.db.get(uploadId);
    if (!upload) throw new Error("Upload not found.");
    if (upload.pipelineFileId !== pipelineFileId) {
      throw new Error("Upload does not belong to this file.");
    }
    if (upload.promotedLibraryDocumentId) {
      throw new Error("This upload was already promoted to the Document Vault.");
    }

    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("File not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const meta = await ctx.storage.getMetadata(upload.storageId);
    if (!meta) {
      throw new Error("Upload blob not found in storage.");
    }

    const key = memberUserKey?.trim() || "__system__";
    const now = Date.now();
    const safeName = safePortalPromotedFileName(upload.fileName);
    const title = safeName.slice(0, 400);
    const contentType = upload.contentType || meta.contentType || undefined;
    const size = upload.size ?? meta.size;

    const documentId = await ctx.db.insert("libraryDocuments", {
      organizationId: pipeline.organizationId,
      title,
      createdByUserKey: key,
      latestVersionNumber: 1,
      createdAt: now,
      updatedAt: now,
    });

    const versionId = await ctx.db.insert("libraryDocumentVersions", {
      documentId,
      version: 1,
      storageId: upload.storageId,
      fileName: safeName,
      contentType,
      size,
      uploadedByUserKey: key,
      uploadedAt: upload.createdAt,
    });

    await ctx.db.patch(documentId, {
      latestVersionId: versionId,
      latestFileName: safeName,
      latestContentType: contentType,
      latestSize: size,
      latestUploadedAt: upload.createdAt,
      updatedAt: now,
    });

    const targetFolderId = await resolveTargetFolderIdForUpload(
      ctx,
      upload,
      pipelineFileId,
    );

    await ctx.db.insert("libraryDocumentLinks", {
      documentId,
      pipelineFileId,
      documentCategory,
      folderId: targetFolderId,
      linkedAt: now,
      linkedByUserKey: key,
    });

    const grant = await ctx.db.get(upload.grantId);

    const uploaderContactId =
      upload.uploaderContactId ??
      (grant
        ? await resolvePortalGrantContactId(ctx, grant, pipeline)
        : undefined);

    if (
      isEvergreenDocumentCategory(documentCategory) &&
      uploaderContactId
    ) {
      const contact = await ctx.db.get(uploaderContactId);
      if (contact) {
        await assertCanMutateContactRow(ctx, contact, memberUserKey);
        await ctx.db.insert("libraryDocumentLinks", {
          documentId,
          contactId: uploaderContactId,
          documentCategory,
          linkedAt: now,
          linkedByUserKey: key,
        });
      }
    }

    await ctx.db.patch(uploadId, {
      reviewStatus: "archived",
      promotedLibraryDocumentId: documentId,
      updatedAt: now,
    });

    await appendPortalAudit(ctx, {
      orgScope: grant?.orgScope ?? orgScopeFromPipelineRow(pipeline),
      kind: "broker_promoted_portal_upload",
      actorType: "broker",
      actorKey: key,
      detail: safeName.slice(0, 200),
      pipelineFileId,
      grantId: upload.grantId,
    });

    return { libraryDocumentId: documentId };
  },
});
