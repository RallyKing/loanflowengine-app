import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { PipelineDrawerSectionId } from "@/lib/pipelineDrawerLayoutStorage";
import { DEFAULT_PIPELINE_DRAWER_ORDER } from "@/lib/pipelineDrawerLayoutStorage";
import type { DealTabId } from "@/lib/file/dealTabGroups";
import { DEFAULT_DEAL_WORKSPACE_TAB_ORDER } from "@/lib/file/dealWorkspaceLayout";
import type { DealAnalysisSectionId } from "@/lib/file/dealAnalysisLayoutStorage";
import { DEFAULT_DEAL_ANALYSIS_ORDER } from "@/lib/file/dealAnalysisLayoutStorage";
import { deriveIntake } from "@/lib/intake/derivations";
import { resolvePipelineTableFundingAmount } from "@/lib/pipeline/resolvePipelineTableFundingAmount";
type Sheet = Doc<"intakeSheets">;
type Pipeline = Doc<"pipeline">;

const MAX_RECURSE_DEPTH = 14;
const MAX_NODES = 600;

/** Count “filled” primitive leaves and shallow structure (arrays/objects) for section richness. */
export function countFilledDataNodes(root: unknown): number {
  const budget = { n: MAX_NODES, hits: 0 };
  walk(root, 0, budget, new WeakSet<object>());
  return budget.hits;
}

function walk(
  value: unknown,
  depth: number,
  budget: { n: number; hits: number },
  seen: WeakSet<object>
): void {
  if (budget.n <= 0 || depth > MAX_RECURSE_DEPTH) return;
  if (value === null || value === undefined) return;

  if (typeof value === "boolean") {
    if (value) {
      budget.hits++;
      budget.n--;
    }
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value) && value !== 0) {
      budget.hits++;
      budget.n--;
    }
    return;
  }
  if (typeof value === "string") {
    if (value.trim().length > 0) {
      budget.hits++;
      budget.n--;
    }
    return;
  }
  if (typeof value === "bigint") {
    budget.hits++;
    budget.n--;
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return;
    let i = 0;
    for (const el of value) {
      if (budget.n <= 0) break;
      i++;
      if (i > 240) break;
      walk(el, depth + 1, budget, seen);
    }
    return;
  }

  if (typeof value === "object") {
    const o = value as object;
    if (seen.has(o)) return;
    seen.add(o);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("_")) continue;
      if (budget.n <= 0) break;
      walk(v, depth + 1, budget, seen);
    }
  }
}

export type TermOptionRowLite = {
  rate: string;
  term: string;
  prepaymentPenalty: string;
  notes: string;
  appraisalRequired?: boolean;
  newLoanAmount?: string;
  fundingTimeframe?: string;
  qualifyingIncomeType?: string;
  includeQualifyingIncomeAmount?: boolean;
  qualifyingIncomeAmount?: string;
};

export type PipelineDrawerMetricsContext = {
  pipeline: Pipeline;
  termOptions: TermOptionRowLite[];
  licenseLo: string;
  licenseBroker: string;
  linkedTaskCount: number;
  associatedContactLinkCount: number;
  /** Optional embedded / linked intake-shaped payload for deal workspace density. */
  dealSheet: Sheet | null;
};

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(s && String(s).trim().length > 0);
}

/** Field-like count for a pipeline file drawer chrome section. */
export function pipelineDrawerSectionFieldCount(
  sid: PipelineDrawerSectionId,
  ctx: PipelineDrawerMetricsContext
): number {
  const p = ctx.pipeline;
  let hits = 0;

  const bump = (cond: boolean) => {
    if (cond) hits++;
  };

  switch (sid) {
    case "fileDetails": {
      bump(nonEmpty(p.fileName));
      bump(nonEmpty(p.term));
      bump(
        resolvePipelineTableFundingAmount(ctx.dealSheet, p) > 0,
      );
      bump(p.rate > 0);
      bump(nonEmpty(p.propertyAddress));
      bump(nonEmpty(p.scenario));
      return hits;
    }
    case "fileNotes": {
      bump(nonEmpty(p.notes));
      return hits;
    }
    case "dealWorkspace": {
      if (!ctx.dealSheet) return 0;
      let t = 0;
      for (const tab of DEFAULT_DEAL_WORKSPACE_TAB_ORDER) {
        t += dealTabFieldCount(tab, ctx.dealSheet);
      }
      return Math.min(t, MAX_NODES);
    }
    case "licensing": {
      bump(nonEmpty(ctx.licenseLo));
      bump(nonEmpty(ctx.licenseBroker));
      return hits;
    }
    case "scenarioMatch": {
      let c = 0;
      if (nonEmpty(p.scenario)) c++;
      if (p.scenarioCriteria && typeof p.scenarioCriteria === "object") {
        c += Math.min(countFilledDataNodes(p.scenarioCriteria), 80);
      }
      c += p.lenders?.length ?? 0;
      return c;
    }
    case "generateTerms": {
      for (const row of ctx.termOptions) {
        if (
          nonEmpty(row.rate) ||
          nonEmpty(row.term) ||
          nonEmpty(row.prepaymentPenalty) ||
          nonEmpty(row.notes) ||
          row.appraisalRequired === true ||
          nonEmpty(row.newLoanAmount) ||
          nonEmpty(row.fundingTimeframe) ||
          nonEmpty(row.qualifyingIncomeType) ||
          row.includeQualifyingIncomeAmount === true ||
          nonEmpty(row.qualifyingIncomeAmount)
        ) {
          hits++;
        }
      }
      return hits;
    }
    case "lenders": {
      return p.lenders?.length ?? 0;
    }
    case "contacts": {
      return ctx.associatedContactLinkCount;
    }
    case "feesSplits": {
      const splits = p.splits ?? [];
      for (const s of splits) {
        if (nonEmpty(s.name) || (s.amount ?? 0) !== 0 || nonEmpty(s.reason))
          hits++;
      }
      return hits;
    }
    case "tasks": {
      return Math.min(ctx.linkedTaskCount, 200);
    }
    case "people": {
      bump(nonEmpty(p.assigneeId));
      bump((p.sharedWithIds?.length ?? 0) > 0);
      return hits;
    }
    case "archive": {
      bump(p.archivedAt != null);
      return hits;
    }
    case "dangerZone": {
      return 0;
    }
    /* Phase Modular-C — opt-in blocks store data outside the pipeline row. */
    case "constructionBudget":
    case "investorExperience":
    case "pfs":
    case "trackRecord":
    case "simplePl": {
      return 0;
    }
    default: {
      const _exhaustive: never = sid;
      return _exhaustive;
    }
  }
}

export function buildPipelineDrawerMetricsContext(args: {
  pipeline: Pipeline;
  termOptions: TermOptionRowLite[];
  licenseLo: string;
  licenseBroker: string;
  linkedTasks: { _id: Id<"tasks"> }[] | undefined;
  associatedContactLinkCount: number;
  dealSheet: Sheet | null;
}): PipelineDrawerMetricsContext {
  return {
    pipeline: args.pipeline,
    termOptions: args.termOptions,
    licenseLo: args.licenseLo,
    licenseBroker: args.licenseBroker,
    linkedTaskCount: args.linkedTasks?.length ?? 0,
    associatedContactLinkCount: args.associatedContactLinkCount,
    dealSheet: args.dealSheet,
  };
}

/** Count filled fields for one deal workspace tab (intake-shaped `draft`). */
export function dealTabFieldCount(tabId: DealTabId, draft: Sheet): number {
  switch (tabId) {
    case "cover":
      return countFilledDataNodes({
        dealType: draft.dealType,
        cover: draft.cover,
      });
    case "scenario": {
      const di = deriveIntake(draft);
      return (
        countFilledDataNodes(draft.scenario) +
        countFilledDataNodes({
          totalIncome: di.totalIncome,
          oldPI: di.oldPI,
          oldPITIA: di.oldPITIA,
          liabilitiesMonthly: di.liabilitiesMonthly,
          borrowersJoined: di.borrowersJoined,
          subjectAddress: di.subjectAddress,
          subjectValue: di.subjectValue,
          proposedLoanAmount: di.proposedLoanAmount,
        })
      );
    }
    case "overview":
      return countFilledDataNodes({
        leadId: draft.leadId,
        fileName: draft.fileName,
        sourceType: draft.sourceType,
        fundingType: draft.fundingType,
        accountExecutive: draft.accountExecutive,
        ownerName: draft.ownerName,
        startDate: draft.startDate,
        fundedDate: draft.fundedDate,
        occupancy: draft.occupancy,
        occupancyOther: draft.occupancyOther,
        propertiesOwned: draft.propertiesOwned,
        citizenship: draft.citizenship,
        defaultJudgments: draft.defaultJudgments,
        bkHistory: draft.bkHistory,
        bkDate: draft.bkDate,
        latePaymentsLast12: draft.latePaymentsLast12,
      });
    case "borrowers":
      return countFilledDataNodes(draft.borrowers);
    case "guarantors":
      return countFilledDataNodes(draft.guarantors);
    case "business":
      return countFilledDataNodes(draft.business);
    case "property":
      return countFilledDataNodes({
        subjectProperty: draft.subjectProperty,
        primaryProperty: draft.primaryProperty,
      });
    case "commercial":
      return countFilledDataNodes(draft.commercial);
    case "hardmoney":
      return countFilledDataNodes(draft.hardMoney);
    case "loans":
      return countFilledDataNodes(draft.loans);
    case "income":
      return countFilledDataNodes(draft.incomeRows);
    case "assets":
      return countFilledDataNodes({ assets: draft.assets, liabilities: draft.liabilities });
    case "household":
      return countFilledDataNodes({
        dependentsCount: draft.dependentsCount,
        dependentsAges: draft.dependentsAges,
      });
    case "workflow":
      return countFilledDataNodes(draft.workflow);
    case "notes":
      return countFilledDataNodes({
        primaryObjective: draft.primaryObjective,
        additionalNotes: draft.additionalNotes,
      });
    case "reo":
      return countFilledDataNodes(draft.reo);
    case "analysis": {
      let t = 0;
      for (const id of DEFAULT_DEAL_ANALYSIS_ORDER) {
        t += dealAnalysisToolFieldCount(id, draft);
      }
      return t;
    }
    case "fees":
      return countFilledDataNodes(draft.fees);
    default: {
      const _e: never = tabId;
      return _e;
    }
  }
}

/** Per-tool field density inside the Analysis workspace. */
export function dealAnalysisToolFieldCount(
  toolId: DealAnalysisSectionId,
  draft: Sheet
): number {
  switch (toolId) {
    case "dti":
      return (
        countFilledDataNodes(draft.dtiInstances) +
        countFilledDataNodes(draft.dti)
      );
    case "comparison":
      return (
        countFilledDataNodes(draft.comparisonInstances) +
        countFilledDataNodes(draft.comparison)
      );
    case "weighted":
      return (
        countFilledDataNodes(draft.weightedInterestInstances) +
        countFilledDataNodes(draft.weightedInterest)
      );
    case "payoff":
      return (
        countFilledDataNodes(draft.payoffInstances) +
        countFilledDataNodes(draft.payoff)
      );
    case "daycounter":
      return (
        countFilledDataNodes(draft.dayCounterInstances) +
        countFilledDataNodes(draft.dayCounter)
      );
    default: {
      const _e: never = toolId;
      return _e;
    }
  }
}

/** Used only to satisfy exhaustive checks; all known drawer ids are handled above. */
export function allPipelineDrawerSectionIds(): PipelineDrawerSectionId[] {
  return [...DEFAULT_PIPELINE_DRAWER_ORDER];
}
