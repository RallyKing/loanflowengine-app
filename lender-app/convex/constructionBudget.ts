/**
 * Construction budget for the `constructionBudget` pipeline block.
 * Excel catalog lives in `lib/constructionBudget/constructionBudgetModel.ts`;
 * Convex stores the header sheet + sparse / legacy line rows.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanMutatePipelineRow,
  assertCanReadPipelineRow,
} from "./organizationAccess";
import {
  CONSTRUCTION_BUDGET_CATALOG_BY_KEY,
  isConstructionBudgetProjectType,
  isConstructionBudgetRepairReplace,
  isConstructionBudgetUnit,
  isValidCompletionTimeframeMonths,
  mapPersistedLinesToWorkbook,
  normalizeBudgetLabel,
  type ConstructionBudgetHeader,
} from "../lib/constructionBudget/constructionBudgetModel";
import {
  constructionBudgetLegacyStatusV,
  constructionBudgetProjectTypeV,
  constructionBudgetRepairReplaceV,
  constructionBudgetUnitV,
} from "./constructionBudgetValidators";

const memberUserKeyArg = {
  memberUserKey: v.optional(v.string()),
};

function emptyToUndef(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function headerFromSheet(
  sheet: Doc<"constructionBudgetSheets"> | null,
): ConstructionBudgetHeader {
  if (!sheet) return {};
  return {
    applicantName: sheet.applicantName,
    propertyAddress: sheet.propertyAddress,
    contractor: sheet.contractor,
    projectType: isConstructionBudgetProjectType(sheet.projectType)
      ? sheet.projectType
      : sheet.projectType
        ? ""
        : undefined,
    plannedSummary: sheet.plannedSummary,
    qualityOfFinishes: sheet.qualityOfFinishes,
    completionTimeframeMonths: sheet.completionTimeframeMonths,
  };
}

function sortOrderForTemplateKey(key: string): number {
  const catalog = CONSTRUCTION_BUDGET_CATALOG_BY_KEY.get(key);
  if (!catalog) return 10_000;
  const code = Number.parseFloat(catalog.excelCode);
  return Number.isFinite(code) ? Math.round(code * 100) : 10_000;
}

export const listByFile = query({
  args: {
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) return [];
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    return await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file_sort", (q) => q.eq("fileId", fileId))
      .collect();
  },
});

export const getWorkbook = query({
  args: {
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, { fileId, memberUserKey }) => {
    const file = await ctx.db.get(fileId);
    if (!file) {
      return { header: {} as ConstructionBudgetHeader, lines: [] };
    }
    await assertCanReadPipelineRow(ctx, file, memberUserKey);
    const sheet = await ctx.db
      .query("constructionBudgetSheets")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .first();
    const lines = await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file_sort", (q) => q.eq("fileId", fileId))
      .collect();
    return {
      header: headerFromSheet(sheet),
      sheetId: sheet?._id ?? null,
      migratedAt: sheet?.migratedAt ?? null,
      lines,
    };
  },
});

export const upsertHeader = mutation({
  args: {
    fileId: v.id("pipeline"),
    applicantName: v.optional(v.string()),
    propertyAddress: v.optional(v.string()),
    contractor: v.optional(v.string()),
    projectType: v.optional(constructionBudgetProjectTypeV),
    plannedSummary: v.optional(v.string()),
    qualityOfFinishes: v.optional(v.string()),
    completionTimeframeMonths: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);

    if (
      args.completionTimeframeMonths !== undefined &&
      !isValidCompletionTimeframeMonths(args.completionTimeframeMonths)
    ) {
      throw new Error("Completion timeframe must be between 1 and 12 months.");
    }

    const now = Date.now();
    const patch = {
      applicantName: emptyToUndef(args.applicantName),
      propertyAddress: emptyToUndef(args.propertyAddress),
      contractor: emptyToUndef(args.contractor),
      projectType: emptyToUndef(args.projectType),
      plannedSummary: emptyToUndef(args.plannedSummary),
      qualityOfFinishes: emptyToUndef(args.qualityOfFinishes),
      completionTimeframeMonths: emptyToUndef(args.completionTimeframeMonths),
      updatedAt: now,
    };

    const existing = await ctx.db
      .query("constructionBudgetSheets")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("constructionBudgetSheets", {
      organizationId: file.organizationId,
      fileId: args.fileId,
      ...patch,
      createdAt: now,
    });
  },
});

/**
 * One-shot additive migration: copy matching legacy line amounts onto
 * `templateKey` rows, then delete the matched legacy rows. Unmatched rows stay.
 */
export const migrateLegacyLines = mutation({
  args: {
    fileId: v.id("pipeline"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);

    const rows = await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
    const legacy = rows.filter((r) => !r.templateKey);
    if (legacy.length === 0) {
      await stampMigrated(ctx, file, args.fileId);
      return { matched: 0, customRemaining: 0 };
    }

    const mapped = mapPersistedLinesToWorkbook(
      legacy.map((r) => ({
        _id: String(r._id),
        category: r.category,
        description: r.description,
        budgetAmount: r.budgetAmount,
        spentAmount: r.spentAmount,
        drawNumber: r.drawNumber,
        repairReplace: r.repairReplace,
        quantity: r.quantity,
        unitOfMeasure: r.unitOfMeasure,
        status: r.status,
      })),
    );

    const now = Date.now();
    const legacyById = new Map(legacy.map((r) => [String(r._id), r]));
    let matched = 0;

    for (const [key, values] of Object.entries(mapped.lines)) {
      const catalog = CONSTRUCTION_BUDGET_CATALOG_BY_KEY.get(key);
      if (!catalog) continue;
      const sourceId = mapped.matchedLegacyIds.find((id) => {
        const row = legacyById.get(id);
        if (!row) return false;
        return (
          normalizeBudgetLabel(row.category) ===
            normalizeBudgetLabel(catalog.label) ||
          normalizeBudgetLabel(row.description) ===
            normalizeBudgetLabel(catalog.label)
        );
      });
      const source = sourceId ? legacyById.get(sourceId) : undefined;
      const existing = rows.find((r) => r.templateKey === key);
      if (existing) {
        await ctx.db.patch(existing._id, {
          category: catalog.label,
          budgetAmount:
            emptyToUndef(values.budgetAmount) ?? existing.budgetAmount,
          repairReplace:
            emptyToUndef(values.repairReplace) ?? existing.repairReplace,
          quantity: emptyToUndef(values.quantity) ?? existing.quantity,
          unitOfMeasure:
            emptyToUndef(values.unitOfMeasure) ?? existing.unitOfMeasure,
          spentAmount: source?.spentAmount ?? existing.spentAmount,
          drawNumber: source?.drawNumber ?? existing.drawNumber,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("constructionBudgetLines", {
          organizationId: file.organizationId,
          fileId: args.fileId,
          templateKey: key,
          category: catalog.label,
          budgetAmount: emptyToUndef(values.budgetAmount),
          repairReplace: emptyToUndef(values.repairReplace),
          quantity: emptyToUndef(values.quantity),
          unitOfMeasure: emptyToUndef(values.unitOfMeasure),
          spentAmount: source?.spentAmount,
          drawNumber: source?.drawNumber,
          status: source?.status ?? "planned",
          sortOrder: sortOrderForTemplateKey(key),
          createdAt: now,
          updatedAt: now,
        });
      }
      matched += 1;
    }

    const matchedIdSet = new Set(mapped.matchedLegacyIds);
    for (const row of legacy) {
      if (matchedIdSet.has(String(row._id))) {
        await ctx.db.delete(row._id);
      }
    }

    await stampMigrated(ctx, file, args.fileId);
    return {
      matched,
      customRemaining: mapped.customLines.length,
    };
  },
});

async function stampMigrated(
  ctx: { db: MutationCtx["db"] },
  file: Doc<"pipeline">,
  fileId: Id<"pipeline">,
) {
  const now = Date.now();
  const sheet = await ctx.db
    .query("constructionBudgetSheets")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .first();
  if (sheet) {
    if (!sheet.migratedAt) {
      await ctx.db.patch(sheet._id, { migratedAt: now, updatedAt: now });
    }
    return;
  }
  await ctx.db.insert("constructionBudgetSheets", {
    organizationId: file.organizationId,
    fileId,
    migratedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export const upsertTemplateLine = mutation({
  args: {
    fileId: v.id("pipeline"),
    templateKey: v.string(),
    repairReplace: v.optional(constructionBudgetRepairReplaceV),
    quantity: v.optional(v.string()),
    unitOfMeasure: v.optional(constructionBudgetUnitV),
    budgetAmount: v.optional(v.string()),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);

    const catalog = CONSTRUCTION_BUDGET_CATALOG_BY_KEY.get(args.templateKey);
    if (!catalog) throw new Error("Unknown construction budget line");

    if (
      args.repairReplace &&
      !isConstructionBudgetRepairReplace(args.repairReplace)
    ) {
      throw new Error("Repair/Replace must be Repair or Replace");
    }
    if (args.unitOfMeasure && !isConstructionBudgetUnit(args.unitOfMeasure)) {
      throw new Error("Unit of Measure is not a valid Excel option");
    }

    const now = Date.now();
    const patch = {
      category: catalog.label,
      repairReplace: emptyToUndef(args.repairReplace),
      quantity: emptyToUndef(args.quantity),
      unitOfMeasure: emptyToUndef(args.unitOfMeasure),
      budgetAmount: emptyToUndef(args.budgetAmount),
    };

    const existing = await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file_template_key", (q) =>
        q.eq("fileId", args.fileId).eq("templateKey", args.templateKey),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("constructionBudgetLines", {
      organizationId: file.organizationId,
      fileId: args.fileId,
      templateKey: args.templateKey,
      ...patch,
      status: "planned",
      sortOrder: sortOrderForTemplateKey(args.templateKey),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertLine = mutation({
  args: {
    fileId: v.id("pipeline"),
    lineId: v.optional(v.id("constructionBudgetLines")),
    category: v.string(),
    description: v.optional(v.string()),
    budgetAmount: v.optional(v.string()),
    spentAmount: v.optional(v.string()),
    drawNumber: v.optional(v.string()),
    repairReplace: v.optional(constructionBudgetRepairReplaceV),
    quantity: v.optional(v.string()),
    unitOfMeasure: v.optional(constructionBudgetUnitV),
    templateKey: v.optional(v.string()),
    status: v.optional(constructionBudgetLegacyStatusV),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);

    const category = args.category.trim();
    if (!category) throw new Error("Budget line category is required");

    const templateKey = emptyToUndef(args.templateKey);
    if (templateKey && !CONSTRUCTION_BUDGET_CATALOG_BY_KEY.has(templateKey)) {
      throw new Error("Unknown construction budget line");
    }

    const now = Date.now();
    const patch = {
      category,
      description: emptyToUndef(args.description),
      budgetAmount: emptyToUndef(args.budgetAmount),
      spentAmount: emptyToUndef(args.spentAmount),
      drawNumber: emptyToUndef(args.drawNumber),
      repairReplace: emptyToUndef(args.repairReplace),
      quantity: emptyToUndef(args.quantity),
      unitOfMeasure: emptyToUndef(args.unitOfMeasure),
      ...(templateKey ? { templateKey } : {}),
    };

    if (args.lineId) {
      const existing = await ctx.db.get(args.lineId);
      if (!existing || String(existing.fileId) !== String(args.fileId)) {
        throw new Error("Budget line not found on this file");
      }
      await ctx.db.patch(args.lineId, {
        ...patch,
        ...(args.status ? { status: args.status } : {}),
        updatedAt: now,
      });
      return args.lineId;
    }

    const siblings = await ctx.db
      .query("constructionBudgetLines")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
    const sortOrder = templateKey
      ? sortOrderForTemplateKey(templateKey)
      : siblings.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

    return await ctx.db.insert("constructionBudgetLines", {
      organizationId: file.organizationId,
      fileId: args.fileId,
      ...patch,
      status: args.status ?? "planned",
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setLineStatus = mutation({
  args: {
    fileId: v.id("pipeline"),
    lineId: v.id("constructionBudgetLines"),
    status: constructionBudgetLegacyStatusV,
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const existing = await ctx.db.get(args.lineId);
    if (!existing || String(existing.fileId) !== String(args.fileId)) {
      throw new Error("Budget line not found on this file");
    }
    await ctx.db.patch(args.lineId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const removeLine = mutation({
  args: {
    fileId: v.id("pipeline"),
    lineId: v.id("constructionBudgetLines"),
    ...memberUserKeyArg,
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("Pipeline file not found");
    await assertCanMutatePipelineRow(ctx, file, args.memberUserKey);
    const existing = await ctx.db.get(args.lineId);
    if (!existing || String(existing.fileId) !== String(args.fileId)) {
      throw new Error("Budget line not found on this file");
    }
    await ctx.db.delete(args.lineId);
    return { ok: true as const };
  },
});

export type ConstructionBudgetLineDoc = Doc<"constructionBudgetLines">;
