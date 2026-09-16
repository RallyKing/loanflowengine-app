import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertOrgMember,
  filterPipelineByOrgScope,
  filterPipelineRowsForMember,
  resolveMemberUserKey,
} from "./organizationAccess";
import { pipelineFileReadable } from "./resourceAccess";
import { readTaskColorPresetsForOrg } from "./organizationSettings";
import { loadTriageLabelsForOrg } from "./organizationTriageLabels";
import { safeResolveFileHierarchy } from "./pipelineHierarchyCompat";
import {
  loadOrgScopedPipelineRowsBounded,
  loadRelatedTasksForFiles,
} from "./pipelineHubBoundedReads";
import { PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID } from "./auth/platformGodMode";
import { PIPELINE_TABLE_PREVIEW_MAX_ROWS } from "../lib/pipeline/tablePreviewReadBounds";
import {
  hubClientKeyFromHierarchy,
  hubClientKeyFromRowFields,
  hubProjectKeyFromHierarchy,
  hubProjectKeyFromRowFields,
} from "../lib/pipeline/hubHierarchyKeys";
import { lookupTaskColorPreset } from "../lib/taskColorPresets";
import { normalizeTriageLabelHex, resolveTriageLabelHex } from "../lib/triageLabelColor";
import { resolveTriageEvaluationTime } from "../lib/triageClock";
import { isCurrentlySnoozed as pipelineIsCurrentlySnoozed } from "../lib/pipelineSnooze";
import { resolveTriageLabelSeverityWeight } from "../lib/pipeline/triageSeverityWeight";
import {
  emptyProjectedHubTriageHighlightMap,
  projectHubTriageHighlightMap,
  type HubTriageFileCandidate,
  type HubTriageLabelCandidate,
  type HubTriageOpenCandidate,
  type ProjectedHubTriageHighlightMap,
} from "../lib/pipeline/projectHubTriageHighlightMap";

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

const triageTimeArgs = {
  /**
   * Optional minute bucket for one-shot / legacy callers.
   * Hub subscription omits this so args stay cache-stable; the client projects
   * `fileCandidates` against TriageClockProvider instead.
   */
  nowBucket: v.optional(v.number()),
  /** @deprecated Alias for `nowBucket`. */
  currentTriageTime: v.optional(v.number()),
};

/** @deprecated Prefer string-shaped entries from projected maps / candidates. */
export type TriageHighlightEntry = {
  triageLabelId: Id<"organizationTriageLabels">;
  label: string;
  colorToken: string;
  severityWeight: number;
  sourceTaskId: Id<"tasks">;
  sourceTaskTitle: string;
  hexCode: string;
};

/** Phase Modular-D — open/overdue roll-up counts alongside triage colors. */
export type TaskRollupCounts = {
  open: number;
  overdue: number;
  topStatus: "todo" | "in_progress" | null;
};

export type HubTriageHighlightMapResult = ProjectedHubTriageHighlightMap & {
  /**
   * Time-stable candidates. Hub UI projects these with a local clock so
   * schedule / snooze / overdue refresh without minute Convex resubscribes.
   */
  fileCandidates: HubTriageFileCandidate[];
};

const emptyMap = (): HubTriageHighlightMapResult => ({
  ...emptyProjectedHubTriageHighlightMap(),
  fileCandidates: [],
});

function buildLabelCandidate(
  task: Doc<"tasks">,
  label: Doc<"organizationTriageLabels">,
  presets: Awaited<ReturnType<typeof readTaskColorPresetsForOrg>>,
): HubTriageLabelCandidate | null {
  const colorToken = label.colorId.trim();
  const hexCode = resolveTriageLabelHex(label, presets);
  if (!normalizeTriageLabelHex(hexCode) && !lookupTaskColorPreset(presets, colorToken)) {
    return null;
  }
  const candidate: HubTriageLabelCandidate = {
    triageLabelId: String(label._id),
    label: label.label.trim(),
    colorToken,
    severityWeight: resolveTriageLabelSeverityWeight(label),
    sourceTaskId: String(task._id),
    sourceTaskTitle: task.title.trim(),
    hexCode,
  };
  if (typeof task.scheduledTriggerTime === "number") {
    candidate.scheduledTriggerTime = task.scheduledTriggerTime;
  }
  if (typeof task.snoozedUntil === "number") {
    candidate.snoozedUntil = task.snoozedUntil;
  }
  return candidate;
}

/**
 * Hub-visible pipeline files for triage — same row set / ACL as listTablePreview
 * (archive/snooze excluded by default).
 *
 * File-level snooze still uses evaluation time at query run; wake-up of a
 * snoozed *file* requires a write (or listTablePreview refresh). Task-level
 * schedule/snooze/overdue are projected on the client from candidates.
 */
async function loadHubVisiblePipelineFilesForTriage(
  ctx: Parameters<typeof assertOrgMember>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string,
  now: number,
): Promise<Doc<"pipeline">[]> {
  const { rows } = await loadOrgScopedPipelineRowsBounded(
    ctx,
    organizationId,
    PIPELINE_TABLE_PREVIEW_MAX_ROWS,
    organizationId === PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID,
  );
  const filtered = rows.filter((r) => {
    if (r.archivedAt != null) return false;
    if (pipelineIsCurrentlySnoozed(r.snoozedUntil, now)) return false;
    return true;
  });
  const orgScoped = filterPipelineByOrgScope(filtered, organizationId);
  return await filterPipelineRowsForMember(
    ctx,
    orgScoped,
    organizationId,
    memberUserKey,
  );
}

/**
 * Collect time-stable per-file candidates (no schedule/snooze/overdue gating).
 * Scoped to hub-visible files, then `tasks.by_relatedFile` — never org-wide.
 */
async function collectHubTriageFileCandidates(
  ctx: Parameters<typeof assertOrgMember>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string,
  scopeFileIds?: ReadonlyArray<Id<"pipeline">>,
): Promise<HubTriageFileCandidate[]> {
  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const triageLabels = await loadTriageLabelsForOrg(ctx, organizationId);
  // File set uses a query-time clock only for pipeline-file snooze alignment with
  // listTablePreview; task time gates stay on the client.
  const fileSetNow = Date.now();

  const visibleFiles = scopeFileIds?.length
    ? (
        await Promise.all(scopeFileIds.map((id) => ctx.db.get(id)))
      ).filter((f): f is Doc<"pipeline"> => {
        if (!f) return false;
        if (f.organizationId && f.organizationId !== organizationId) return false;
        return true;
      })
    : await loadHubVisiblePipelineFilesForTriage(
        ctx,
        organizationId,
        memberUserKey,
        fileSetNow,
      );

  if (visibleFiles.length === 0) return [];

  const visibleById = new Map(visibleFiles.map((f) => [String(f._id), f]));
  const { rows: tasks } = await loadRelatedTasksForFiles(
    ctx,
    visibleFiles.map((f) => f._id),
    organizationId,
  );

  const byFile = new Map<
    string,
    {
      projectKey: string;
      clientKey: string;
      labels: HubTriageLabelCandidate[];
      open: HubTriageOpenCandidate[];
    }
  >();

  async function ensureFileBucket(fileId: Id<"pipeline">): Promise<
    | {
        projectKey: string;
        clientKey: string;
        labels: HubTriageLabelCandidate[];
        open: HubTriageOpenCandidate[];
      }
    | undefined
  > {
    const key = String(fileId);
    const existing = byFile.get(key);
    if (existing) return existing;
    const file = visibleById.get(key);
    if (!file) return undefined;

    let projectKey = "";
    let clientKey = "";
    if (file.clientId || file.projectId) {
      projectKey = hubProjectKeyFromRowFields({
        clientId: file.clientId ? String(file.clientId) : null,
        projectId: file.projectId ? String(file.projectId) : null,
        clientDisplayName: null,
        projectDisplayTitle: null,
      });
      clientKey = hubClientKeyFromRowFields({
        clientId: file.clientId ? String(file.clientId) : null,
        clientDisplayName: null,
      });
    } else {
      try {
        const hierarchy = await safeResolveFileHierarchy(ctx, file);
        projectKey = hubProjectKeyFromHierarchy(hierarchy);
        clientKey = hubClientKeyFromHierarchy(hierarchy);
      } catch {
        /* hierarchy unresolved — file-level data still returned */
      }
    }

    const bucket = { projectKey, clientKey, labels: [], open: [] };
    byFile.set(key, bucket);
    return bucket;
  }

  for (const task of tasks) {
    if (!task.relatedFileId) continue;
    if (!visibleById.has(String(task.relatedFileId))) continue;

    const isOpen = task.status === "todo" || task.status === "in_progress";
    if (!isOpen) continue;

    const bucket = await ensureFileBucket(task.relatedFileId);
    if (!bucket) continue;

    const openCandidate: HubTriageOpenCandidate = {
      status: task.status === "in_progress" ? "in_progress" : "todo",
    };
    if (typeof task.dueDate === "number") openCandidate.dueDate = task.dueDate;
    if (typeof task.snoozedUntil === "number") {
      openCandidate.snoozedUntil = task.snoozedUntil;
    }
    bucket.open.push(openCandidate);

    if (task.triageLabelId) {
      const label = triageLabels.get(String(task.triageLabelId));
      if (!label) continue;
      const candidate = buildLabelCandidate(task, label, presets);
      if (!candidate) continue;
      bucket.labels.push(candidate);
    }
  }

  return [...byFile.entries()].map(([fileId, bucket]) => ({
    fileId,
    projectKey: bucket.projectKey,
    clientKey: bucket.clientKey,
    labels: bucket.labels,
    open: bucket.open,
  }));
}

async function buildHubTriageHighlightMap(
  ctx: Parameters<typeof assertOrgMember>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string,
  nowBucket: number,
  scopeFileIds?: ReadonlyArray<Id<"pipeline">>,
): Promise<HubTriageHighlightMapResult> {
  const fileCandidates = await collectHubTriageFileCandidates(
    ctx,
    organizationId,
    memberUserKey,
    scopeFileIds,
  );
  const now = resolveTriageEvaluationTime(nowBucket);
  const projected = projectHubTriageHighlightMap(fileCandidates, now);
  return { ...projected, fileCandidates };
}

/** Batch map for hub, board, and workspace — one subscription bubbles file → project → client. */
export const getHubTriageHighlightMap = query({
  args: { ...orgArgs, ...triageTimeArgs },
  handler: async (ctx, args) => {
    const empty = emptyMap();
    try {
      const key = await resolveMemberUserKey(ctx, args.memberUserKey);
      if (!key) return empty;
      await assertOrgMember(ctx, args.organizationId, key);
      /**
       * Prefer collecting time-stable candidates. When a legacy `nowBucket` is
       * supplied, also project server-side for that snapshot; the hub client
       * re-projects from `fileCandidates` with TriageClockProvider either way.
       */
      const fileCandidates = await collectHubTriageFileCandidates(
        ctx,
        args.organizationId,
        key,
      );
      const bucket = args.nowBucket ?? args.currentTriageTime;
      if (bucket != null) {
        const projected = projectHubTriageHighlightMap(
          fileCandidates,
          resolveTriageEvaluationTime(bucket),
        );
        return { ...projected, fileCandidates };
      }
      // Stable-args path: leave projected maps empty; client projects locally.
      return { ...emptyProjectedHubTriageHighlightMap(), fileCandidates };
    } catch (error) {
      console.error("[getHubTriageHighlightMap] failed", {
        organizationId: args.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }
  },
});

/** File-level highlight (workspace + loan stack) — scoped to one file, not the full hub map. */
export const getFileTriageHighlight = query({
  args: {
    ...orgArgs,
    ...triageTimeArgs,
    pipelineFileId: v.id("pipeline"),
  },
  handler: async (ctx, args) => {
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!key) return null;
    await assertOrgMember(ctx, args.organizationId, key);
    const file = await ctx.db.get(args.pipelineFileId);
    if (!file || file.organizationId !== args.organizationId) return null;
    if (!(await pipelineFileReadable(ctx, file, key))) return null;
    const bucket = args.nowBucket ?? args.currentTriageTime ?? Date.now();
    const map = await buildHubTriageHighlightMap(
      ctx,
      args.organizationId,
      key,
      bucket,
      [args.pipelineFileId],
    );
    return map.files[String(args.pipelineFileId)] ?? null;
  },
});

/** @deprecated Prefer `getHubTriageHighlightMap` + client-side lookup. */
export const getHierarchyHighlights = query({
  args: {
    ...orgArgs,
    ...triageTimeArgs,
    clientId: v.optional(v.string()),
    projectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = await resolveMemberUserKey(ctx, args.memberUserKey);
    if (!key) return null;
    await assertOrgMember(ctx, args.organizationId, key);
    const bucket = args.nowBucket ?? args.currentTriageTime ?? Date.now();
    const map = await buildHubTriageHighlightMap(
      ctx,
      args.organizationId,
      key,
      bucket,
    );
    if (args.clientId?.trim()) {
      return map.clients[args.clientId.trim()] ?? null;
    }
    if (args.projectId?.trim()) {
      return map.projects[args.projectId.trim()] ?? null;
    }
    return null;
  },
});
