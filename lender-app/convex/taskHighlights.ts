import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertOrgMember,
  filterPipelineRowsForMember,
  pipelineFileReadable,
  resolveMemberUserKey,
} from "./organizationAccess";
import { readTaskColorPresetsForOrg } from "./organizationSettings";
import { loadTriageLabelsForOrg } from "./organizationTriageLabels";
import { safeResolveFileHierarchy } from "./pipelineHierarchyCompat";
import {
  hubClientKeyFromHierarchy,
  hubProjectKeyFromHierarchy,
} from "../lib/pipeline/hubHierarchyKeys";
import { lookupTaskColorPreset } from "../lib/taskColorPresets";
import { normalizeTriageLabelHex, resolveTriageLabelHex } from "../lib/triageLabelColor";
import { taskParticipatesInTriageBubble } from "../lib/pipeline/triageHighlightParticipation";
import { resolveTriageLabelSeverityWeight } from "../lib/pipeline/triageSeverityWeight";
import { resolveTriageEvaluationTime } from "../lib/triageClock";
import { takeRelatedTasksForFile } from "./lib/pipelineFileEdgeReads";
import { PIPELINE_TABLE_PREVIEW_MAX_ROWS } from "../lib/pipeline/tablePreviewReadBounds";
import { PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID } from "./auth/platformGodMode";

/** Parallelize per-file task takes without one giant Promise.all on huge hubs. */
const HUB_TRIAGE_FILE_BATCH = 64;

const orgArgs = {
  organizationId: v.id("organizations"),
  memberUserKey: v.optional(v.string()),
};

const triageTimeArgs = {
  /**
   * Minute bucket from `TriageClockProvider`. Required in practice — these
   * handlers never read the wall clock, so an omitted bucket evaluates as
   * "nothing due yet" (see `resolveTriageEvaluationTime`).
   */
  nowBucket: v.optional(v.number()),
  /** @deprecated Alias for `nowBucket`. */
  currentTriageTime: v.optional(v.number()),
};

/** Client minute bucket, never the server clock — keeps these queries cacheable. */
function triageBucketFromArgs(args: {
  nowBucket?: number;
  currentTriageTime?: number;
}): number | undefined {
  return args.nowBucket ?? args.currentTriageTime;
}

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

export type HubTriageHighlightMapResult = {
  files: Record<string, TriageHighlightEntry>;
  projects: Record<string, TriageHighlightEntry>;
  clients: Record<string, TriageHighlightEntry>;
  counts: {
    files: Record<string, TaskRollupCounts>;
    projects: Record<string, TaskRollupCounts>;
    clients: Record<string, TaskRollupCounts>;
  };
};

const emptyMap = (): HubTriageHighlightMapResult => ({
  files: {},
  projects: {},
  clients: {},
  counts: { files: {}, projects: {}, clients: {} },
});

function mergeRollupCounts(
  current: TaskRollupCounts | undefined,
  add: TaskRollupCounts,
): TaskRollupCounts {
  if (!current) return { ...add };
  return {
    open: current.open + add.open,
    overdue: current.overdue + add.overdue,
    topStatus:
      current.topStatus === "in_progress" || add.topStatus === "in_progress"
        ? "in_progress"
        : (current.topStatus ?? add.topStatus),
  };
}

function pickStrongerEntry(
  current: TriageHighlightEntry | undefined,
  candidate: TriageHighlightEntry,
): TriageHighlightEntry {
  if (!current) return candidate;
  if (candidate.severityWeight > current.severityWeight) return candidate;
  if (candidate.severityWeight < current.severityWeight) return current;
  return String(candidate.sourceTaskId) > String(current.sourceTaskId)
    ? candidate
    : current;
}

function buildEntry(
  task: Doc<"tasks">,
  label: Doc<"organizationTriageLabels">,
  presets: Awaited<ReturnType<typeof readTaskColorPresetsForOrg>>,
): TriageHighlightEntry | null {
  const colorToken = label.colorId.trim();
  const hexCode = resolveTriageLabelHex(label, presets);
  if (!normalizeTriageLabelHex(hexCode) && !lookupTaskColorPreset(presets, colorToken)) {
    return null;
  }
  return {
    triageLabelId: label._id,
    label: label.label.trim(),
    colorToken,
    severityWeight: resolveTriageLabelSeverityWeight(label),
    sourceTaskId: task._id,
    sourceTaskTitle: task.title.trim(),
    hexCode,
  };
}

/** Visible hub files for triage — capped, ACL-filtered, no org-wide task scan. */
async function loadVisibleHubFilesForTriage(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
): Promise<Doc<"pipeline">[]> {
  // bounded: hub triage file set (PIPELINE_TABLE_PREVIEW_MAX_ROWS)
  const scoped = await ctx.db
    .query("pipeline")
    .withIndex("by_organization_createdAt", (q) =>
      q.eq("organizationId", organizationId),
    )
    .order("desc")
    .take(PIPELINE_TABLE_PREVIEW_MAX_ROWS);
  const withLegacy =
    organizationId === PRIMARY_PLATFORM_DEFAULT_ORGANIZATION_ID
      ? scoped.concat(
          await ctx.db
            .query("pipeline")
            .withIndex("by_organization_createdAt", (q) =>
              q.eq("organizationId", undefined),
            )
            .order("desc")
            .take(PIPELINE_TABLE_PREVIEW_MAX_ROWS),
        )
      : scoped;
  withLegacy.sort((a, b) => b._creationTime - a._creationTime);
  const active = withLegacy.filter((r) => r.archivedAt == null);
  const visible = await filterPipelineRowsForMember(
    ctx,
    active,
    organizationId,
    memberUserKey,
  );
  return visible.slice(0, PIPELINE_TABLE_PREVIEW_MAX_ROWS);
}

/**
 * Phase 24.2A — reactive triage bubbling (no colors stored on files/projects/clients).
 *
 * Task → file (max severityWeight among labeled open tasks on file)
 * File → project (max among file winners in project)
 * Project → client (max among project winners under client)
 *
 * Tasks are loaded per visible file via `by_relatedFile` (capped), never
 * org-wide `tasks.by_organization` collect.
 */
/**
 * Prefer stamped clientId+projectId for bubble keys (matches hub tree for
 * record-backed rows). Partial stamps still fall through to hierarchy so
 * synthetic legacy keys stay correct.
 */
function fileMetaFromStampedIds(
  file: Doc<"pipeline">,
): { projectKey: string; clientKey: string } | null {
  if (file.clientId && file.projectId) {
    return {
      clientKey: String(file.clientId),
      projectKey: String(file.projectId),
    };
  }
  return null;
}

async function buildHubTriageHighlightMap(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  nowBucket: number | undefined,
): Promise<HubTriageHighlightMapResult> {
  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const triageLabels = await loadTriageLabelsForOrg(ctx, organizationId);
  const now = resolveTriageEvaluationTime(nowBucket);

  const visibleFiles = await loadVisibleHubFilesForTriage(
    ctx,
    organizationId,
    memberUserKey,
  );

  const files: Record<string, TriageHighlightEntry> = {};
  const fileCounts: Record<string, TaskRollupCounts> = {};
  const fileMeta = new Map<
    Id<"pipeline">,
    { projectKey: string; clientKey: string }
  >();

  async function ensureFileMeta(file: Doc<"pipeline">): Promise<void> {
    if (fileMeta.has(file._id)) return;
    const stamped = fileMetaFromStampedIds(file);
    if (stamped) {
      fileMeta.set(file._id, stamped);
      return;
    }
    try {
      const hierarchy = await safeResolveFileHierarchy(ctx, file);
      fileMeta.set(file._id, {
        projectKey: hubProjectKeyFromHierarchy(hierarchy),
        clientKey: hubClientKeyFromHierarchy(hierarchy),
      });
    } catch {
      /* hierarchy unresolved — file-level data still returned */
    }
  }

  // Was a sequential `for await` over every visible file — dominant triage
  // latency once per-file `by_relatedFile` takes replaced the org task scan.
  for (let i = 0; i < visibleFiles.length; i += HUB_TRIAGE_FILE_BATCH) {
    const batch = visibleFiles.slice(i, i + HUB_TRIAGE_FILE_BATCH);
    const loaded = await Promise.all(
      batch.map(async (file) => ({
        file,
        tasks: await takeRelatedTasksForFile(ctx, file._id),
      })),
    );

    for (const { file, tasks } of loaded) {
      const fileKey = String(file._id);

      for (const task of tasks) {
        if (task.organizationId !== organizationId) continue;

        const isOpen = task.status === "todo" || task.status === "in_progress";
        const isSnoozedNow =
          typeof task.snoozedUntil === "number" && task.snoozedUntil > now;
        const countsOpen = isOpen && !isSnoozedNow;
        const isLabeledBubble =
          taskParticipatesInTriageBubble(task, now) &&
          Boolean(task.triageLabelId);

        if (!countsOpen && !isLabeledBubble) continue;

        if (countsOpen) {
          const overdue =
            typeof task.dueDate === "number" && task.dueDate < now ? 1 : 0;
          fileCounts[fileKey] = mergeRollupCounts(fileCounts[fileKey], {
            open: 1,
            overdue,
            topStatus: task.status === "in_progress" ? "in_progress" : "todo",
          });
          await ensureFileMeta(file);
        }

        if (isLabeledBubble && task.triageLabelId) {
          const label = triageLabels.get(String(task.triageLabelId));
          if (!label) continue;
          const entry = buildEntry(task, label, presets);
          if (!entry) continue;
          files[fileKey] = pickStrongerEntry(files[fileKey], entry);
          await ensureFileMeta(file);
        }
      }
    }
  }

  const projects: Record<string, TriageHighlightEntry> = {};
  const projectToClient = new Map<string, string>();

  for (const [fileId, entry] of Object.entries(files)) {
    const meta = fileMeta.get(fileId as Id<"pipeline">);
    if (!meta) continue;
    projects[meta.projectKey] = pickStrongerEntry(
      projects[meta.projectKey],
      entry,
    );
    projectToClient.set(meta.projectKey, meta.clientKey);
  }

  const clients: Record<string, TriageHighlightEntry> = {};
  for (const [projectKey, entry] of Object.entries(projects)) {
    const clientKey = projectToClient.get(projectKey);
    if (!clientKey) continue;
    clients[clientKey] = pickStrongerEntry(clients[clientKey], entry);
  }

  const projectCounts: Record<string, TaskRollupCounts> = {};
  const clientCounts: Record<string, TaskRollupCounts> = {};
  for (const [fileId, rollup] of Object.entries(fileCounts)) {
    const meta = fileMeta.get(fileId as Id<"pipeline">);
    if (!meta) continue;
    projectCounts[meta.projectKey] = mergeRollupCounts(
      projectCounts[meta.projectKey],
      rollup,
    );
    clientCounts[meta.clientKey] = mergeRollupCounts(
      clientCounts[meta.clientKey],
      rollup,
    );
  }

  return {
    files,
    projects,
    clients,
    counts: { files: fileCounts, projects: projectCounts, clients: clientCounts },
  };
}

/** Single-file triage — `by_relatedFile` only; never builds the hub map. */
async function buildFileTriageHighlight(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  memberUserKey: string,
  pipelineFileId: Id<"pipeline">,
  nowBucket: number | undefined,
): Promise<TriageHighlightEntry | null> {
  const file = await ctx.db.get(pipelineFileId);
  if (!file || file.organizationId !== organizationId) return null;
  if (!(await pipelineFileReadable(ctx, file, memberUserKey))) return null;

  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const triageLabels = await loadTriageLabelsForOrg(ctx, organizationId);
  const now = resolveTriageEvaluationTime(nowBucket);
  const tasks = await takeRelatedTasksForFile(ctx, pipelineFileId);

  let winner: TriageHighlightEntry | null = null;
  for (const task of tasks) {
    if (task.organizationId !== organizationId) continue;
    if (!taskParticipatesInTriageBubble(task, now) || !task.triageLabelId) {
      continue;
    }
    const label = triageLabels.get(String(task.triageLabelId));
    if (!label) continue;
    const entry = buildEntry(task, label, presets);
    if (!entry) continue;
    winner = pickStrongerEntry(winner ?? undefined, entry);
  }
  return winner;
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
      const bucket = triageBucketFromArgs(args);
      return await buildHubTriageHighlightMap(
        ctx,
        args.organizationId,
        key,
        bucket,
      );
    } catch (error) {
      console.error("[getHubTriageHighlightMap] failed", {
        organizationId: args.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return empty;
    }
  },
});

/** File-level highlight (workspace + loan stack) — file-scoped reads only. */
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
    const bucket = triageBucketFromArgs(args);
    return await buildFileTriageHighlight(
      ctx,
      args.organizationId,
      key,
      args.pipelineFileId,
      bucket,
    );
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
    const bucket = triageBucketFromArgs(args);
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
