/**
 * Centralized file overview: metrics + prioritized alerts + drawer recommendations.
 * Pure logic — format currency/dates in the UI layer.
 */

import type { Doc } from "../convex/_generated/dataModel";
import { normalizeDtiInstances } from "./intake/analysisInstances";
import { computeDtiMetrics } from "./intake/dtiCompute";
import { deriveIntake } from "./intake/derivations";
import { toNumber } from "./intake/finance";
import type { DrawerVisibilitySignals } from "./pipelineBlockVisibility";
import {
  computeRuleBasedDrawerBlockSuggestions,
  computeWorkflowDrawerHints,
  listHiddenBlocksEligibleToShow,
  mergeSuggestionListsOrdered,
} from "./pipelineBlockRecommendations";
import type { PipelineBlockId } from "./pipelineBlockRegistry";
import { getPipelineBlock } from "./pipelineBlockRegistry";
import { isDealBackedPipelineRow } from "@/lib/pipeline/dealBackedRow";
import {
  buildContactFileAlerts,
  buildCoverScenarioFundingAlerts,
  buildDealIdentityAlerts,
  buildDtiToolAlerts,
  buildPipelineFundingMirrorAlerts,
  buildScenarioRiskAlerts,
  type IntelligentAlert,
} from "./intelligentAlerts";
import type { PipelineDrawerLayoutV1 } from "./pipelineDrawerLayoutStorage";
import type { UserSimpleWorkflowRule } from "./userWorkflowsModel";

export type FileHealthTier = "strong" | "needs_attention" | "at_risk";

export type FileInsightSeverity = "warning" | "info" | "tip";

export type FileInsightRow = {
  id: string;
  category: "alert" | "recommendation";
  severity: FileInsightSeverity;
  title: string;
  detail?: string;
  /** Drawer block to open when using “Go to” */
  targetSection?: PipelineBlockId;
};

export type FileInsightMetric = {
  id: string;
  label: string;
  /** Prefer `text` when set */
  text?: string;
  amount?: number;
};

export type PipelineFileInsightsSnapshot = {
  healthTier: FileHealthTier;
  healthSummary: string;
  metrics: FileInsightMetric[];
  items: FileInsightRow[];
};

const CRITICAL_ALERT_IDS = new Set<string>([
  "missing-client",
  "missing-project",
  "funding-cover-scenario-mismatch",
  "dti-back-high",
  "scenario-cashout-high-cltv",
  "scenario-cltv-very-high",
  "dti-no-income",
]);

/** Map intelligent alert id → primary drawer section for navigation */
const ALERT_TARGET_SECTION: Partial<Record<string, PipelineBlockId>> = {
  "missing-client": "dealWorkspace",
  "missing-project": "dealWorkspace",
  "funding-cover-scenario-mismatch": "dealWorkspace",
  "funding-scenario-empty": "dealWorkspace",
  "funding-cover-empty": "dealWorkspace",
  "contacts-missing": "contacts",
  "pipeline-funding-drift": "fileDetails",
  "dti-no-income": "dealWorkspace",
  "dti-back-high": "dealWorkspace",
  "dti-back-elevated": "dealWorkspace",
  "dti-front-fha": "dealWorkspace",
  "scenario-cashout-high-cltv": "dealWorkspace",
  "scenario-cltv-very-high": "dealWorkspace",
  "scenario-fico-low-purchase": "dealWorkspace",
};

function alertToRows(alerts: readonly IntelligentAlert[]): FileInsightRow[] {
  return alerts.map((a) => ({
    id: a.id,
    category: "alert" as const,
    severity: a.severity === "warning" ? "warning" : "info",
    title: a.message,
    detail: a.detail,
    targetSection: ALERT_TARGET_SECTION[a.id],
  }));
}

export function evaluateFileHealthTier(items: readonly FileInsightRow[]): {
  healthTier: FileHealthTier;
  healthSummary: string;
} {
  const alerts = items.filter((x) => x.category === "alert");
  const warnings = alerts.filter((x) => x.severity === "warning");
  const critical = warnings.filter((x) => CRITICAL_ALERT_IDS.has(x.id));

  if (critical.length >= 1 || warnings.length >= 3) {
    return {
      healthTier: "at_risk",
      healthSummary:
        "Several items need attention before this file is ready to shop or close.",
    };
  }
  if (warnings.length >= 1 || alerts.filter((x) => x.severity === "info").length >= 4) {
    return {
      healthTier: "needs_attention",
      healthSummary:
        "Good progress — a quick pass on the notes below will tighten the file.",
    };
  }
  return {
    healthTier: "strong",
    healthSummary:
      "Core data looks consistent for the information entered so far.",
  };
}

function severityRank(s: FileInsightSeverity): number {
  if (s === "warning") return 0;
  if (s === "info") return 1;
  return 2;
}

function sortItems(items: FileInsightRow[]): FileInsightRow[] {
  return [...items].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === "alert" ? -1 : 1;
    }
    const dr = severityRank(a.severity) - severityRank(b.severity);
    if (dr !== 0) return dr;
    return a.title.localeCompare(b.title);
  });
}

export type BuildPipelineFileInsightsArgs = {
  pipeline: Doc<"pipeline">;
  dealSheet: Doc<"intakeSheets"> | null;
  resolvedFunding: number;
  associatedContactLinkCount: number;
  drawerLayout: PipelineDrawerLayoutV1;
  visibilitySignals?: DrawerVisibilitySignals | null;
  focusedFieldPaths?: readonly string[];
  topExpandedBlocks?: readonly string[];
  /** Stage label for metrics strip */
  stageLabel: string;
  /** e.g. chosen lender company or "—" */
  chosenLenderLabel: string;
  /** Optional: align overview recommendations with Settings → Workflows. */
  workflowRules?: readonly UserSimpleWorkflowRule[];
};

export function buildPipelineFileInsights(
  args: BuildPipelineFileInsightsArgs,
): PipelineFileInsightsSnapshot {
  const p = args.pipeline;
  const sheet = args.dealSheet;
  const items: FileInsightRow[] = [];

  if (sheet) {
    items.push(
      ...alertToRows(
        buildDealIdentityAlerts({
          clientName: sheet.clientName,
          projectName: sheet.projectName,
        }),
      ),
    );
    const cover = sheet.cover ?? {};
    items.push(
      ...alertToRows(
        buildCoverScenarioFundingAlerts({
          coverFunding: toNumber(
            (cover as Record<string, unknown>).fundingAmount as
              | string
              | number
              | null
              | undefined,
          ),
          scenarioProposed: toNumber(
            sheet.scenario?.proposedLoanAmount as
              | string
              | number
              | null
              | undefined,
          ),
        }),
      ),
    );

    const s = sheet.scenario ?? {};
    const di = deriveIntake(sheet);
    const propertyValue =
      toNumber(s.propertyValue) || toNumber(di.subjectValue);
    const proposed = toNumber(s.proposedLoanAmount);
    const cltv = propertyValue > 0 ? proposed / propertyValue : 0;
    items.push(
      ...alertToRows(
        buildScenarioRiskAlerts({
          loanPurpose: s.loanPurpose ?? "",
          cltv,
          creditScoreText: s.creditScore ?? "",
        }),
      ),
    );

    const dtiInst = normalizeDtiInstances(sheet);
    const dtiData = dtiInst[0]?.data;
    if (dtiData) {
      const m = computeDtiMetrics(dtiData);
      items.push(
        ...alertToRows(
          buildDtiToolAlerts({
            grossIncome: m.grossIncome,
            frontDti: m.frontDti,
            backDti: m.backDti,
          }),
        ),
      );
    }
  }

  const pipelineFunding =
    typeof p.fundingAmount === "number" && Number.isFinite(p.fundingAmount)
      ? p.fundingAmount
      : 0;
  const dealBacked = isDealBackedPipelineRow({
    dealData: p.dealData,
    intakeSheetId: p.intakeSheetId,
  });
  items.push(
    ...alertToRows(
      buildPipelineFundingMirrorAlerts({
        dealBacked,
        pipelineFunding,
        resolvedFromDeal: args.resolvedFunding,
      }),
    ),
  );

  items.push(
    ...alertToRows(
      buildContactFileAlerts({
        legacyContactCount: p.contacts?.length ?? 0,
        linkedContactCount: args.associatedContactLinkCount,
      }),
    ),
  );

  const candidates = listHiddenBlocksEligibleToShow({
    layout: args.drawerLayout,
    visibilitySignals: args.visibilitySignals,
  });
  const workflowRecs = computeWorkflowDrawerHints({
    rules: args.workflowRules ?? [],
    candidates,
    lenderCount: p.lenders.length,
    hasSelectedLender: p.selectedLenderId != null,
  });
  const dataRecs = computeRuleBasedDrawerBlockSuggestions({
    dealData: p.dealData,
    lenderCount: p.lenders.length,
    legacyContactCount: p.contacts?.length ?? 0,
    pipelineScenarioLine:
      typeof p.scenario === "string" ? p.scenario : undefined,
    candidates,
    focusedFieldPaths: args.focusedFieldPaths ?? [],
    topExpandedBlocks: args.topExpandedBlocks ?? [],
  });
  const recs = mergeSuggestionListsOrdered([workflowRecs, dataRecs], 6);
  for (const r of recs.slice(0, 4)) {
    items.push({
      id: `rec-${r.blockId}`,
      category: "recommendation",
      severity: "tip",
      title: `Suggested: ${getPipelineBlock(r.blockId).label}`,
      detail: r.reason,
      targetSection: r.blockId,
    });
  }

  const dedup = new Map<string, FileInsightRow>();
  for (const it of items) {
    if (!dedup.has(it.id)) dedup.set(it.id, it);
  }
  const sorted = sortItems([...dedup.values()]);
  const { healthTier, healthSummary } = evaluateFileHealthTier(sorted);

  const metrics: FileInsightMetric[] = [
    { id: "stage", label: "Stage", text: args.stageLabel },
    {
      id: "funding",
      label: "Table funding",
      amount: args.resolvedFunding,
    },
    {
      id: "lenders",
      label: "Lenders",
      text: `${p.lenders.length} linked`,
    },
    { id: "chosen", label: "Chosen lender", text: args.chosenLenderLabel },
  ];

  if (sheet) {
    metrics.push({
      id: "deal",
      label: "Deal workspace",
      text: "Data available",
    });
  } else {
    metrics.push({
      id: "deal",
      label: "Deal workspace",
      text: "Minimal / not loaded",
    });
  }

  return {
    healthTier,
    healthSummary,
    metrics,
    items: sorted,
  };
}
