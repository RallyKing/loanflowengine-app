import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertCanMutatePipelineRow } from "./organizationAccess";
import { requireOrgReaderKey } from "./authUtils";
import {
  documentCategoryNameConflict,
  normalizeDocumentCategoryName,
} from "../lib/library/documentCategoryCatalog";

const categoryResultV = v.object({
  _id: v.id("organizationDocumentCategories"),
  displayName: v.string(),
  normalizedName: v.string(),
});

export const listForOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.array(categoryResultV),
  handler: async (ctx, { organizationId, memberUserKey }) => {
    await requireOrgReaderKey(
      ctx,
      organizationId,
      memberUserKey,
      "documentCategories.listForOrganization",
    );
    const rows = await ctx.db
      .query("organizationDocumentCategories")
      .withIndex("by_organization_display", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      displayName: row.displayName,
      normalizedName: row.normalizedName,
    }));
  },
});

export const createForDocumentAssignment = mutation({
  args: {
    organizationId: v.id("organizations"),
    pipelineFileId: v.id("pipeline"),
    displayName: v.string(),
    memberUserKey: v.optional(v.string()),
  },
  returns: v.object({
    category: categoryResultV,
    created: v.boolean(),
  }),
  handler: async (
    ctx,
    { organizationId, pipelineFileId, displayName, memberUserKey },
  ) => {
    const pipeline = await ctx.db.get(pipelineFileId);
    if (!pipeline) throw new Error("Pipeline file not found.");
    await assertCanMutatePipelineRow(ctx, pipeline, memberUserKey);
    if (pipeline.organizationId !== organizationId) {
      throw new Error("Pipeline file does not belong to this organization.");
    }

    const normalized = normalizeDocumentCategoryName(displayName);
    const builtInConflict = documentCategoryNameConflict(displayName, []);
    if (builtInConflict) {
      throw new Error(
        `A built-in category named "${builtInConflict}" already exists.`,
      );
    }
    const existing = await ctx.db
      .query("organizationDocumentCategories")
      .withIndex("by_organization_name", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalized.normalizedName),
      )
      .unique();
    if (existing) {
      return {
        category: {
          _id: existing._id,
          displayName: existing.displayName,
          normalizedName: existing.normalizedName,
        },
        created: false,
      };
    }

    const now = Date.now();
    const categoryId = await ctx.db.insert("organizationDocumentCategories", {
      organizationId,
      ...normalized,
      createdByUserKey: memberUserKey?.trim() || "__system__",
      createdAt: now,
      updatedAt: now,
    });
    return {
      category: {
        _id: categoryId,
        ...normalized,
      },
      created: true,
    };
  },
});
