import { isDealBackedPipelineRow } from "@/lib/pipeline/dealBackedRow";
import { resolvePipelineTableFundingAmount } from "@/lib/pipeline/resolvePipelineTableFundingAmount";
import {
  buildCoverScenarioFundingAlerts,
  buildPipelineFundingMirrorAlerts,
} from "@/lib/intelligentAlerts";
import { toNumber } from "@/lib/intake/finance";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  countFilledDataNodes,
  type PipelineDrawerMetricsContext,
} from "@/lib/file/fileSectionMetrics";
import type {
  PipelineFileSectionId,
  PipelineDrawerSectionId,
} from "@/lib/pipelineDrawerLayoutStorage";

/**
 * Stored under `UserPreferencesV1.behaviorSettings[PIPELINE_FILE_EXPAND_UX_KEY]`.
 * Versioned so future settings can extend the shape without breaking parsers.
 */
export const PIPELINE_FILE_EXPAND_UX_KEY = "pipelineFileExpandUx" as const;

export type PipelineFileExpandUxRulesV1 = {
  v: 1;
  /**
   * After baseline expand/collapse (e.g. all closed), also expand the first
   * visible drawer block in layout order.
   */
  expandFirstVisibleBlock?: boolean;
  /**
   * After baseline, also expand blocks that have attention-worthy signals
   * (funding/consistency alerts, missing licenses on deal-backed files, etc.).
   */
  expandBlocksWithActionSignals?: boolean;
};

export type PipelineFileExpandActionHints = {
  dealBacked?: boolean;
  /** Count of intelligent alerts shown at top of file details (mirror / consistency). */
  fileDetailsAlertCount?: number;
};

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(s && String(s).trim().length > 0);
}

export function parsePipelineFileExpandUxRules(
  raw: unknown,
): PipelineFileExpandUxRulesV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const expandFirstVisibleBlock = o.expandFirstVisibleBlock === true;
  const expandBlocksWithActionSignals = o.expandBlocksWithActionSignals === true;
  if (!expandFirstVisibleBlock && !expandBlocksWithActionSignals) return null;
  return {
    v: 1,
    ...(expandFirstVisibleBlock ? { expandFirstVisibleBlock: true } : {}),
    ...(expandBlocksWithActionSignals
      ? { expandBlocksWithActionSignals: true }
      : {}),
  };
}

export function readPipelineFileExpandUxRules(
  behaviorSettings: Record<string, unknown> | undefined,
): PipelineFileExpandUxRulesV1 | null {
  if (!behaviorSettings || typeof behaviorSettings !== "object") return null;
  return parsePipelineFileExpandUxRules(
    behaviorSettings[PIPELINE_FILE_EXPAND_UX_KEY],
  );
}

/** Same signals as file-details intelligent callouts (for expand-UX in the live drawer). */
export function countFileDetailsActionAlertsForExpandUx(args: {
  dealBacked: boolean;
  pipelineFunding: number;
  resolvedFromDeal: number;
  dealSheet: Doc<"intakeSheets"> | null;
}): number {
  const mirror = buildPipelineFundingMirrorAlerts({
    dealBacked: args.dealBacked,
    pipelineFunding: args.pipelineFunding,
    resolvedFromDeal: args.resolvedFromDeal,
  });
  let consistency: ReturnType<typeof buildCoverScenarioFundingAlerts> = [];
  if (args.dealSheet) {
    const cover = args.dealSheet.cover ?? {};
    const scenario = args.dealSheet.scenario;
    consistency = buildCoverScenarioFundingAlerts({
      coverFunding: toNumber(
        (cover as Record<string, unknown>).fundingAmount as
          | string
          | number
          | null
          | undefined,
      ),
      scenarioProposed: toNumber(
        scenario?.proposedLoanAmount as string | number | null | undefined,
      ),
    });
  }
  const seen = new Set<string>();
  let n = 0;
  for (const a of [...mirror, ...consistency]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    n++;
  }
  return n;
}

export function buildPipelineFileExpandActionHints(
  ctx: PipelineDrawerMetricsContext,
): PipelineFileExpandActionHints {
  const p = ctx.pipeline;
  const dealBacked = isDealBackedPipelineRow({
    dealData: p.dealData,
    intakeSheetId: p.intakeSheetId,
  });
  const pipelineFunding =
    typeof p.fundingAmount === "number" && Number.isFinite(p.fundingAmount)
      ? p.fundingAmount
      : 0;
  const resolvedFromDeal = resolvePipelineTableFundingAmount(
    ctx.dealSheet,
    p,
  );
  return {
    dealBacked,
    fileDetailsAlertCount: countFileDetailsActionAlertsForExpandUx({
      dealBacked,
      pipelineFunding,
      resolvedFromDeal,
      dealSheet: ctx.dealSheet,
    }),
  };
}

function dealBackedFromMetrics(ctx: PipelineDrawerMetricsContext): boolean {
  const p = ctx.pipeline;
  return isDealBackedPipelineRow({
    dealData: p.dealData,
    intakeSheetId: p.intakeSheetId,
  });
}

/**
 * Heuristic “needs attention” for auto-expand. Keep conservative; extend as product adds signals.
 */
export function pipelineDrawerBlockHasActionSignals(
  sid: PipelineDrawerSectionId,
  ctx: PipelineDrawerMetricsContext,
  hints?: PipelineFileExpandActionHints | null,
): boolean {
  const dealBacked = hints?.dealBacked ?? dealBackedFromMetrics(ctx);

  switch (sid) {
    case "fileDetails": {
      const n = hints?.fileDetailsAlertCount ?? 0;
      return n > 0;
    }
    case "licensing": {
      if (!dealBacked) return false;
      return (
        !nonEmpty(ctx.licenseLo) &&
        !nonEmpty(ctx.licenseBroker)
      );
    }
    case "scenarioMatch": {
      const p = ctx.pipeline;
      const hasScenario =
        Boolean(p.scenario?.trim()) ||
        (p.scenarioCriteria != null &&
          countFilledDataNodes(p.scenarioCriteria) > 0);
      const noLenders = (p.lenders?.length ?? 0) === 0;
      return hasScenario && noLenders;
    }
    default:
      return false;
  }
}

/**
 * Additive: only sets `true` for sections matching optional UX rules; never forces sections closed.
 * Does not expand header strips (deal messages / email / documents) unless keyed explicitly later.
 */
export function applyPipelineFileExpandUxToExpanded(
  expanded: Partial<Record<PipelineFileSectionId, boolean>>,
  rules: PipelineFileExpandUxRulesV1 | null,
  args: {
    visibleBlockIds: readonly PipelineDrawerSectionId[];
    metricsCtx: PipelineDrawerMetricsContext;
    actionHints?: PipelineFileExpandActionHints | null;
  },
): Partial<Record<PipelineFileSectionId, boolean>> {
  if (!rules) return expanded;

  const out: Partial<Record<PipelineFileSectionId, boolean>> = { ...expanded };

  if (rules.expandFirstVisibleBlock && args.visibleBlockIds.length > 0) {
    out[args.visibleBlockIds[0]] = true;
  }

  if (rules.expandBlocksWithActionSignals) {
    for (const sid of args.visibleBlockIds) {
      if (
        pipelineDrawerBlockHasActionSignals(
          sid,
          args.metricsCtx,
          args.actionHints,
        )
      ) {
        out[sid] = true;
      }
    }
  }

  return out;
}
