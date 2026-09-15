/**
 * Index-scoped, capped reads for the pipeline hub subscription.
 *
 * Every helper here replaces a full-table or org-wide `.collect()` that used to
 * run inside `pipeline:listTablePreview`. The rule this module enforces is:
 * a hub read is scoped to the *visible* file ids (or to the active org via an
 * index) and is always bounded by a cap from `lib/pipeline/tablePreviewReadBounds`.
 *
 * Nothing in this module schedules work, writes, or reads without an index.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID } from "./auth/platformGodMode";
import {
  PIPELINE_FILE_EDGE_SCAN_CAP,
  PIPELINE_FILE_RELATED_TASK_SCAN_CAP,
  readSaturated,
} from "../lib/pipeline/tablePreviewReadBounds";

/** Junction tables that carry a `by_file` index keyed on `fileId`. */
export type PipelineFileEdgeTable =
  | "fileClients"
  | "fileProjects"
  | "fileLenders"
  | "fileTeamMembers"
  | "fileTasks";

export type BoundedRead<T> = {
  rows: T[];
  /** True when at least one underlying read came back at its cap. */
  saturated: boolean;
};

function uniqueFileIds(
  fileIds: readonly Id<"pipeline">[],
): Id<"pipeline">[] {
  const seen = new Set<string>();
  const out: Id<"pipeline">[] = [];
  for (const id of fileIds) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

/**
 * Run one capped indexed read per file id and flatten the result.
 *
 * `read` must be an indexed, `.take(cap + 1)` query so saturation is detectable.
 */
async function takeAcrossFiles<T>(
  fileIds: readonly Id<"pipeline">[],
  cap: number,
  read: (fileId: Id<"pipeline">) => Promise<T[]>,
): Promise<BoundedRead<T>> {
  const ids = uniqueFileIds(fileIds);
  const perFile = await Promise.all(ids.map((id) => read(id)));
  let saturated = false;
  const rows: T[] = [];
  for (const bucket of perFile) {
    if (readSaturated(bucket.length, cap)) {
      saturated = true;
      rows.push(...bucket.slice(0, cap));
    } else {
      rows.push(...bucket);
    }
  }
  return { rows, saturated };
}

/**
 * Pipeline rows for one org, read through `by_organization_createdAt` and capped.
 *
 * Legacy rows predate org stamping (`pipeline.organizationId` is optional) and
 * `rowBelongsToOrganizationScope` treats them as belonging to the platform
 * default org, so they are fetched through the same index with an `undefined`
 * key rather than by scanning the table.
 *
 * Results are re-sorted by `_creationTime` desc to match the ordering the hub
 * previously received from `ctx.db.query("pipeline").order("desc")`.
 */
export async function loadOrgScopedPipelineRowsBounded(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cap: number,
): Promise<BoundedRead<Doc<"pipeline">>> {
  const scoped = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .take(cap + 1);

  const legacy =
    organizationId === PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID
      ? await ctx.db
          .query("pipeline")
          .withIndex("by_organization_createdAt", (q) =>
            q.eq("organizationId", undefined),
          )
          .order("desc")
          .take(cap + 1)
      : [];

  const saturated =
    readSaturated(scoped.length, cap) || readSaturated(legacy.length, cap);

  const merged = [...scoped, ...legacy].sort(
    (a, b) => b._creationTime - a._creationTime,
  );

  return { rows: merged.slice(0, cap), saturated };
}

/** `fileLenders` edges for the visible files only, via `by_file`. */
export async function loadFileLenderEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileLenders">>> {
  const orgStr = String(organizationId);
  const read = await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_EDGE_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("fileLenders")
        .withIndex("by_file", (q) => q.eq("fileId", fileId))
        .take(PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );
  return {
    rows: read.rows.filter((r) => String(r.organizationId) === orgStr),
    saturated: read.saturated,
  };
}

/** `fileClients` edges for the visible files only, via `by_file`. */
export async function loadFileClientEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileClients">>> {
  const orgStr = String(organizationId);
  const read = await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_EDGE_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("fileClients")
        .withIndex("by_file", (q) => q.eq("fileId", fileId))
        .take(PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );
  return {
    rows: read.rows.filter((r) => String(r.organizationId) === orgStr),
    saturated: read.saturated,
  };
}

/** `fileProjects` edges for the visible files only, via `by_file`. */
export async function loadFileProjectEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileProjects">>> {
  const orgStr = String(organizationId);
  const read = await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_EDGE_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("fileProjects")
        .withIndex("by_file", (q) => q.eq("fileId", fileId))
        .take(PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );
  return {
    rows: read.rows.filter((r) => String(r.organizationId) === orgStr),
    saturated: read.saturated,
  };
}

/** `fileTeamMembers` edges for the visible files only, via `by_file`. */
export async function loadFileTeamMemberEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileTeamMembers">>> {
  const orgStr = String(organizationId);
  const read = await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_EDGE_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("fileTeamMembers")
        .withIndex("by_file", (q) => q.eq("fileId", fileId))
        .take(PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );
  return {
    rows: read.rows.filter((r) => String(r.organizationId) === orgStr),
    saturated: read.saturated,
  };
}

/** `fileTasks` edges for the visible files only, via `by_file`. */
export async function loadFileTaskEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileTasks">>> {
  const orgStr = String(organizationId);
  const read = await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_EDGE_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("fileTasks")
        .withIndex("by_file", (q) => q.eq("fileId", fileId))
        .take(PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );
  return {
    rows: read.rows.filter((r) => String(r.organizationId) === orgStr),
    saturated: read.saturated,
  };
}

/** `contactFileLinks` for the visible files only, via `by_file`. */
export async function loadContactFileLinksForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
): Promise<BoundedRead<Doc<"contactFileLinks">>> {
  return await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_EDGE_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("contactFileLinks")
        .withIndex("by_file", (q) => q.eq("fileId", fileId))
        .take(PIPELINE_FILE_EDGE_SCAN_CAP + 1),
  );
}

/**
 * Tasks related to the visible files, via `tasks.by_relatedFile`.
 * Replaces an org-wide `tasks.by_organization` collect that was then discarded
 * down to these same files.
 */
export async function loadRelatedTasksForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"tasks">>> {
  const orgStr = String(organizationId);
  const read = await takeAcrossFiles(
    fileIds,
    PIPELINE_FILE_RELATED_TASK_SCAN_CAP,
    (fileId) =>
      ctx.db
        .query("tasks")
        .withIndex("by_relatedFile", (q) => q.eq("relatedFileId", fileId))
        .take(PIPELINE_FILE_RELATED_TASK_SCAN_CAP + 1),
  );
  return {
    rows: read.rows.filter((t) => String(t.organizationId) === orgStr),
    saturated: read.saturated,
  };
}
