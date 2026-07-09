import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  evaluateAutomationCondition,
  MAX_PIPELINE_BLOCK_AUTOMATION_RULES_PER_EVENT,
  PIPELINE_BLOCK_AUTOMATION_RULES,
  triggerMatchesEvent,
  type PipelineAutomationDispatchEvent,
  type PipelineBlockAutomationRule,
} from "../lib/pipelineBlockAutomation";
import {
  buildLenderScenarioSeed,
  unhideDealWorkspaceTabInDealData,
} from "../lib/dealDataAutomationHelpers";
import { clampActivitySummary } from "../lib/pipelineFileActivityModel";
import { appendPctFeeRecomputeForLoanChange } from "./pipelineFeeRecompute";
import { appendPipelineFileActivity } from "./pipelineFileActivity";

export type PipelineAutomationRunOptions = {
  ctx: MutationCtx;
  fileId: Id<"pipeline">;
  /** Row before this mutation’s primary writes (caller may reload after). */
  existing: Doc<"pipeline">;
  event: PipelineAutomationDispatchEvent;
  now: number;
  /**
   * In-flight patch for `fileSharedState.patchShared` — fee automation mutates this
   * object before the caller persists it.
   */
  patchObj?: Partial<Doc<"pipeline">>;
  /** Next canonical funding after a shared-bus edit (for pct-fee recompute). */
  nextFundingForBus?: number;
};

/**
 * Single-pass automation runner: **no nested passes**, at most
 * `MAX_PIPELINE_BLOCK_AUTOMATION_RULES_PER_EVENT` rules may apply side effects.
 */
export async function runPipelineBlockAutomations(
  opts: PipelineAutomationRunOptions,
): Promise<{ appliedRuleIds: string[] }> {
  const applied: string[] = [];
  let appliedCount = 0;
  let row = opts.existing;

  for (const rule of PIPELINE_BLOCK_AUTOMATION_RULES) {
    if (appliedCount >= MAX_PIPELINE_BLOCK_AUTOMATION_RULES_PER_EVENT) break;
    if (!triggerMatchesEvent(rule, opts.event)) continue;

    const scenarioEmpty = !row.scenario || !String(row.scenario).trim();
    const hasDealData =
      row.dealData != null &&
      typeof row.dealData === "object" &&
      !Array.isArray(row.dealData);

    const condOk = evaluateAutomationCondition(rule.condition, {
      hasDealData,
      scenarioEmpty,
      contactIsNewLink:
        opts.event.type === "contact_linked"
          ? opts.event.isNewLink
          : undefined,
      contactRoleNorm:
        opts.event.type === "contact_linked"
          ? opts.event.role.trim().toLowerCase()
          : undefined,
    });
    if (!condOk) continue;

    const did = await applyAutomationAction(rule, opts, row);
    if (!did) continue;
    applied.push(rule.id);
    appliedCount += 1;
    const fresh = await opts.ctx.db.get(opts.fileId);
    if (fresh) row = fresh;
  }

  return { appliedRuleIds: applied };
}

async function applyAutomationAction(
  rule: PipelineBlockAutomationRule,
  opts: PipelineAutomationRunOptions,
  file: Doc<"pipeline">,
): Promise<boolean> {
  const act = rule.action;
  const { ctx, fileId, now } = opts;

  if (act.type === "recompute_pct_fee_totals_from_loan") {
    if (opts.event.type !== "shared_fields_changed") return false;
    if (opts.event.feeContext !== "patch_shared") return false;
    if (!opts.patchObj || opts.nextFundingForBus === undefined) return false;
    if (!opts.event.changedKeys.includes("fundingAmount")) return false;
    appendPctFeeRecomputeForLoanChange(
      file,
      opts.patchObj,
      opts.nextFundingForBus,
      { now },
    );
    return true;
  }

  if (act.type === "unhide_deal_workspace_tab_for_contact_role") {
    if (opts.event.type !== "contact_linked") return false;
    const roleNorm = opts.event.role.trim().toLowerCase();
    const nextDeal = unhideDealWorkspaceTabInDealData(
      file.dealData,
      roleNorm,
      act.fallbackTab,
    );
    if (nextDeal === file.dealData) return false;
    await ctx.db.patch(fileId, {
      dealData: nextDeal as Doc<"pipeline">["dealData"],
      createdAt: file.createdAt,
      updatedAt: now,
    });
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "automation",
      keys: ["dealData", "dealWorkspaceLayout"],
      summary: clampActivitySummary("Automation: deal workspace tab unhidden"),
    });
    return true;
  }

  if (act.type === "prefill_scenario_from_lender") {
    if (
      opts.event.type !== "lender_selected" &&
      opts.event.type !== "lender_attached"
    ) {
      return false;
    }
    const lenderId = opts.event.lenderId as Id<"lenders">;
    const lender = await ctx.db.get(lenderId);
    if (!lender) return false;
    const seed = buildLenderScenarioSeed(lender, act.maxLen);
    if (!seed) return false;
    await ctx.db.patch(fileId, {
      scenario: seed,
      createdAt: file.createdAt,
      updatedAt: now,
    });
    await appendPipelineFileActivity(ctx, {
      fileId,
      at: now,
      kind: "automation",
      keys: ["scenario"],
      summary: clampActivitySummary("Automation: scenario prefilled from lender"),
    });
    return true;
  }

  return false;
}
