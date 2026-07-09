/**
 * Phase 13.3 — Client/project rollup aggregates (subscription-friendly).
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  loadPipelineFilesForClient,
  loadPipelineFilesForProject,
  loadProjectsForClient,
} from "./pipelineHierarchyCompat";

const TERMINAL_STATUSES = new Set([
  "paid",
  "paying",
  "funded",
  "closed",
  "complete",
  "completed",
  "cancelled",
  "canceled",
  "dead",
  "lost",
]);

function fileFunding(row: Doc<"pipeline">): number {
  const n = row.fundingAmount;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

function fileCompletionPercent(row: Doc<"pipeline">): number {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (TERMINAL_STATUSES.has(status)) return 100;
  if (row.stageId) return 50;
  return 25;
}

export type ProjectRollup = {
  projectId: string;
  loanCount: number;
  stackFunding: number;
  completionPercent: number;
  activeStageMix: Record<string, number>;
};

export type ClientRollup = {
  clientId: string;
  projectCount: number;
  loanCount: number;
  aggregateFunding: number;
  completionPercent: number;
};

export async function computeProjectRollup(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  project?: Doc<"projects">,
): Promise<ProjectRollup> {
  const p =
    project ?? (await ctx.db.get(projectId));
  if (!p) {
    return {
      projectId: String(projectId),
      loanCount: 0,
      stackFunding: 0,
      completionPercent: 0,
      activeStageMix: {},
    };
  }
  const files = await loadPipelineFilesForProject(ctx, projectId);
  const active = files.filter((f) => !f.archivedAt);
  const activeStageMix: Record<string, number> = {};
  let stackFunding = 0;
  let completionSum = 0;
  for (const f of active) {
    stackFunding += fileFunding(f);
    completionSum += fileCompletionPercent(f);
    const key = f.stageId
      ? String(f.stageId)
      : String(f.status ?? "unknown").trim() || "unknown";
    activeStageMix[key] = (activeStageMix[key] ?? 0) + 1;
  }
  const loanCount = active.length;
  const stored = p.completionPercent;
  const computed =
    loanCount > 0 ? Math.round(completionSum / loanCount) : stored ?? 0;
  return {
    projectId: String(projectId),
    loanCount,
    stackFunding,
    completionPercent: computed,
    activeStageMix,
  };
}

export async function computeClientRollup(
  ctx: QueryCtx,
  clientId: Id<"clients">,
  client?: Doc<"clients">,
): Promise<ClientRollup> {
  const c = client ?? (await ctx.db.get(clientId));
  if (!c) {
    return {
      clientId: String(clientId),
      projectCount: 0,
      loanCount: 0,
      aggregateFunding: 0,
      completionPercent: 0,
    };
  }
  const projects = await loadProjectsForClient(ctx, clientId);
  const fkFiles = await loadPipelineFilesForClient(ctx, clientId);
  const seenFileIds = new Set(fkFiles.map((f) => String(f._id)));
  let loanCount = 0;
  let aggregateFunding = 0;
  let completionSum = 0;
  let completionN = 0;

  const countFiles = (files: Doc<"pipeline">[]) => {
    for (const f of files) {
      if (f.archivedAt) continue;
      loanCount += 1;
      aggregateFunding += fileFunding(f);
      completionSum += fileCompletionPercent(f);
      completionN += 1;
    }
  };

  countFiles(fkFiles);
  for (const proj of projects) {
    const projFiles = await loadPipelineFilesForProject(ctx, proj._id);
    for (const f of projFiles) {
      const id = String(f._id);
      if (seenFileIds.has(id)) continue;
      seenFileIds.add(id);
      if (f.archivedAt) continue;
      loanCount += 1;
      aggregateFunding += fileFunding(f);
      completionSum += fileCompletionPercent(f);
      completionN += 1;
    }
  }

  return {
    clientId: String(clientId),
    projectCount: projects.length,
    loanCount,
    aggregateFunding,
    completionPercent:
      completionN > 0 ? Math.round(completionSum / completionN) : 0,
  };
}
