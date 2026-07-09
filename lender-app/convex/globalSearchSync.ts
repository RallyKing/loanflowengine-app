import { mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildContactGlobalSearchText,
  buildPipelineGlobalSearchText,
  buildTaskGlobalSearchText,
} from "../lib/globalSearchText";
import { linkedClientDisplayNamesForPipeline } from "./pipelineMultiClientLinks";
import { primaryEntityDisplayNameForContact } from "./contactPrimaryEntity";

export async function refreshPipelineGlobalSearchText(
  ctx: MutationCtx,
  fileId: Id<"pipeline">,
): Promise<void> {
  const row = await ctx.db.get(fileId);
  if (!row) return;
  const linkedNames = await linkedClientDisplayNamesForPipeline(ctx, row);
  const next = buildPipelineGlobalSearchText(row, linkedNames);
  if (row.globalSearchText === next) return;
  await ctx.db.patch(fileId, { globalSearchText: next });
}

export async function refreshContactGlobalSearchText(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
): Promise<void> {
  const row = await ctx.db.get(contactId);
  if (!row) return;
  const primaryEntityName = await primaryEntityDisplayNameForContact(
    ctx,
    contactId,
  );
  const next = buildContactGlobalSearchText(row, primaryEntityName);
  if (row.globalSearchText === next) return;
  await ctx.db.patch(contactId, { globalSearchText: next });
}

export async function refreshTaskGlobalSearchText(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
): Promise<void> {
  const row = await ctx.db.get(taskId);
  if (!row) return;
  const next = buildTaskGlobalSearchText(row);
  if (row.globalSearchText === next) return;
  await ctx.db.patch(taskId, { globalSearchText: next });
}

/** After insert: compute from the document we just wrote. */
export function globalSearchTextForNewPipeline(
  row: Doc<"pipeline">,
): string {
  return buildPipelineGlobalSearchText(row);
}

export function globalSearchTextForNewContact(row: Doc<"contacts">): string {
  return buildContactGlobalSearchText(row);
}

export function globalSearchTextForNewTask(row: Doc<"tasks">): string {
  return buildTaskGlobalSearchText(row);
}

/**
 * Backfill `globalSearchText` for pipeline rows (paginate with `cursor` until `isDone`).
 */
export const rebuildPipelineGlobalSearchPage = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { limit, cursor }) => {
    const pageSize = Math.min(Math.max(1, limit ?? 500), 2000);
    const startCursor = cursor === undefined || cursor === null ? null : cursor;
    const { page, isDone, continueCursor } = await ctx.db
      .query("pipeline")
      .order("asc")
      .paginate({ numItems: pageSize, cursor: startCursor });
    let updated = 0;
    for (const row of page) {
      const linkedNames = await linkedClientDisplayNamesForPipeline(ctx, row);
      const next = buildPipelineGlobalSearchText(row, linkedNames);
      if (row.globalSearchText !== next) {
        await ctx.db.patch(row._id, { globalSearchText: next });
        updated += 1;
      }
    }
    return {
      examined: page.length,
      updated,
      isDone,
      continueCursor: isDone ? null : continueCursor,
    };
  },
});

export const rebuildContactGlobalSearchPage = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { limit, cursor }) => {
    const pageSize = Math.min(Math.max(1, limit ?? 500), 2000);
    const startCursor = cursor === undefined || cursor === null ? null : cursor;
    const { page, isDone, continueCursor } = await ctx.db
      .query("contacts")
      .order("asc")
      .paginate({ numItems: pageSize, cursor: startCursor });
    let updated = 0;
    for (const row of page) {
      const next = buildContactGlobalSearchText(row);
      if (row.globalSearchText !== next) {
        await ctx.db.patch(row._id, { globalSearchText: next });
        updated += 1;
      }
    }
    return {
      examined: page.length,
      updated,
      isDone,
      continueCursor: isDone ? null : continueCursor,
    };
  },
});

export const rebuildTaskGlobalSearchPage = mutation({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { limit, cursor }) => {
    const pageSize = Math.min(Math.max(1, limit ?? 500), 2000);
    const startCursor = cursor === undefined || cursor === null ? null : cursor;
    const { page, isDone, continueCursor } = await ctx.db
      .query("tasks")
      .order("asc")
      .paginate({ numItems: pageSize, cursor: startCursor });
    let updated = 0;
    for (const row of page) {
      const next = buildTaskGlobalSearchText(row);
      if (row.globalSearchText !== next) {
        await ctx.db.patch(row._id, { globalSearchText: next });
        updated += 1;
      }
    }
    return {
      examined: page.length,
      updated,
      isDone,
      continueCursor: isDone ? null : continueCursor,
    };
  },
});
