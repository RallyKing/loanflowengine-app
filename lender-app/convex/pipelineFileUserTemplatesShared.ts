import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Load a user template row for layout resolution; enforces `accountId` ownership.
 */
export async function loadUserPipelineFileTemplateForLayout(
  ctx: Pick<QueryCtx, "db">,
  templateId: Id<"pipelineFileUserTemplates">,
  accountId: string,
): Promise<{
  includedBlocks: string[];
  blockOrder: string[];
  defaultSettings: Record<string, Record<string, unknown>>;
} | null> {
  const row = await ctx.db.get(templateId);
  if (!row || row.accountId !== accountId) return null;
  const ds =
    row.defaultSettings &&
    typeof row.defaultSettings === "object" &&
    !Array.isArray(row.defaultSettings)
      ? (row.defaultSettings as Record<string, Record<string, unknown>>)
      : {};
  return {
    includedBlocks: row.includedBlocks,
    blockOrder: row.blockOrder,
    defaultSettings: ds,
  };
}

/**
 * Phase Modular-E — workflow extras (favorites, portal checklist, playbooks)
 * carried by a user template, for the New File wizard apply step.
 */
export async function loadUserPipelineFileTemplateWorkflowExtras(
  ctx: Pick<QueryCtx, "db">,
  templateId: Id<"pipelineFileUserTemplates">,
  accountId: string,
): Promise<{
  favoriteBlockIds: string[];
  portalRequestChecklist: {
    title: string;
    description?: string;
    folderName?: string;
  }[];
  taskTemplateGroupIds: Id<"taskTemplateGroups">[];
} | null> {
  const row = await ctx.db.get(templateId);
  if (!row || row.accountId !== accountId) return null;
  return {
    favoriteBlockIds: row.favoriteBlockIds ?? [],
    portalRequestChecklist: row.portalRequestChecklist ?? [],
    taskTemplateGroupIds: row.taskTemplateGroupIds ?? [],
  };
}
