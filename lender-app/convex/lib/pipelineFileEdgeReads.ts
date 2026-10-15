/**
 * Per-file junction / related-task reads for hub preview + triage.
 * Caps track `lib/pipeline/tablePreviewReadBounds.ts` so document cost scales
 * with visible files, not org-wide junction cardinality.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  PIPELINE_FILE_EDGE_SCAN_CAP,
  PIPELINE_FILE_RELATED_TASK_SCAN_CAP,
} from "../../lib/pipeline/tablePreviewReadBounds";

const EDGE_TAKE = PIPELINE_FILE_EDGE_SCAN_CAP;
const TASK_TAKE = PIPELINE_FILE_RELATED_TASK_SCAN_CAP;

export async function takeFileLendersForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"fileLenders">[]> {
  // bounded: per-file file↔lender edges (PIPELINE_FILE_EDGE_SCAN_CAP)
  return await ctx.db
    .query("fileLenders")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .take(EDGE_TAKE);
}

export async function takeContactFileLinksForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"contactFileLinks">[]> {
  // bounded: per-file contact↔file links (PIPELINE_FILE_EDGE_SCAN_CAP)
  return await ctx.db
    .query("contactFileLinks")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .take(EDGE_TAKE);
}

export async function takeFileClientsForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"fileClients">[]> {
  // bounded: per-file file↔client edges (PIPELINE_FILE_EDGE_SCAN_CAP)
  return await ctx.db
    .query("fileClients")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .take(EDGE_TAKE);
}

export async function takeFileProjectsForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"fileProjects">[]> {
  // bounded: per-file file↔project edges (PIPELINE_FILE_EDGE_SCAN_CAP)
  return await ctx.db
    .query("fileProjects")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .take(EDGE_TAKE);
}

export async function takeFileTeamMembersForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"fileTeamMembers">[]> {
  // bounded: per-file file↔team edges (PIPELINE_FILE_EDGE_SCAN_CAP)
  return await ctx.db
    .query("fileTeamMembers")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .take(EDGE_TAKE);
}

export async function takeFileTasksForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"fileTasks">[]> {
  // bounded: per-file file↔task edges (PIPELINE_FILE_EDGE_SCAN_CAP)
  return await ctx.db
    .query("fileTasks")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .take(EDGE_TAKE);
}

export async function takeRelatedTasksForFile(
  ctx: QueryCtx,
  fileId: Id<"pipeline">,
): Promise<Doc<"tasks">[]> {
  // bounded: per-file related tasks (PIPELINE_FILE_RELATED_TASK_SCAN_CAP)
  return await ctx.db
    .query("tasks")
    .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
    .take(TASK_TAKE);
}
