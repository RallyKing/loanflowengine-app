/**
 * Phase 14 Step 3 — capital stack loaders, rollups, loan sync helpers.
 */
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  computeProjectCapitalRollup,
  safeMoney,
  type CapitalRequirementRow,
  type CapitalSourceRow,
  type ProjectCapitalRollup,
} from "../lib/projectCapitalStack";

export async function listRequirementsForProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projectCapitalRequirements">[]> {
  const rows = await ctx.db
    .query("projectCapitalRequirements")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return rows.sort((a, b) => a.priorityOrder - b.priorityOrder);
}

export async function listSourcesForProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projectCapitalSources">[]> {
  const rows = await ctx.db
    .query("projectCapitalSources")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listAllocationsForProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projectCapitalAllocations">[]> {
  return await ctx.db
    .query("projectCapitalAllocations")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
}

async function resolveSourceAmountsForRollup(
  ctx: QueryCtx | MutationCtx,
  source: Doc<"projectCapitalSources">,
): Promise<{
  committedAmount: number;
  approvedAmount: number;
  fundedAmount: number;
  notes?: string;
}> {
  let approvedAmount = safeMoney(source.approvedAmount);
  let fundedAmount = safeMoney(source.fundedAmount);
  if (source.pipelineId) {
    const loan = await ctx.db.get(source.pipelineId);
    if (loan) {
      const loanFunding = safeMoney(loan.fundingAmount);
      if (loanFunding > 0) {
        approvedAmount = Math.max(approvedAmount, loanFunding);
        fundedAmount = Math.max(fundedAmount, loanFunding);
      }
    }
  }
  return {
    committedAmount: safeMoney(source.committedAmount),
    approvedAmount,
    fundedAmount,
    notes: source.notes,
  };
}

export async function buildProjectCapitalRollup(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<ProjectCapitalRollup> {
  const requirements = await listRequirementsForProject(ctx, projectId);
  const sources = await listSourcesForProject(ctx, projectId);
  const resolvedSources = await Promise.all(
    sources.map((s) => resolveSourceAmountsForRollup(ctx, s)),
  );
  return computeProjectCapitalRollup({
    projectId: String(projectId),
    requirements: requirements.map((r) => ({
      requiredAmount: r.requiredAmount,
      notes: r.notes,
    })),
    sources: sources.map((s, i) => ({
      ...resolvedSources[i]!,
      sourceType: s.sourceType,
    })),
  });
}

export async function loadProjectCapitalStackEditor(
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
): Promise<{
  rollup: ProjectCapitalRollup;
  requirements: CapitalRequirementRow[];
  sources: CapitalSourceRow[];
}> {
  const requirements = await listRequirementsForProject(ctx, project._id);
  const sources = await listSourcesForProject(ctx, project._id);
  const allocations = await listAllocationsForProject(ctx, project._id);

  const allocBySource = new Map<string, Record<string, number>>();
  for (const a of allocations) {
    const sid = String(a.sourceId);
    const map = allocBySource.get(sid) ?? {};
    map[String(a.requirementId)] = safeMoney(a.allocatedAmount);
    allocBySource.set(sid, map);
  }

  const sourceRows: CapitalSourceRow[] = [];
  for (const s of sources) {
    let pipelineFileName: string | undefined;
    let liveApproved = safeMoney(s.approvedAmount);
    let liveFunded = safeMoney(s.fundedAmount);
    if (s.pipelineId) {
      const loan = await ctx.db.get(s.pipelineId);
      if (loan) {
        pipelineFileName = loan.fileName?.trim() || "Loan file";
        const loanFunding = safeMoney(loan.fundingAmount);
        if (liveApproved === 0 && loanFunding > 0) liveApproved = loanFunding;
        if (liveFunded === 0 && loanFunding > 0) liveFunded = loanFunding;
      }
    }
    sourceRows.push({
      id: String(s._id),
      pipelineId: s.pipelineId ? String(s.pipelineId) : null,
      pipelineFileName,
      sourceType: s.sourceType,
      committedAmount: safeMoney(s.committedAmount),
      approvedAmount: liveApproved,
      fundedAmount: liveFunded,
      status: s.status,
      sortOrder: s.sortOrder,
      notes: s.notes,
      allocationByRequirementId: allocBySource.get(String(s._id)) ?? {},
    });
  }

  const rollup = computeProjectCapitalRollup({
    projectId: String(project._id),
    requirements: requirements.map((r) => ({
      requiredAmount: r.requiredAmount,
      notes: r.notes,
    })),
    sources: sourceRows.map((s) => ({
      sourceType: s.sourceType,
      committedAmount: s.committedAmount,
      approvedAmount: s.approvedAmount,
      fundedAmount: s.fundedAmount,
      notes: s.notes,
    })),
  });

  return {
    rollup,
    requirements: requirements.map((r) => ({
      id: String(r._id),
      capitalType: r.capitalType,
      requiredAmount: safeMoney(r.requiredAmount),
      priorityOrder: r.priorityOrder,
      notes: r.notes,
    })),
    sources: sourceRows,
  };
}

/** Push loan file funding into linked sources (non-destructive: only fills zero approved/funded). */
export async function syncCapitalSourcesFromProjectLoans(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<number> {
  const sources = await listSourcesForProject(ctx, projectId);
  const now = Date.now();
  let updated = 0;
  for (const source of sources) {
    if (!source.pipelineId) continue;
    const loan = await ctx.db.get(source.pipelineId);
    if (!loan) continue;
    const funding = safeMoney(loan.fundingAmount);
    const patch: Partial<Doc<"projectCapitalSources">> = { updatedAt: now };
    let changed = false;
    if (funding > 0 && safeMoney(source.approvedAmount) !== funding) {
      patch.approvedAmount = funding;
      changed = true;
    }
    if (funding > 0 && safeMoney(source.fundedAmount) !== funding) {
      patch.fundedAmount = funding;
      changed = true;
    }
    if (funding > 0 && source.status === "planned") {
      patch.status = "approved";
      changed = true;
    }
    if (changed) {
      await ctx.db.patch(source._id, patch);
      updated += 1;
    }
  }
  return updated;
}

export async function batchCapitalRollupsForProjects(
  ctx: QueryCtx,
  projectIds: Id<"projects">[],
): Promise<Map<string, ProjectCapitalRollup>> {
  const out = new Map<string, ProjectCapitalRollup>();
  await Promise.all(
    projectIds.map(async (pid) => {
      out.set(String(pid), await buildProjectCapitalRollup(ctx, pid));
    }),
  );
  return out;
}
