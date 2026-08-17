import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertOrgMember,
  resolveMemberUserKey,
} from "./organizationAccess";
import { pipelineFileReadable } from "./resourceAccess";
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

/**
 * Phase 24.2A — reactive triage bubbling (no colors stored on files/projects/clients).
 *
 * Task → file (max severityWeight among labeled open tasks on file)
 * File → project (max among file winners in project)
 * Project → client (max among project winners under client)
 */
async function buildHubTriageHighlightMap(
  ctx: Parameters<typeof assertOrgMember>[0],
  organizationId: Id<"organizations">,
  memberUserKey: string,
  nowBucket: number | undefined,
): Promise<HubTriageHighlightMapResult> {
  const presets = await readTaskColorPresetsForOrg(ctx, organizationId);
  const triageLabels = await loadTriageLabelsForOrg(ctx, organizationId);
  const now = resolveTriageEvaluationTime(nowBucket);

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .collect();

  /** Phase 24.5 — triage bubbles use pipeline file read ACL, not task ownership. */
  const fileReadableCache = new Map<string, boolean>();
  async function viewerCanReadTaskFile(fileId: Id<"pipeline">): Promise<boolean> {
    const cacheKey = String(fileId);
    if (fileReadableCache.has(cacheKey)) {
      return fileReadableCache.get(cacheKey)!;
    }
    const file = await ctx.db.get(fileId);
    if (!file || file.organizationId !== organizationId) {
      fileReadableCache.set(cacheKey, false);
      return false;
    }
    const ok = await pipelineFileReadable(ctx, file, memberUserKey);
    fileReadableCache.set(cacheKey, ok);
    return ok;
  }

  const files: Record<string, TriageHighlightEntry> = {};
  const fileCounts: Record<string, TaskRollupCounts> = {};
  const fileMeta = new Map<
    Id<"pipeline">,
    { projectKey: string; clientKey: string }
  >();

  async function ensureFileMeta(fileId: Id<"pipeline">): Promise<void> {
    if (fileMeta.has(fileId)) return;
    const file = await ctx.db.get(fileId);
    if (!file) return;
    try {
      const hierarchy = await safeResolveFileHierarchy(ctx, file);
      fileMeta.set(fileId, {
        projectKey: hubProjectKeyFromHierarchy(hierarchy),
        clientKey: hubClientKeyFromHierarchy(hierarchy),
      });
    } catch {
      /* hierarchy unresolved — file-level data still returned */
    }
  }

  for (const task of tasks) {
    if (!task.relatedFileId) continue;

    const isOpen = task.status === "todo" || task.status === "in_progress";
    const isSnoozedNow =
      typeof task.snoozedUntil === "number" && task.snoozedUntil > now;
    const countsOpen = isOpen && !isSnoozedNow;
    const isLabeledBubble =
      taskParticipatesInTriageBubble(task, now) && Boolean(task.triageLabelId);

    if (!countsOpen && !isLabeledBubble) continue;
    if (!(await viewerCanReadTaskFile(task.relatedFileId))) continue;

    const fileId = task.relatedFileId;
    const fileKey = String(fileId);

    if (countsOpen) {
      const overdue =
        typeof task.dueDate === "number" && task.dueDate < now ? 1 : 0;
      fileCounts[fileKey] = mergeRollupCounts(fileCounts[fileKey], {
        open: 1,
        overdue,
        topStatus: task.status === "in_progress" ? "in_progress" : "todo",
      });
      await ensureFileMeta(fileId);
    }

    if (isLabeledBubble && task.triageLabelId) {
      const label = triageLabels.get(String(task.triageLabelId));
      if (!label) continue;
      const entry = buildEntry(task, label, presets);
      if (!entry) continue;
      files[fileKey] = pickStrongerEntry(files[fileKey], entry);
      await ensureFileMeta(fileId);
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

/** File-level highlight (workspace + loan stack). */
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
    const map = await buildHubTriageHighlightMap(
      ctx,
      args.organizationId,
      key,
      bucket,
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
