/**
 * Phase 14 Step 1 — idempotent primary junction backfill (additive only).
 */
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  detectMultiClientDrift,
  ensurePrimaryLoanClientLink,
  ensurePrimaryProjectClientLink,
  type MultiClientDriftIssue,
} from "./pipelineMultiClientLinks";

export type MultiClientBackfillAnalyze = {
  projectCount: number;
  pipelineWithClientCount: number;
  existingProjectClientLinks: number;
  existingLoanClientLinks: number;
  driftIssues: MultiClientDriftIssue[];
  abortOnDrift: boolean;
};

export type MultiClientBackfillExecute = {
  dryRun: boolean;
  projectPrimaryInserted: number;
  projectPrimaryAlreadyPresent: number;
  loanPrimaryInserted: number;
  loanPrimaryAlreadyPresent: number;
  loanPrimarySkippedNoClient: number;
  driftAfter: MultiClientDriftIssue[];
  aborted: boolean;
  abortReason: string | null;
};

export async function analyzeMultiClientBackfill(
  ctx: QueryCtx | MutationCtx,
): Promise<MultiClientBackfillAnalyze> {
  const driftIssues = await detectMultiClientDrift(ctx);
  const projects = await ctx.db.query("projects").collect();
  const files = await ctx.db.query("pipeline").collect();
  const projectLinks = await ctx.db.query("projectClients").collect();
  const loanLinks = await ctx.db.query("loanClients").collect();
  return {
    projectCount: projects.length,
    pipelineWithClientCount: files.filter((f) => f.clientId != null).length,
    existingProjectClientLinks: projectLinks.length,
    existingLoanClientLinks: loanLinks.length,
    driftIssues,
    abortOnDrift: driftIssues.length > 0,
  };
}

export async function executeMultiClientBackfill(
  ctx: MutationCtx,
  opts: { dryRun?: boolean },
): Promise<MultiClientBackfillExecute> {
  const dryRun = opts.dryRun === true;
  const preDrift = await detectMultiClientDrift(ctx);
  if (preDrift.length > 0) {
    return {
      dryRun,
      projectPrimaryInserted: 0,
      projectPrimaryAlreadyPresent: 0,
      loanPrimaryInserted: 0,
      loanPrimaryAlreadyPresent: 0,
      loanPrimarySkippedNoClient: 0,
      driftAfter: preDrift,
      aborted: true,
      abortReason: `pre_backfill_drift:${preDrift.length}`,
    };
  }

  let projectPrimaryInserted = 0;
  let projectPrimaryAlreadyPresent = 0;
  let loanPrimaryInserted = 0;
  let loanPrimaryAlreadyPresent = 0;
  let loanPrimarySkippedNoClient = 0;

  const projects = await ctx.db.query("projects").collect();
  for (const project of projects) {
    if (dryRun) {
      projectPrimaryAlreadyPresent += 1;
      continue;
    }
    const result = await ensurePrimaryProjectClientLink(ctx, project);
    if (result === "inserted") projectPrimaryInserted += 1;
    else projectPrimaryAlreadyPresent += 1;
  }

  const files = await ctx.db.query("pipeline").collect();
  for (const file of files) {
    if (!file.clientId) {
      loanPrimarySkippedNoClient += 1;
      continue;
    }
    if (dryRun) {
      loanPrimaryAlreadyPresent += 1;
      continue;
    }
    const result = await ensurePrimaryLoanClientLink(ctx, file);
    if (result === "inserted") loanPrimaryInserted += 1;
    else if (result === "skipped") loanPrimarySkippedNoClient += 1;
    else loanPrimaryAlreadyPresent += 1;
  }

  const driftAfter = await detectMultiClientDrift(ctx);
  return {
    dryRun,
    projectPrimaryInserted,
    projectPrimaryAlreadyPresent,
    loanPrimaryInserted,
    loanPrimaryAlreadyPresent,
    loanPrimarySkippedNoClient,
    driftAfter,
    aborted: driftAfter.length > 0,
    abortReason:
      driftAfter.length > 0 ? `post_backfill_drift:${driftAfter.length}` : null,
  };
}

export type MultiClientIntegrityCounts = {
  projects: number;
  projectClients: number;
  pipelineWithClientId: number;
  loanClients: number;
  projectsMissingPrimaryLink: number;
  loansMissingPrimaryLink: number;
  duplicateProjectClientPairs: number;
  duplicateLoanClientPairs: number;
};

export async function captureMultiClientIntegrity(
  ctx: QueryCtx | MutationCtx,
): Promise<MultiClientIntegrityCounts> {
  const projects = await ctx.db.query("projects").collect();
  const projectLinks = await ctx.db.query("projectClients").collect();
  const files = await ctx.db.query("pipeline").collect();
  const loanLinks = await ctx.db.query("loanClients").collect();

  let projectsMissingPrimaryLink = 0;
  for (const project of projects) {
    const has = projectLinks.some(
      (l) =>
        String(l.projectId) === String(project._id) &&
        String(l.clientId) === String(project.clientId) &&
        l.relationshipType === "primary",
    );
    if (!has) projectsMissingPrimaryLink += 1;
  }

  let loansMissingPrimaryLink = 0;
  const withClient = files.filter((f) => f.clientId != null);
  for (const file of withClient) {
    const has = loanLinks.some(
      (l) =>
        String(l.pipelineId) === String(file._id) &&
        String(l.clientId) === String(file.clientId) &&
        l.relationshipType === "primary",
    );
    if (!has) loansMissingPrimaryLink += 1;
  }

  const projPair = new Set(projectLinks.map((l) => `${l.projectId}:${l.clientId}`));
  const loanPair = new Set(loanLinks.map((l) => `${l.pipelineId}:${l.clientId}`));

  return {
    projects: projects.length,
    projectClients: projectLinks.length,
    pipelineWithClientId: withClient.length,
    loanClients: loanLinks.length,
    projectsMissingPrimaryLink,
    loansMissingPrimaryLink,
    duplicateProjectClientPairs: projectLinks.length - projPair.size,
    duplicateLoanClientPairs: loanLinks.length - loanPair.size,
  };
}
