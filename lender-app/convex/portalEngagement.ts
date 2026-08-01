import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { normalizePortalToken, sha256Hex } from "./clientPortalCrypto";
import { loadLinkByTokenHash } from "./clientPortalLinks";
import { logDocumentVaultAudit } from "./documentVaultActivity";
import {
  pipelineDealName,
  scheduleWebhookQueueEvent,
  webhookVaultContext,
} from "./webhookEventHelpers";

const engagementEventV = v.union(
  v.literal("document_previewed"),
  v.literal("folder_expanded"),
  v.literal("package_exported"),
);

export const trackPortalEngagementEvent = mutation({
  args: {
    token: v.string(),
    eventType: engagementEventV,
    documentTitle: v.optional(v.string()),
    folderName: v.optional(v.string()),
    lenderName: v.optional(v.string()),
    documentId: v.optional(v.id("libraryDocuments")),
    folderId: v.optional(v.id("documentFolders")),
    packageLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmed = normalizePortalToken(args.token);
    if (!trimmed) return { ok: false as const, reason: "invalid_token" };
    const tokenHash = await sha256Hex(trimmed);
    const link = await loadLinkByTokenHash(ctx, tokenHash);
    if (!link || link.status !== "active" || link.expiresAt < Date.now()) {
      return { ok: false as const, reason: "link_inactive" };
    }

    const pipeline = await ctx.db.get(link.pipelineFileId);
    if (!pipeline) return { ok: false as const, reason: "pipeline_missing" };

    const lenderName =
      args.lenderName?.trim() ||
      link.targetName?.trim() ||
      "Lender";

    let summary = "";
    let kind: Doc<"pipelineFileActivity">["kind"] = "lender_delivery_accessed";

    switch (args.eventType) {
      case "document_previewed": {
        const title = args.documentTitle?.trim() || "Document";
        summary = `${lenderName} previewed "${title}"`;
        kind = "lender_document_previewed";
        break;
      }
      case "folder_expanded": {
        const folder = args.folderName?.trim() || "Folder";
        summary = `${lenderName} viewed "${folder}" folder`;
        kind = "lender_folder_expanded";
        break;
      }
      case "package_exported": {
        const label = args.packageLabel?.trim() || "deal package";
        summary = `${lenderName} downloaded ${label}`;
        kind = "lender_package_exported";
        break;
      }
    }

    await logDocumentVaultAudit(ctx, {
      pipeline,
      kind,
      actorUserKey: "__lender_portal__",
      summary,
      meta: {
        eventType: args.eventType,
        documentId: args.documentId,
        folderId: args.folderId,
        lenderId: link.lenderId,
      },
      lenderId: link.lenderId,
      libraryDocumentId: args.documentId,
    });

    if (args.eventType === "package_exported") {
      await scheduleWebhookQueueEvent(ctx, {
        organizationId: pipeline.organizationId,
        event: "deal_package_compiled",
        data: {
          ...webhookVaultContext(pipeline._id, pipelineDealName(pipeline)),
          packageLabel: args.packageLabel?.trim() || "deal package",
          documentCount: undefined,
          source: "lender_portal_export",
          lenderName,
        },
      });
    }

    return { ok: true as const };
  },
});
