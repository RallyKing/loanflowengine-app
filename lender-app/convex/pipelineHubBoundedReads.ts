/**
 * Index-scoped, capped reads for the pipeline hub subscription.
 *
 * Every helper here replaces a full-table or org-wide `.collect()` that used to
 * run inside `pipeline:listTablePreview`. The rule this module enforces is:
 * a hub read is scoped to the active org (via an index) and/or the *visible*
 * file ids, and is always bounded by a cap from `lib/pipeline/tablePreviewReadBounds`.
 *
 * Junction tables with `by_organization` are read **once per org** (then filtered
 * to the visible file set), not once per file. Per-file `by_file` fan-out remains
 * only for tables that lack an org index (`contactFileLinks`) and for triage's
 * `tasks.by_relatedFile` path.
 *
 * Nothing in this module schedules work, writes, or reads without an index.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  PIPELINE_FILE_EDGE_SCAN_CAP,
  PIPELINE_FILE_NOTE_SCAN_CAP,
  PIPELINE_FILE_RELATED_TASK_SCAN_CAP,
  PIPELINE_ORG_EDGE_SCAN_CAP,
  PIPELINE_ORG_RELATED_TASK_SCAN_CAP,
  readSaturated,
} from "../lib/pipeline/tablePreviewReadBounds";

/** Junction tables that carry both `by_file` and `by_organization` indexes. */
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
 * Prefer org-batched helpers when the table has `by_organization`.
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
 * One org-scoped, capped junction read, filtered to the visible file id set.
 * Replaces per-file `by_file` fan-out for hub joins.
 *
 * Implemented per-table (not a generic `query(table)`) so Convex index typing
 * stays sound after adding `by_organization`.
 */
async function loadOrgScopedFileLenders(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  fileIds: readonly Id<"pipeline">[],
): Promise<BoundedRead<Doc<"fileLenders">>> {
  const visible = new Set(uniqueFileIds(fileIds).map(String));
  const rows = await ctx.db
    .query("fileLenders")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(PIPELINE_ORG_EDGE_SCAN_CAP + 1);
  const saturated = readSaturated(rows.length, PIPELINE_ORG_EDGE_SCAN_CAP);
  const clipped = saturated ? rows.slice(0, PIPELINE_ORG_EDGE_SCAN_CAP) : rows;
  return {
    rows: clipped.filter((r) => visible.has(String(r.fileId))),
    saturated,
  };
}

async function loadOrgScopedFileClients(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  fileIds: readonly Id<"pipeline">[],
): Promise<BoundedRead<Doc<"fileClients">>> {
  const visible = new Set(uniqueFileIds(fileIds).map(String));
  const rows = await ctx.db
    .query("fileClients")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(PIPELINE_ORG_EDGE_SCAN_CAP + 1);
  const saturated = readSaturated(rows.length, PIPELINE_ORG_EDGE_SCAN_CAP);
  const clipped = saturated ? rows.slice(0, PIPELINE_ORG_EDGE_SCAN_CAP) : rows;
  return {
    rows: clipped.filter((r) => visible.has(String(r.fileId))),
    saturated,
  };
}

async function loadOrgScopedFileProjects(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  fileIds: readonly Id<"pipeline">[],
): Promise<BoundedRead<Doc<"fileProjects">>> {
  const visible = new Set(uniqueFileIds(fileIds).map(String));
  const rows = await ctx.db
    .query("fileProjects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(PIPELINE_ORG_EDGE_SCAN_CAP + 1);
  const saturated = readSaturated(rows.length, PIPELINE_ORG_EDGE_SCAN_CAP);
  const clipped = saturated ? rows.slice(0, PIPELINE_ORG_EDGE_SCAN_CAP) : rows;
  return {
    rows: clipped.filter((r) => visible.has(String(r.fileId))),
    saturated,
  };
}

async function loadOrgScopedFileTeamMembers(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  fileIds: readonly Id<"pipeline">[],
): Promise<BoundedRead<Doc<"fileTeamMembers">>> {
  const visible = new Set(uniqueFileIds(fileIds).map(String));
  const rows = await ctx.db
    .query("fileTeamMembers")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(PIPELINE_ORG_EDGE_SCAN_CAP + 1);
  const saturated = readSaturated(rows.length, PIPELINE_ORG_EDGE_SCAN_CAP);
  const clipped = saturated ? rows.slice(0, PIPELINE_ORG_EDGE_SCAN_CAP) : rows;
  return {
    rows: clipped.filter((r) => visible.has(String(r.fileId))),
    saturated,
  };
}

async function loadOrgScopedFileTasks(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  fileIds: readonly Id<"pipeline">[],
): Promise<BoundedRead<Doc<"fileTasks">>> {
  const visible = new Set(uniqueFileIds(fileIds).map(String));
  const rows = await ctx.db
    .query("fileTasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(PIPELINE_ORG_EDGE_SCAN_CAP + 1);
  const saturated = readSaturated(rows.length, PIPELINE_ORG_EDGE_SCAN_CAP);
  const clipped = saturated ? rows.slice(0, PIPELINE_ORG_EDGE_SCAN_CAP) : rows;
  return {
    rows: clipped.filter((r) => visible.has(String(r.fileId))),
    saturated,
  };
}

/**
 * Pipeline rows for one org, read through `by_organization_createdAt` and capped.
 *
 * Legacy rows predate org stamping (`pipeline.organizationId` is optional) and
 * `rowBelongsToOrganizationScope` treats them as belonging to the platform
 * default org. When `includeUnstampedLegacyRows` is set they are fetched
 * through the same index with an `undefined` key rather than by scanning.
 *
 * Results are re-sorted by `_creationTime` desc to match the ordering the hub
 * previously received from `ctx.db.query("pipeline").order("desc")`.
 */
export async function loadOrgScopedPipelineRowsBounded(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  cap: number,
  includeUnstampedLegacyRows: boolean,
): Promise<BoundedRead<Doc<"pipeline">>> {
  const scoped = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .take(cap + 1);

  const legacy = includeUnstampedLegacyRows
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

/** `fileLenders` edges for the visible files only, via org-batched `by_organization`. */
export async function loadFileLenderEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileLenders">>> {
  return await loadOrgScopedFileLenders(ctx, organizationId, fileIds);
}

/** `fileClients` edges for the visible files only, via org-batched `by_organization`. */
export async function loadFileClientEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileClients">>> {
  return await loadOrgScopedFileClients(ctx, organizationId, fileIds);
}

/** `fileProjects` edges for the visible files only, via org-batched `by_organization`. */
export async function loadFileProjectEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileProjects">>> {
  return await loadOrgScopedFileProjects(ctx, organizationId, fileIds);
}

/** `fileTeamMembers` edges for the visible files only, via org-batched `by_organization`. */
export async function loadFileTeamMemberEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileTeamMembers">>> {
  return await loadOrgScopedFileTeamMembers(ctx, organizationId, fileIds);
}

/** `fileTasks` edges for the visible files only, via org-batched `by_organization`. */
export async function loadFileTaskEdgesForFiles(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"fileTasks">>> {
  return await loadOrgScopedFileTasks(ctx, organizationId, fileIds);
}

/** `contactFileLinks` for the visible files only, via `by_file` (no org index). */
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
 * Tasks related to the visible files via one org-scoped `tasks.by_organization`
 * take, filtered to `relatedFileId ∈ visible`. Used by hub graph links so the
 * join stays O(1) queries instead of O(files).
 */
export async function loadRelatedTasksForVisibleFilesOrgBatched(
  ctx: QueryCtx,
  fileIds: readonly Id<"pipeline">[],
  organizationId: Id<"organizations">,
): Promise<BoundedRead<Doc<"tasks">>> {
  const visible = new Set(uniqueFileIds(fileIds).map(String));
  const rows = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .order("desc")
    .take(PIPELINE_ORG_RELATED_TASK_SCAN_CAP + 1);
  const saturated = readSaturated(rows.length, PIPELINE_ORG_RELATED_TASK_SCAN_CAP);
  const clipped = saturated
    ? rows.slice(0, PIPELINE_ORG_RELATED_TASK_SCAN_CAP)
    : rows;
  return {
    rows: clipped.filter(
      (t) =>
        t.relatedFileId != null && visible.has(String(t.relatedFileId)),
    ),
    saturated,
  };
}

/**
 * Tasks related to the visible files, via `tasks.by_relatedFile` (one capped
 * read per file). Used by hub triage so cost tracks visible files, not the
 * full org task range.
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

/**
 * Bounded note badge counts via `pipelineFileNotes.by_org_file`.
 * Takes `cap + 1` and saturates at `cap` so a missing denorm field can never
 * permanently lie as 0 while notes exist.
 */
export async function loadNoteCountsForFiles(
  ctx: QueryCtx,
  files: ReadonlyArray<{
    _id: Id<"pipeline">;
    organizationId?: Id<"organizations">;
  }>,
): Promise<Map<string, number>> {
  const targets: Array<{
    fileId: Id<"pipeline">;
    organizationId: Id<"organizations">;
  }> = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!file.organizationId) continue;
    const key = String(file._id);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ fileId: file._id, organizationId: file.organizationId });
  }
  const perFile = await Promise.all(
    targets.map(({ fileId, organizationId }) =>
      ctx.db
        .query("pipelineFileNotes")
        .withIndex("by_org_file", (q) =>
          q.eq("organizationId", organizationId).eq("pipelineFileId", fileId),
        )
        .take(PIPELINE_FILE_NOTE_SCAN_CAP + 1),
    ),
  );
  const counts = new Map<string, number>();
  perFile.forEach((notes, i) => {
    counts.set(
      String(targets[i]!.fileId),
      Math.min(notes.length, PIPELINE_FILE_NOTE_SCAN_CAP),
    );
  });
  return counts;
}
