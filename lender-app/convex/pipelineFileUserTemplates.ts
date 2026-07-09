import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ALL_PIPELINE_BLOCK_IDS } from "../lib/pipelineBlockRegistry";
import { getEffectiveMandatoryPipelineBlockIds } from "../lib/pipelineGlobalBlockPolicy";
import {
  buildStorableUserTemplateLists,
  sanitizeUserTemplateDefaultSettings,
} from "../lib/pipelineUserFileTemplatePayload";
import { getPipelineGlobalBlockConfigRow } from "./pipelineGlobalBlockConfigHelpers";
import {
  mergeBlockSettingsWithSchemaDefaults,
} from "../lib/pipelineBlockSettingsSchema";
import { PIPELINE_BLOCKS } from "../lib/pipelineBlockRegistry";
import type { PipelineBlockId } from "../lib/pipelineBlockRegistry";

const portalChecklistItemArg = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  folderName: v.optional(v.string()),
});

/** Phase Modular-E: dedupe + registry-validate favorite block ids. */
function sanitizeFavoriteBlockIds(
  raw: readonly string[] | undefined,
): string[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: string[] = [];
  for (const id of raw) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) continue;
    if (out.includes(id)) continue;
    out.push(id);
  }
  return out.length > 0 ? out : undefined;
}

/** Phase Modular-E: trim + cap portal checklist items (max 40, non-empty titles). */
function sanitizePortalChecklist(
  raw:
    | readonly { title: string; description?: string; folderName?: string }[]
    | undefined,
):
  | { title: string; description?: string; folderName?: string }[]
  | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: { title: string; description?: string; folderName?: string }[] =
    [];
  for (const item of raw.slice(0, 40)) {
    const title = item.title.trim().slice(0, 200);
    if (!title) continue;
    out.push({
      title,
      description: item.description?.trim().slice(0, 4000) || undefined,
      folderName: item.folderName?.trim().slice(0, 120) || undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeSettingsForBlocks(
  raw: unknown,
  blockIds: readonly string[],
): Record<string, Record<string, unknown>> {
  const allow = new Set(blockIds.filter((id) => ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)));
  const partial = sanitizeUserTemplateDefaultSettings(raw, allow as ReadonlySet<PipelineBlockId>);
  const out: Record<string, Record<string, unknown>> = {};
  for (const id of allow) {
    const bid = id as PipelineBlockId;
    const rawBlock = partial[bid];
    if (!rawBlock) continue;
    const block = PIPELINE_BLOCKS.find((b) => b.blockId === bid);
    const merged = mergeBlockSettingsWithSchemaDefaults(
      block?.settingsSchema ?? null,
      rawBlock,
    );
    if (Object.keys(merged).length > 0) out[bid] = merged;
  }
  return out;
}

export const listByAccountId = query({
  args: { accountId: v.string() },
  handler: async (ctx, { accountId }) => {
    const trimmed = accountId.trim();
    if (!trimmed) return [];
    return await ctx.db
      .query("pipelineFileUserTemplates")
      .withIndex("by_accountId", (q) => q.eq("accountId", trimmed))
      .collect();
  },
});

export const create = mutation({
  args: {
    accountId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    /** Visible blocks in top-to-bottom order (same shape as editor). */
    includedBlocks: v.array(v.string()),
    defaultSettings: v.optional(v.any()),
    favoriteBlockIds: v.optional(v.array(v.string())),
    portalRequestChecklist: v.optional(v.array(portalChecklistItemArg)),
    taskTemplateGroupIds: v.optional(v.array(v.id("taskTemplateGroups"))),
  },
  handler: async (ctx, args) => {
    const trimmedAccount = args.accountId.trim();
    if (!trimmedAccount) throw new Error("accountId is required");
    const name = args.name.trim();
    if (!name) throw new Error("Template name is required");

    const globalRow = await getPipelineGlobalBlockConfigRow(ctx);
    const effectiveMandatory = getEffectiveMandatoryPipelineBlockIds(
      globalRow?.adminRequiredBlockIds,
    );

    const orderIn = args.includedBlocks.filter((id): id is PipelineBlockId =>
      ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
    );
    const { includedBlocks, blockOrder } = buildStorableUserTemplateLists(
      orderIn.length > 0 ? orderIn : [...effectiveMandatory],
      effectiveMandatory,
    );

    const settings = sanitizeSettingsForBlocks(
      args.defaultSettings,
      includedBlocks,
    );

    const now = Date.now();
    return await ctx.db.insert("pipelineFileUserTemplates", {
      accountId: trimmedAccount,
      name,
      description: args.description?.trim() || undefined,
      includedBlocks,
      blockOrder,
      defaultSettings: Object.keys(settings).length > 0 ? settings : undefined,
      favoriteBlockIds: sanitizeFavoriteBlockIds(args.favoriteBlockIds),
      portalRequestChecklist: sanitizePortalChecklist(
        args.portalRequestChecklist,
      ),
      taskTemplateGroupIds:
        args.taskTemplateGroupIds && args.taskTemplateGroupIds.length > 0
          ? args.taskTemplateGroupIds
          : undefined,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("pipelineFileUserTemplates"),
    accountId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    includedBlocks: v.array(v.string()),
    defaultSettings: v.optional(v.any()),
    favoriteBlockIds: v.optional(v.array(v.string())),
    portalRequestChecklist: v.optional(v.array(portalChecklistItemArg)),
    taskTemplateGroupIds: v.optional(v.array(v.id("taskTemplateGroups"))),
  },
  handler: async (ctx, args) => {
    const trimmedAccount = args.accountId.trim();
    if (!trimmedAccount) throw new Error("accountId is required");
    const row = await ctx.db.get(args.id);
    if (!row || row.accountId !== trimmedAccount) {
      throw new Error("Template not found");
    }
    const name = args.name.trim();
    if (!name) throw new Error("Template name is required");

    const globalRow = await getPipelineGlobalBlockConfigRow(ctx);
    const effectiveMandatory = getEffectiveMandatoryPipelineBlockIds(
      globalRow?.adminRequiredBlockIds,
    );

    const orderIn = args.includedBlocks.filter((id): id is PipelineBlockId =>
      ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
    );
    const { includedBlocks, blockOrder } = buildStorableUserTemplateLists(
      orderIn.length > 0 ? orderIn : [...effectiveMandatory],
      effectiveMandatory,
    );

    const settings = sanitizeSettingsForBlocks(
      args.defaultSettings,
      includedBlocks,
    );

    const now = Date.now();
    await ctx.db.patch(args.id, {
      name,
      description: args.description?.trim() || undefined,
      includedBlocks,
      blockOrder,
      defaultSettings: Object.keys(settings).length > 0 ? settings : undefined,
      favoriteBlockIds: sanitizeFavoriteBlockIds(args.favoriteBlockIds),
      portalRequestChecklist: sanitizePortalChecklist(
        args.portalRequestChecklist,
      ),
      taskTemplateGroupIds:
        args.taskTemplateGroupIds && args.taskTemplateGroupIds.length > 0
          ? args.taskTemplateGroupIds
          : undefined,
      updatedAt: now,
    });
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("pipelineFileUserTemplates"),
    accountId: v.string(),
  },
  handler: async (ctx, { id, accountId }) => {
    const trimmed = accountId.trim();
    if (!trimmed) throw new Error("accountId is required");
    const row = await ctx.db.get(id);
    if (!row || row.accountId !== trimmed) {
      throw new Error("Template not found");
    }
    await ctx.db.delete(id);
  },
});
