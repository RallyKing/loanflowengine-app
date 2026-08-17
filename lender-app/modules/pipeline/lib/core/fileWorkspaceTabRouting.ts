import type { DealAnalysisSectionId } from "@/lib/file/dealAnalysisLayoutStorage";
import type { DealTabId } from "@/lib/file/dealTabGroups";
import type { PipelineDrawerSectionId } from "@/lib/pipelineDrawerLayoutStorage";
import type { FileWorkspaceTabId } from "@/components/pipeline/FileWorkspaceTabShell";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import {
  isLegacyFeesSplitsDrawerBlockHidden,
  isLegacyFileAdminDrawerBlockHidden,
  isLegacyFileDetailsDrawerBlockHidden,
  isLegacyLicensingDrawerBlockHidden,
} from "@/lib/pipeline/fileWorkspaceLegacyVisibility";

/** Internal sub-tabs inside Tab 3 — Deal Workspace. */
export type DealWorkspaceSubTabId = "workspace" | "calculators";

export const DEAL_WORKSPACE_SUB_TAB_LABELS: Record<
  DealWorkspaceSubTabId,
  string
> = {
  workspace: "Workspace",
  calculators: "Calculators & Tools",
};

/** Stable section anchors — Deal Workspace sub-tab A (workspace). */
export const DEAL_WORKSPACE_WORKSPACE_SECTION_IDS = {
  hardMoneyRehab: "pipeline-deal-workspace-hard-money-rehab",
  commercialDscr: "pipeline-deal-workspace-commercial-dscr",
  scenariosLenderMatch: "pipeline-deal-workspace-scenarios-lender-match",
  feesSplits: "pipeline-deal-workspace-fees",
  feesClosing: "pipeline-deal-workspace-fees-closing",
} as const;

/** Stable section anchors — Deal Workspace sub-tab B (calculators). */
export const DEAL_WORKSPACE_CALCULATOR_SECTION_IDS = {
  dti: "pipeline-deal-workspace-calc-dti",
  comparison: "pipeline-deal-workspace-calc-comparison",
  weighted: "pipeline-deal-workspace-calc-weighted",
  payoff: "pipeline-deal-workspace-calc-payoff",
  daycounter: "pipeline-deal-workspace-calc-daycounter",
} as const satisfies Record<DealAnalysisSectionId, string>;

/** All canonical calculator anchor ids (hash / scroll targets). */
export const DEAL_WORKSPACE_CALCULATOR_ANCHOR_IDS: readonly string[] =
  Object.values(DEAL_WORKSPACE_CALCULATOR_SECTION_IDS);

const DEAL_WORKSPACE_CALCULATOR_ANCHOR_SET = new Set<string>(
  DEAL_WORKSPACE_CALCULATOR_ANCHOR_IDS,
);

/** Workspace sub-tab A section anchors (hash / scroll targets). */
export const DEAL_WORKSPACE_WORKSPACE_ANCHOR_IDS: readonly string[] =
  Object.values(DEAL_WORKSPACE_WORKSPACE_SECTION_IDS);

const DEAL_WORKSPACE_WORKSPACE_ANCHOR_SET = new Set<string>(
  DEAL_WORKSPACE_WORKSPACE_ANCHOR_IDS,
);

export function isDealWorkspaceWorkspaceAnchor(anchorId: string): boolean {
  return DEAL_WORKSPACE_WORKSPACE_ANCHOR_SET.has(anchorId);
}

export function isDealWorkspaceCalculatorAnchor(anchorId: string): boolean {
  return DEAL_WORKSPACE_CALCULATOR_ANCHOR_SET.has(anchorId);
}

/** Parse `location.hash` when it targets a Tab 3 calculator accordion. */
export function dealWorkspaceCalculatorAnchorFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.slice(1);
  return isDealWorkspaceCalculatorAnchor(raw) ? raw : null;
}

export const DEAL_WORKSPACE_CALCULATOR_ANCHOR_EVENT =
  "dlc:deal-workspace-calculator-anchor";

export const DEAL_WORKSPACE_WORKSPACE_ANCHOR_EVENT =
  "dlc:deal-workspace-workspace-anchor";

/** Request Tab 3 workspace sub-tab + scroll (used when target is not mounted yet). */
export function notifyDealWorkspaceWorkspaceAnchor(anchorId: string): void {
  if (typeof window === "undefined") return;
  if (!isDealWorkspaceWorkspaceAnchor(anchorId)) return;
  window.dispatchEvent(
    new CustomEvent(DEAL_WORKSPACE_WORKSPACE_ANCHOR_EVENT, {
      detail: { anchorId },
    }),
  );
}

/** Request Tab 3 calculators sub-tab + scroll (used when target is not mounted yet). */
export function notifyDealWorkspaceCalculatorAnchor(anchorId: string): void {
  if (typeof window === "undefined") return;
  if (!isDealWorkspaceCalculatorAnchor(anchorId)) return;
  window.dispatchEvent(
    new CustomEvent(DEAL_WORKSPACE_CALCULATOR_ANCHOR_EVENT, {
      detail: { anchorId },
    }),
  );
}

/** Stable section anchors inside the File Overview tab panel. */
export const OVERVIEW_TAB_SECTION_IDS = {
  fileInsights: "pipeline-overview-file-insights",
  notes: "pipeline-overview-notes",
  contacts: "pipeline-overview-contacts",
  tasks: "pipeline-overview-tasks",
  lenders: "pipeline-overview-lenders",
} as const;

/** Stable anchors for Phase Modular-C opt-in blocks. */
export const MODULAR_BLOCK_SECTION_IDS = {
  constructionBudget: "pipeline-financials-construction-budget",
  investorExperience: "pipeline-deal-info-investor-experience",
  pfs: "pipeline-financials-pfs",
  trackRecord: "pipeline-financials-track-record",
  simplePl: "pipeline-financials-simple-pl",
} as const;

/** Stable section anchors inside the Deal Info tab panel. */
export const DEAL_INFO_TAB_SECTION_IDS = {
  fileDetails: "pipeline-deal-info-file-details",
  borrowers: "pipeline-deal-info-borrowers",
  guarantors: "pipeline-deal-info-guarantors",
  household: "pipeline-deal-info-household",
  income: "pipeline-deal-info-income",
  assets: "pipeline-deal-info-assets",
  reo: "pipeline-deal-info-reo",
  businessDebt: "pipeline-deal-info-business-debt",
  licensing: "pipeline-deal-info-licensing",
} as const;

/** UI label for the business debt schedule (legacy key: `weightedInterest`). */
export const DEAL_INFO_BUSINESS_DEBT_LABEL = "Schedule of Business Debt";

/** Stable anchors inside the Document Vault tab panel (Tab 4). */
export const DOCUMENTS_TAB_SECTION_IDS = {
  vault: "pipeline-documents-vault",
  auditTrail: "pipeline-documents-vault-audit",
} as const;

/** Stable anchors inside the Portals tab panel (Tab 5). */
export const CLIENT_PORTAL_TAB_SECTION_IDS = {
  controlRoom: "pipeline-client-portal-control-room",
  linkSecurity: "pipeline-client-portal-link-security",
  uploadsInbox: "pipeline-client-portal-uploads-inbox",
  communications: "pipeline-portals-communications",
} as const;

/** Stable anchors inside the Underwriting tab panel (Tab 6). */
export const UNDERWRITING_TAB_SECTION_IDS = {
  ledger: "pipeline-underwriting-ledger",
  financialMetrics: "pipeline-underwriting-financial-metrics",
  actionQueue: "pipeline-underwriting-action-queue",
  lenderTrack: "pipeline-underwriting-lender-track",
  internalWorkflow: "pipeline-underwriting-internal-workflow",
} as const;

/** Stable anchors inside the Settings tab panel (Tab 7). */
export const SETTINGS_TAB_SECTION_IDS = {
  root: "pipeline-settings-tab",
  layout: "pipeline-settings-layout",
  sharing: "pipeline-settings-sharing",
  archive: "pipeline-settings-archive",
  dangerZone: "pipeline-settings-danger-zone",
  fileHistory: "pipeline-settings-file-history",
} as const;

/** @deprecated Renamed in Phase 37.3.D — use `DEAL_INFO_TAB_SECTION_IDS`. */
export const BORROWERS_TAB_SECTION_IDS = DEAL_INFO_TAB_SECTION_IDS;

const DRAWER_BLOCK_TO_TAB: Partial<
  Record<PipelineDrawerSectionId, FileWorkspaceTabId>
> = {
  fileNotes: "dealInfo",
  contacts: "dealInfo",
  tasks: "dealInfo",
  lenders: "dealInfo",
  feesSplits: "dealInfo",
  people: "settings",
  archive: "settings",
  dangerZone: "settings",
  constructionBudget: "financials",
  investorExperience: "dealInfo",
  pfs: "financials",
  trackRecord: "financials",
  simplePl: "financials",
};

const DRAWER_BLOCK_TO_SETTINGS_ANCHOR: Partial<
  Record<PipelineDrawerSectionId, string>
> = {
  people: SETTINGS_TAB_SECTION_IDS.sharing,
  archive: SETTINGS_TAB_SECTION_IDS.archive,
  dangerZone: SETTINGS_TAB_SECTION_IDS.dangerZone,
};

const DRAWER_BLOCK_TO_OVERVIEW_ANCHOR: Partial<
  Record<PipelineDrawerSectionId, string>
> = {
  fileNotes: OVERVIEW_TAB_SECTION_IDS.notes,
  contacts: OVERVIEW_TAB_SECTION_IDS.contacts,
  tasks: OVERVIEW_TAB_SECTION_IDS.tasks,
  lenders: OVERVIEW_TAB_SECTION_IDS.lenders,
};

const DRAWER_BLOCK_TO_DEAL_INFO_ANCHOR: Partial<
  Record<PipelineDrawerSectionId, string>
> = {
  fileDetails: DEAL_INFO_TAB_SECTION_IDS.fileDetails,
  licensing: DEAL_INFO_TAB_SECTION_IDS.licensing,
  investorExperience: MODULAR_BLOCK_SECTION_IDS.investorExperience,
};

const DRAWER_BLOCK_TO_DEAL_WORKSPACE_ANCHOR: Partial<
  Record<PipelineDrawerSectionId, string>
> = {
  feesSplits: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesSplits,
  constructionBudget: MODULAR_BLOCK_SECTION_IDS.constructionBudget,
  pfs: MODULAR_BLOCK_SECTION_IDS.pfs,
  trackRecord: MODULAR_BLOCK_SECTION_IDS.trackRecord,
  simplePl: MODULAR_BLOCK_SECTION_IDS.simplePl,
};

const DEAL_TAB_TO_FILE_TAB: Partial<Record<DealTabId, FileWorkspaceTabId>> = {
  borrowers: "dealInfo",
  guarantors: "dealInfo",
  household: "financials",
  income: "financials",
  assets: "financials",
  reo: "financials",
  commercial: "financials",
  fees: "dealInfo",
  hardmoney: "financials",
  scenario: "portalsProgress",
  analysis: "financials",
};

const DEAL_TAB_TO_DEAL_WORKSPACE_ANCHOR: Partial<Record<DealTabId, string>> = {
  commercial: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.commercialDscr,
  fees: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesClosing,
  hardmoney: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.hardMoneyRehab,
  scenario: DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.scenariosLenderMatch,
  analysis: DEAL_WORKSPACE_CALCULATOR_SECTION_IDS.dti,
};

const DEAL_TAB_TO_DEAL_INFO_ANCHOR: Partial<Record<DealTabId, string>> = {
  borrowers: DEAL_INFO_TAB_SECTION_IDS.borrowers,
  guarantors: DEAL_INFO_TAB_SECTION_IDS.guarantors,
  household: DEAL_INFO_TAB_SECTION_IDS.household,
  income: DEAL_INFO_TAB_SECTION_IDS.income,
  assets: DEAL_INFO_TAB_SECTION_IDS.assets,
  reo: DEAL_INFO_TAB_SECTION_IDS.reo,
};

export function tabForDrawerBlock(
  sid: PipelineDrawerSectionId,
): FileWorkspaceTabId | null {
  if (isLegacyFileAdminDrawerBlockHidden(sid as PipelineBlockId)) {
    return "settings";
  }
  if (isLegacyLicensingDrawerBlockHidden(sid as PipelineBlockId)) {
    return "dealInfo";
  }
  if (isLegacyFileDetailsDrawerBlockHidden(sid as PipelineBlockId)) {
    return "dealInfo";
  }
  if (isLegacyFeesSplitsDrawerBlockHidden(sid as PipelineBlockId)) {
    return "dealInfo";
  }
  return DRAWER_BLOCK_TO_TAB[sid] ?? null;
}

export function settingsAnchorForDrawerBlock(
  sid: PipelineDrawerSectionId,
): string | null {
  if (!isLegacyFileAdminDrawerBlockHidden(sid as PipelineBlockId)) {
    return null;
  }
  return DRAWER_BLOCK_TO_SETTINGS_ANCHOR[sid] ?? null;
}

export function tabForDealTab(tabId: DealTabId): FileWorkspaceTabId | null {
  return DEAL_TAB_TO_FILE_TAB[tabId] ?? null;
}

export function overviewAnchorForDrawerBlock(
  sid: PipelineDrawerSectionId,
): string | null {
  return DRAWER_BLOCK_TO_OVERVIEW_ANCHOR[sid] ?? null;
}

export function dealInfoAnchorForDrawerBlock(
  sid: PipelineDrawerSectionId,
): string | null {
  const anchor = DRAWER_BLOCK_TO_DEAL_INFO_ANCHOR[sid];
  if (!anchor) return null;
  if (
    sid === "licensing" &&
    !isLegacyLicensingDrawerBlockHidden("licensing")
  ) {
    return null;
  }
  if (
    sid === "fileDetails" &&
    !isLegacyFileDetailsDrawerBlockHidden("fileDetails")
  ) {
    return null;
  }
  return anchor;
}

export function dealInfoAnchorForDealTab(tabId: DealTabId): string | null {
  return DEAL_TAB_TO_DEAL_INFO_ANCHOR[tabId] ?? null;
}

export function dealWorkspaceAnchorForDealTab(tabId: DealTabId): string | null {
  return DEAL_TAB_TO_DEAL_WORKSPACE_ANCHOR[tabId] ?? null;
}

export function dealWorkspaceAnchorForDrawerBlock(
  sid: PipelineDrawerSectionId,
): string | null {
  const anchor = DRAWER_BLOCK_TO_DEAL_WORKSPACE_ANCHOR[sid];
  if (!anchor) return null;
  if (
    sid === "feesSplits" &&
    !isLegacyFeesSplitsDrawerBlockHidden("feesSplits")
  ) {
    return null;
  }
  return anchor;
}

/** @deprecated Renamed in Phase 37.3.D — use `dealInfoAnchorForDealTab`. */
export const borrowersAnchorForDealTab = dealInfoAnchorForDealTab;

/** Scroll target when a drawer block is migrated to a tab (null → legacy drawer id). */
export function scrollTargetForDrawerBlock(
  sid: PipelineDrawerSectionId,
  legacyDomId: string,
): string {
  return (
    settingsAnchorForDrawerBlock(sid) ??
    overviewAnchorForDrawerBlock(sid) ??
    dealInfoAnchorForDrawerBlock(sid) ??
    dealWorkspaceAnchorForDrawerBlock(sid) ??
    legacyDomId
  );
}

/**
 * CollapsibleBlock `id` / FloatingBlockWindow detach key for a pipeline drawer
 * block. Favorites and “Open in window” must use the same key so WiW state
 * stays shared across tabs.
 */
export function floatingBlockKeyForPipelineBlock(
  sid: PipelineDrawerSectionId,
): string | null {
  return (
    settingsAnchorForDrawerBlock(sid) ??
    overviewAnchorForDrawerBlock(sid) ??
    dealInfoAnchorForDrawerBlock(sid) ??
    dealWorkspaceAnchorForDrawerBlock(sid) ??
    null
  );
}

/** Scroll target when a deal tab is migrated to the Deal Info file tab. */
export function scrollTargetForDealTab(
  tabId: DealTabId,
  legacyDomId: string,
): string {
  return (
    dealInfoAnchorForDealTab(tabId) ??
    dealWorkspaceAnchorForDealTab(tabId) ??
    legacyDomId
  );
}

export function scrollToPipelineWorkspaceAnchor(
  anchorId: string,
  behavior: ScrollBehavior = "auto",
): void {
  const el = document.getElementById(anchorId);
  if (el) {
    el.scrollIntoView({ behavior, block: "start" });
    return;
  }
  if (isDealWorkspaceCalculatorAnchor(anchorId)) {
    notifyDealWorkspaceCalculatorAnchor(anchorId);
  }
  if (isDealWorkspaceWorkspaceAnchor(anchorId)) {
    notifyDealWorkspaceWorkspaceAnchor(anchorId);
  }
}
