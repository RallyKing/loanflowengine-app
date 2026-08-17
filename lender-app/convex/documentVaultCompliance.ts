/**
 * Phase 41 — document staleness monitoring + proactive portal re-upload requests.
 */
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import { libraryDocumentCategoryV } from "./contactStickyData/validators";
import { isGrantUsable } from "./clientPortalShared";
import {
  computeExpiresAt,
  daysUntilExpiry,
  effectiveLinkExpiresAt,
  resolveDocumentExpiryStatus,
  type DocumentExpiryStatus,
} from "../lib/library/documentVaultExpiry";
import { LIBRARY_DOCUMENT_CATEGORY_LABELS } from "../lib/library/documentVaultTaxonomy";
import { resolveTriageEvaluationTime } from "../lib/triageClock";

const memberKeyArg = { memberUserKey: v.optional(v.string()) };

const staleDocumentRowV = v.object({
  documentId: v.id("libraryDocuments"),
  linkId: v.id("libraryDocumentLinks"),
  title: v.string(),
  documentCategory: v.optional(libraryDocumentCategoryV),
  expiresAt: v.number(),
  status: v.union(v.literal("expiring_soon"), v.literal("expired")),
  daysUntilExpiry: v.number(),
  folderId: v.optional(v.id("documentFolders")),
});

export async function syncLinkExpiresAt(
  ctx: MutationCtx,
  link: Doc<"libraryDocumentLinks">,
  latestUploadedAt: number | undefined,
): Promise<void> {
  const expiresAt = computeExpiresAt(
    latestUploadedAt,
    link.documentCategory ?? undefined,
  );
  if (link.expiresAt === expiresAt) return;
  await ctx.db.patch(link._id, { expiresAt });
}

async function collectPipelineStaleRows(
  ctx: QueryCtx,
  pipelineFileId: Id<"pipeline">,
  now: number,
) {
  const links = await ctx.db
    .query("libraryDocumentLinks")
    .withIndex("by_pipeline_linkedAt", (q) =>
      q.eq("pipelineFileId", pipelineFileId),
    )
    .collect();

  const stale: Array<{
    documentId: Id<"libraryDocuments">;
    linkId: Id<"libraryDocumentLinks">;
    title: string;
    documentCategory: Doc<"libraryDocumentLinks">["documentCategory"];
    expiresAt: number;
    status: "expiring_soon" | "expired";
    daysUntilExpiry: number;
    folderId: Id<"documentFolders"> | undefined;
  }> = [];

  for (const link of links) {
    const doc = await ctx.db.get(link.documentId);
    if (!doc || doc.latestVersionNumber <= 0) continue;

    const expiresAt = effectiveLinkExpiresAt(link, doc.latestUploadedAt);
    const status = resolveDocumentExpiryStatus(expiresAt, now);
    if (status !== "expiring_soon" && status !== "expired") continue;
    if (expiresAt == null) continue;

    const remaining = daysUntilExpiry(expiresAt, now);
    stale.push({
      documentId: doc._id,
      linkId: link._id,
      title: doc.title,
      documentCategory: link.documentCategory,
      expiresAt,
      status,
      daysUntilExpiry: remaining ?? 0,
      folderId: link.folderId,
    });
  }

  stale.sort((a, b) => a.expiresAt - b.expiresAt);
  return stale;
}

export const listStaleDocuments = query({
  args: {
    pipelineFileId: v.id("pipeline"),
    /**
     * Minute bucket from `TriageClockProvider`. Required in practice — this
     * handler never reads the wall clock, so an omitted bucket evaluates as
     * "nothing expired yet" (see `resolveTriageEvaluationTime`).
     */
    nowBucket: v.optional(v.number()),
    ...memberKeyArg,
  },
  returns: v.object({
    stale: v.array(staleDocumentRowV),
    expiredCount: v.number(),
    expiringSoonCount: v.number(),
  }),
  handler: async (ctx, { pipelineFileId, memberUserKey, nowBucket }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) {
      return { stale: [], expiredCount: 0, expiringSoonCount: 0 };
    }
    await assertCanReadPipelineRow(ctx, pipeline, memberUserKey);

    const now = resolveTriageEvaluationTime(nowBucket);
    const stale = await collectPipelineStaleRows(ctx, pipelineFileId, now);
    return {
      stale,
      expiredCount: stale.filter((s) => s.status === "expired").length,
      expiringSoonCount: stale.filter((s) => s.status === "expiring_soon").length,
    };
  },
});

async function hasOpenStaleRequest(
  ctx: QueryCtx | MutationCtx,
  grantId: Id<"clientPortalGrants">,
  documentId: Id<"libraryDocuments">,
): Promise<boolean> {
  const requests = await ctx.db
    .query("clientPortalRequests")
    .withIndex("by_grant", (q) => q.eq("grantId", grantId))
    .collect();
  return requests.some(
    (r) =>
      r.status === "open" &&
      r.requestKind === "staleness" &&
      r.sourceDocumentId === documentId,
  );
}

function staleRequestTitle(
  docTitle: string,
  category: Doc<"libraryDocumentLinks">["documentCategory"],
): string {
  if (category) {
    const label = LIBRARY_DOCUMENT_CATEGORY_LABELS[category];
    return `Re-upload: ${label}`;
  }
  return `Re-upload: ${docTitle}`;
}

function staleRequestDescription(
  docTitle: string,
  status: DocumentExpiryStatus,
  daysUntilExpiry: number,
): string {
  if (status === "expired") {
    return `The document "${docTitle}" has expired. Please upload a current version.`;
  }
  return `The document "${docTitle}" expires in ${daysUntilExpiry} day(s). Please upload an updated copy.`;
}

/** Creates open portal re-upload requests for expired pipeline documents. */
export const ensureStalePortalRequests = mutation({
  args: {
    pipelineFileId: v.id("pipeline"),
    includeExpiringSoon: v.optional(v.boolean()),
    ...memberKeyArg,
  },
  returns: v.object({
    created: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, { pipelineFileId, includeExpiringSoon, memberUserKey }) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);

    const now = Date.now();
    const stale = await collectPipelineStaleRows(ctx, pipelineFileId, now);
    const targets = stale.filter(
      (s) =>
        s.status === "expired" ||
        (includeExpiringSoon === true && s.status === "expiring_soon"),
    );

    const grants = await ctx.db
      .query("clientPortalGrants")
      .withIndex("by_file", (q) => q.eq("pipelineFileId", pipelineFileId))
      .collect();

    const usableGrants = grants.filter((g) => isGrantUsable(g));
    if (usableGrants.length === 0) {
      return { created: 0, skipped: targets.length };
    }

    let created = 0;
    let skipped = 0;
    const poster = memberUserKey?.trim() || "__compliance__";

    for (const row of targets) {
      let anyGrantCreated = false;
      for (const grant of usableGrants) {
        if (await hasOpenStaleRequest(ctx, grant._id, row.documentId)) {
          continue;
        }
        const nowTs = Date.now();
        await ctx.db.insert("clientPortalRequests", {
          grantId: grant._id,
          pipelineFileId,
          title: staleRequestTitle(row.title, row.documentCategory),
          description: staleRequestDescription(
            row.title,
            row.status,
            row.daysUntilExpiry,
          ),
          targetFolderId: row.folderId,
          status: "open",
          createdByUserKey: poster,
          createdAt: nowTs,
          updatedAt: nowTs,
          sourceDocumentId: row.documentId,
          requestKind: "staleness",
          documentCategory: row.documentCategory,
        });
        anyGrantCreated = true;
      }
      if (anyGrantCreated) created += 1;
      else skipped += 1;
    }

    return { created, skipped };
  },
});
