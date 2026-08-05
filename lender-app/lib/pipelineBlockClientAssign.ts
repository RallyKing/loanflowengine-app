/**
 * Maps pipeline file CollapsibleBlock section anchors / drawer block ids to
 * atomic portal block ids used by Document Vault assignment + block_fill links.
 */
import {
  isAtomicPortalBlockId,
  normalizeToAtomicBlockIds,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import {
  DEAL_INFO_TAB_SECTION_IDS,
  DEAL_WORKSPACE_CALCULATOR_SECTION_IDS,
  DEAL_WORKSPACE_WORKSPACE_SECTION_IDS,
  MODULAR_BLOCK_SECTION_IDS,
  OVERVIEW_TAB_SECTION_IDS,
} from "@/lib/pipeline/fileWorkspaceTabRouting";

/**
 * Drawer / modular pipeline blocks that can be assigned to a client vault task.
 * Admin-only blocks (archive, dangerZone, people) are intentionally omitted.
 */
export const PIPELINE_BLOCK_TO_ATOMIC_ASSIGN: Partial<
  Record<PipelineBlockId, AtomicPortalBlockId>
> = {
  fileDetails: "file_details",
  fileNotes: "file_notes",
  licensing: "licensing",
  scenarioMatch: "scenario",
  generateTerms: "generate_terms",
  lenders: "lender_info",
  contacts: "contacts",
  feesSplits: "fees_splits",
  tasks: "file_tasks",
  constructionBudget: "construction_budget",
  investorExperience: "investor_experience",
  pfs: "pfs_statement",
};

/** DOM section id → atomic portal id for CollapsibleBlock auto-wiring. */
export const COLLAPSIBLE_SECTION_TO_ATOMIC_ASSIGN: Record<
  string,
  AtomicPortalBlockId
> = {
  [OVERVIEW_TAB_SECTION_IDS.notes]: "file_notes",
  [OVERVIEW_TAB_SECTION_IDS.contacts]: "contacts",
  [OVERVIEW_TAB_SECTION_IDS.tasks]: "file_tasks",
  [OVERVIEW_TAB_SECTION_IDS.lenders]: "lender_info",

  [DEAL_INFO_TAB_SECTION_IDS.fileDetails]: "file_details",
  [DEAL_INFO_TAB_SECTION_IDS.borrowers]: "borrower_entity",
  [DEAL_INFO_TAB_SECTION_IDS.guarantors]: "guarantors",
  [DEAL_INFO_TAB_SECTION_IDS.household]: "dependents_ages",
  [DEAL_INFO_TAB_SECTION_IDS.income]: "income",
  [DEAL_INFO_TAB_SECTION_IDS.assets]: "assets_liabilities",
  [DEAL_INFO_TAB_SECTION_IDS.reo]: "schedule_real_estate",
  [DEAL_INFO_TAB_SECTION_IDS.businessDebt]: "calculator_weighted_interest",
  [DEAL_INFO_TAB_SECTION_IDS.licensing]: "licensing",

  [DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.hardMoneyRehab]: "hard_money",
  [DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.commercialDscr]: "commercial_dscr",
  [DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.scenariosLenderMatch]: "scenario",
  [DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesSplits]: "fees_splits",
  [DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesClosing]: "fees_closing",

  [DEAL_WORKSPACE_CALCULATOR_SECTION_IDS.dti]: "calculator_dti",
  [DEAL_WORKSPACE_CALCULATOR_SECTION_IDS.comparison]:
    "calculator_loan_comparison",
  [DEAL_WORKSPACE_CALCULATOR_SECTION_IDS.weighted]:
    "calculator_weighted_interest",
  [DEAL_WORKSPACE_CALCULATOR_SECTION_IDS.payoff]: "calculator_payoff",
  [DEAL_WORKSPACE_CALCULATOR_SECTION_IDS.daycounter]: "calculator_day_counter",

  [MODULAR_BLOCK_SECTION_IDS.constructionBudget]: "construction_budget",
  [MODULAR_BLOCK_SECTION_IDS.investorExperience]: "investor_experience",
  [MODULAR_BLOCK_SECTION_IDS.pfs]: "pfs_statement",
};

/**
 * Resolve the atomic id used for vault assign / fill-link.
 * `explicit === false` opts out; a string forces that id (normalized).
 */
export function resolveClientAssignAtomicBlockId(args: {
  sectionId?: string | null;
  explicit?: string | false | null;
  pipelineBlockId?: PipelineBlockId | string | null;
}): AtomicPortalBlockId | null {
  if (args.explicit === false) return null;

  if (typeof args.explicit === "string" && args.explicit.trim()) {
    const atoms = normalizeToAtomicBlockIds(args.explicit.trim(), false);
    if (atoms[0]) return atoms[0];
    if (isAtomicPortalBlockId(args.explicit.trim())) {
      return args.explicit.trim() as AtomicPortalBlockId;
    }
  }

  if (args.pipelineBlockId) {
    const fromPipeline =
      PIPELINE_BLOCK_TO_ATOMIC_ASSIGN[
        args.pipelineBlockId as PipelineBlockId
      ];
    if (fromPipeline) return fromPipeline;
    const atoms = normalizeToAtomicBlockIds(String(args.pipelineBlockId), false);
    if (atoms[0]) return atoms[0];
  }

  const sectionId = args.sectionId?.trim();
  if (sectionId && COLLAPSIBLE_SECTION_TO_ATOMIC_ASSIGN[sectionId]) {
    return COLLAPSIBLE_SECTION_TO_ATOMIC_ASSIGN[sectionId]!;
  }

  return null;
}
