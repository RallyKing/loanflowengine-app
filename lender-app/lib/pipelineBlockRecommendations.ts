import { getPipelineBlock, type PipelineBlockId } from "./pipelineBlockRegistry";
import { blockMeetsVisibilitySpec } from "./pipelineBlockVisibility";
import type { DrawerVisibilitySignals } from "./pipelineBlockVisibility";
import type { PipelineDrawerLayoutV1 } from "./pipelineDrawerLayoutStorage";
import type { UserSimpleWorkflowRule } from "./userWorkflowsModel";

export type BlockSuggestionSource = "rules" | "ai" | "workflow";

export type PipelineBlockSuggestion = {
  blockId: PipelineBlockId;
  reason: string;
  source: BlockSuggestionSource;
};

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function readDealRecord(dealData: unknown): Record<string, unknown> | null {
  if (!dealData || typeof dealData !== "object" || Array.isArray(dealData)) {
    return null;
  }
  return dealData as Record<string, unknown>;
}

function nestedRecord(
  r: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!r) return null;
  const v = r[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/** Deal strings used by rule engine + server-side prompts. */
export function buildDealSummaryStrings(dealData: unknown): {
  dealType: string;
  fundingType: string;
  purpose: string;
  program: string;
  scenarioText: string;
} {
  const r = readDealRecord(dealData);
  const cover = nestedRecord(r, "cover");
  const scenario = nestedRecord(r, "scenario");
  return {
    dealType: norm(r?.dealType),
    fundingType:
      norm(r?.fundingType) ||
      norm(scenario?.fundingType) ||
      norm(cover?.fundingType),
    purpose: norm(cover?.purpose),
    program: norm(cover?.program),
    scenarioText: norm(scenario?.freeText),
  };
}

/**
 * Hidden drawer blocks the user could show (unhide) that still pass contextual
 * visibility rules — same policy as `getActivePipelineBlockIdsForFile` visibility.
 */
export function listHiddenBlocksEligibleToShow(args: {
  layout: PipelineDrawerLayoutV1;
  visibilitySignals?: DrawerVisibilitySignals | null;
}): PipelineBlockId[] {
  const vis = args.visibilitySignals;
  const hidden = new Set(args.layout.hidden);
  const out: PipelineBlockId[] = [];
  for (const id of args.layout.order) {
    if (!hidden.has(id)) continue;
    const def = getPipelineBlock(id);
    if (def.isMandatory) continue;
    if (vis && !blockMeetsVisibilitySpec(def.visibilityWhen, vis)) continue;
    out.push(id);
  }
  return out;
}

function pushSuggestion(
  out: PipelineBlockSuggestion[],
  seen: Set<string>,
  blockId: PipelineBlockId,
  reason: string,
  source: BlockSuggestionSource,
) {
  if (seen.has(blockId)) return;
  seen.add(blockId);
  out.push({ blockId, reason, source });
}

/**
 * Deterministic suggestions from file data, focused fields, and light behavior hints.
 * Only proposes blocks in `candidates` (typically hidden + context-visible).
 */
export function computeRuleBasedDrawerBlockSuggestions(args: {
  dealData: unknown;
  lenderCount: number;
  legacyContactCount: number;
  /** Pipeline row `scenario` line (table / file summary), not only embedded deal. */
  pipelineScenarioLine?: string;
  candidates: readonly PipelineBlockId[];
  focusedFieldPaths: readonly string[];
  topExpandedBlocks: readonly string[];
}): PipelineBlockSuggestion[] {
  const cand = new Set(args.candidates);
  if (cand.size === 0) return [];

  const summary = buildDealSummaryStrings(args.dealData);
  const pipelineScenario = norm(args.pipelineScenarioLine);
  const focus = new Set(
    args.focusedFieldPaths.map((p) => p.trim().toLowerCase()).filter(Boolean),
  );

  const refinLike =
    summary.dealType.includes("refin") ||
    summary.fundingType.includes("refin") ||
    summary.purpose.includes("rate") ||
    summary.purpose.includes("term") ||
    summary.purpose.includes("cash-out") ||
    summary.purpose.includes("cash out");

  const investorLike =
    summary.fundingType.includes("investor") ||
    summary.fundingType.includes("dscr") ||
    summary.dealType.includes("investor") ||
    summary.dealType.includes("dscr");

  const out: PipelineBlockSuggestion[] = [];
  const seen = new Set<string>();

  if (cand.has("generateTerms") && refinLike) {
    pushSuggestion(
      out,
      seen,
      "generateTerms",
      "Deal looks refinance- or term-sheet-oriented; add Generate terms when you are ready.",
      "rules",
    );
  }

  if (cand.has("feesSplits") && investorLike) {
    pushSuggestion(
      out,
      seen,
      "feesSplits",
      "Investor / DSCR-style funding often needs fee and split tracking.",
      "rules",
    );
  }

  if (cand.has("pfs")) {
    pushSuggestion(
      out,
      seen,
      "pfs",
      "Personal financial statement is available on every file — add it for guarantor / borrower net worth.",
      "rules",
    );
  }

  const cashFlowLike =
    summary.dealType.includes("working capital") ||
    summary.dealType.includes("working-capital") ||
    summary.fundingType.includes("working capital") ||
    summary.fundingType.includes("factor") ||
    summary.purpose.includes("working capital") ||
    summary.program.includes("working capital") ||
    pipelineScenario.includes("p&l") ||
    pipelineScenario.includes("profit and loss") ||
    summary.scenarioText.includes("p&l");

  if (cand.has("simplePl") && cashFlowLike) {
    pushSuggestion(
      out,
      seen,
      "simplePl",
      "Working-capital / cash-flow files often need a Simple P&L (YTD and past years).",
      "rules",
    );
  }

  if (cand.has("scenarioMatch") && args.lenderCount >= 2) {
    pushSuggestion(
      out,
      seen,
      "scenarioMatch",
      "Multiple lenders attached — scenario match helps compare options.",
      "rules",
    );
  }

  if (
    cand.has("scenarioMatch") &&
    (pipelineScenario.length > 24 || summary.scenarioText.length > 24)
  ) {
    pushSuggestion(
      out,
      seen,
      "scenarioMatch",
      "This deal has scenario detail saved — lender matching may save time.",
      "rules",
    );
  }

  if (cand.has("scenarioMatch") && focus.has("dealtype")) {
    pushSuggestion(
      out,
      seen,
      "scenarioMatch",
      "Deal type shapes lender fit — scenario match can narrow options.",
      "rules",
    );
  }

  if (cand.has("lenders") && focus.has("cover.program")) {
    pushSuggestion(
      out,
      seen,
      "lenders",
      "You are editing program — lender shopping may be the next step.",
      "rules",
    );
  }

  if (cand.has("scenarioMatch") && focus.has("cover.fundingtype")) {
    pushSuggestion(
      out,
      seen,
      "scenarioMatch",
      "Funding type drives lender fit — scenario match can narrow the list.",
      "rules",
    );
  }

  if (cand.has("generateTerms") && focus.has("cover.purpose")) {
    pushSuggestion(
      out,
      seen,
      "generateTerms",
      "Purpose of loan often feeds term options — add Generate terms when negotiating.",
      "rules",
    );
  }

  if (
    cand.has("contacts") &&
    args.legacyContactCount > 0 &&
    args.topExpandedBlocks.includes("people")
  ) {
    pushSuggestion(
      out,
      seen,
      "contacts",
      "You track people on the file — formal contacts may help outreach.",
      "rules",
    );
  }

  if (
    cand.has("tasks") &&
    args.topExpandedBlocks.includes("lenders") &&
    !args.topExpandedBlocks.includes("tasks")
  ) {
    pushSuggestion(
      out,
      seen,
      "tasks",
      "You often open Lenders — lightweight tasks can track follow-ups.",
      "rules",
    );
  }

  return out;
}

/**
 * Merges ordered tiers (e.g. workflow hints → data rules → AI) without duplicate block ids.
 * Earlier lists win so automations and heuristics stay ahead of generic model output.
 */
export function mergeSuggestionListsOrdered(
  lists: readonly (readonly PipelineBlockSuggestion[])[],
  max = 5,
): PipelineBlockSuggestion[] {
  const byId = new Map<PipelineBlockId, PipelineBlockSuggestion>();
  for (const list of lists) {
    for (const s of list) {
      if (!byId.has(s.blockId)) byId.set(s.blockId, s);
    }
  }
  return [...byId.values()].slice(0, max);
}

export function mergeSuggestionLists(
  primary: readonly PipelineBlockSuggestion[],
  secondary: readonly PipelineBlockSuggestion[],
  max = 5,
): PipelineBlockSuggestion[] {
  return mergeSuggestionListsOrdered([primary, secondary], max);
}

const WORKFLOW_HINT_TRIGGERS: Record<
  UserSimpleWorkflowRule["trigger"]["type"],
  string
> = {
  file_created: "new pipeline files",
  lender_attached: "a lender is attached to the file",
  lender_selected: "you choose a lender on the file",
};

/**
 * Surfaces drawer sections the user asked to reveal via simple workflows when
 * current file state matches the trigger (server automations may have already
 * run; this nudges when the section is still hidden and eligible).
 */
export function computeWorkflowDrawerHints(args: {
  rules: readonly UserSimpleWorkflowRule[];
  candidates: readonly PipelineBlockId[];
  lenderCount: number;
  hasSelectedLender: boolean;
  max?: number;
}): PipelineBlockSuggestion[] {
  const cand = new Set(args.candidates);
  const max = Math.min(Math.max(args.max ?? 3, 1), 6);
  const out: PipelineBlockSuggestion[] = [];
  const seen = new Set<string>();

  for (const r of args.rules) {
    if (!r.enabled || r.action.type !== "show_drawer_block") continue;
    const bid = r.action.blockId;
    if (!cand.has(bid) || seen.has(bid)) continue;

    let match = false;
    switch (r.trigger.type) {
      case "file_created":
        match = true;
        break;
      case "lender_attached":
        match = args.lenderCount >= 1;
        break;
      case "lender_selected":
        match = args.hasSelectedLender;
        break;
      default:
        match = false;
    }
    if (!match) continue;

    seen.add(bid);
    const when = WORKFLOW_HINT_TRIGGERS[r.trigger.type];
    out.push({
      blockId: bid,
      source: "workflow",
      reason: `Your workflow opens ${getPipelineBlock(bid).label} when ${when}.`,
    });
    if (out.length >= max) break;
  }

  return out;
}
