import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOrgPermission, assertOrgScopeArgs } from "./organizationAccess";
import {
  mergePartialCoverOnPatch,
  mergePartialSubjectPropertyOnPatch,
  syncLinkedPipelineDealDataAfterIntakeChange,
} from "./dealDataMerge";
import { buildInitialIntakeDocument } from "./intakeDocumentDefaults";
import { intakePatchableChangesValidator } from "./intakePatchable";
import { sanitizeDbPatch } from "./sanitizeConvexPatch";

/** Best pipeline row per linked intake (most recently updated wins). */
function pipelineIdByIntakeSheetId(
  pipelines: { _id: Id<"pipeline">; intakeSheetId?: Id<"intakeSheets">; updatedAt: number }[],
): Map<Id<"intakeSheets">, Id<"pipeline">> {
  const best = new Map<
    Id<"intakeSheets">,
    { id: Id<"pipeline">; updatedAt: number }
  >();
  for (const p of pipelines) {
    if (!p.intakeSheetId) continue;
    const prev = best.get(p.intakeSheetId);
    if (!prev || p.updatedAt >= prev.updatedAt) {
      best.set(p.intakeSheetId, { id: p._id, updatedAt: p.updatedAt });
    }
  }
  return new Map(
    [...best.entries()].map(([intakeId, { id }]) => [intakeId, id]),
  );
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { search, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
    const [all, pipelines] = await Promise.all([
      ctx.db.query("intakeSheets").collect(),
      ctx.db.query("pipeline").collect(),
    ]);
    const orgPipelines = pipelines.filter(
      (p) => p.organizationId === organizationId,
    );
    const intakeToPipeline = pipelineIdByIntakeSheetId(orgPipelines);
    const allowedIntakeIds = new Set(intakeToPipeline.keys());
    const sorted = all
      .filter((s) => allowedIntakeIds.has(s._id))
      .sort(
        (a, b) =>
          (b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
      );
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (s) =>
        s.clientName.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q) ||
        (s.fileName ?? "").toLowerCase().includes(q),
    );
  },
});

/**
 * Dashboard / library only: identity + display fields, no nested intake payload.
 * Same search/sort rules as `list` but avoids shipping full borrower/loan/property data.
 */
export const listSummary = query({
  args: {
    search: v.optional(v.string()),
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  handler: async (ctx, { search, organizationId, memberUserKey }) => {
    await assertOrgScopeArgs(ctx, organizationId, memberUserKey);
    await assertOrgPermission(ctx, organizationId, memberUserKey, "files.view");
    const [all, pipelines] = await Promise.all([
      ctx.db.query("intakeSheets").collect(),
      ctx.db.query("pipeline").collect(),
    ]);
    const orgPipelines = pipelines.filter(
      (p) => p.organizationId === organizationId,
    );
    const intakeToPipeline = pipelineIdByIntakeSheetId(orgPipelines);
    const allowedIntakeIds = new Set(intakeToPipeline.keys());
    const rows = all
      .filter((s) => allowedIntakeIds.has(s._id))
      .map((s) => {
        const updatedAt = s.updatedAt ?? s._creationTime;
        return {
          _id: s._id,
          _creationTime: s._creationTime,
          clientName: s.clientName,
          projectName: s.projectName,
          fileName: s.fileName,
          updatedAt,
          linkedPipelineId: intakeToPipeline.get(s._id) ?? null,
        };
      });
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    if (!search?.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (s) =>
        s.clientName.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q) ||
        (s.fileName ?? "").toLowerCase().includes(q),
    );
  },
});

export const get = query({
  args: { id: v.id("intakeSheets") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/**
 * Inserts a standalone `intakeSheets` row. Prefer **`pipeline.createFileWithDeal`**
 * for new work so deal data lives on the file (`dealData`).
 */
export const create = mutation({
  args: {
    clientName: v.string(),
    projectName: v.string(),
    ownerName: v.optional(v.string()),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedClient = args.clientName.trim();
    const trimmedProject = args.projectName.trim();
    if (!trimmedClient) throw new Error("Client name is required");
    if (!trimmedProject) throw new Error("Project name is required");

    const body = buildInitialIntakeDocument({
      clientName: trimmedClient,
      projectName: trimmedProject,
      ownerName: args.ownerName,
      fileName: args.fileName?.trim(),
    });
    return await ctx.db.insert("intakeSheets", body as never);
  },
});

export const patch = mutation({
  args: {
    id: v.id("intakeSheets"),
    changes: intakePatchableChangesValidator,
  },
  handler: async (ctx, { id, changes }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Intake not found");
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(changes)) {
      if (val !== undefined) cleaned[k] = val;
    }
    if (typeof cleaned.fundingType === "string") {
      cleaned.fundingType = cleaned.fundingType.trim().slice(0, 120);
    }
    if (Object.keys(cleaned).length === 0) return;
    if (cleaned.cover != null) {
      const mergedCover = mergePartialCoverOnPatch(row.cover, cleaned.cover);
      if (mergedCover !== undefined) cleaned.cover = mergedCover;
    }
    if (cleaned.subjectProperty != null) {
      const mergedSp = mergePartialSubjectPropertyOnPatch(
        row.subjectProperty,
        cleaned.subjectProperty,
      );
      if (mergedSp !== undefined) cleaned.subjectProperty = mergedSp;
    }
    cleaned.updatedAt = Date.now();
    await ctx.db.patch(id, sanitizeDbPatch(cleaned));
    await syncLinkedPipelineDealDataAfterIntakeChange(ctx, id, cleaned);
  },
});

export const remove = mutation({
  args: { id: v.id("intakeSheets") },
  handler: async (ctx, { id }) => {
    const sheet = await ctx.db.get(id);
    if (!sheet) return;

    const now = Date.now();

    // Pipeline rows keep `intakeSheetId` as an optional FK — clear it so we
    // never leave dangling references after the sheet is gone.
    const linkedFiles = await ctx.db
      .query("pipeline")
      .withIndex("by_intakeSheetId", (q) => q.eq("intakeSheetId", id))
      .collect();
    for (const row of linkedFiles) {
      await ctx.db.patch(row._id, {
        intakeSheetId: undefined,
        updatedAt: now,
      });
    }

    // Share tokens would otherwise resolve to a missing intake (`not_found`).
    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_intake", (q) => q.eq("intakeId", id))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    await ctx.db.delete(id);
  },
});
