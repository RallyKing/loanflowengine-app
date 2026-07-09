import type { DealAnalysisSectionId } from "@/lib/file/dealAnalysisLayoutStorage";
import type { DealTabId } from "@/lib/file/dealTabGroups";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";

/**
 * Phase 37.3 — when true, overview drawer blocks render in the tab shell only;
 * legacy drawer copies are replaced with hidden DOM stubs (toggle false to restore).
 */
export const HIDE_LEGACY_OVERVIEW_DRAWER_BLOCKS = true;

/** Drawer block ids migrated to the Overview tab (Phase 37.3.B). */
export const LEGACY_OVERVIEW_MIGRATED_BLOCK_IDS = [
  "fileNotes",
  "contacts",
  "tasks",
  "lenders",
] as const satisfies readonly PipelineBlockId[];

export type LegacyOverviewMigratedBlockId =
  (typeof LEGACY_OVERVIEW_MIGRATED_BLOCK_IDS)[number];

export function isLegacyOverviewDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_OVERVIEW_DRAWER_BLOCKS &&
    (LEGACY_OVERVIEW_MIGRATED_BLOCK_IDS as readonly string[]).includes(blockId)
  );
}

/**
 * Phase 37.3.C / 37.3.D.B — when true, migrated deal tabs render in the Deal Info
 * file-workspace tab only (toggle false to restore accordion copies).
 */
export const HIDE_LEGACY_BORROWERS_DEAL_TABS = true;

/** Deal tab ids migrated to the Deal Info tab (people + financials). */
export const LEGACY_BORROWERS_MIGRATED_DEAL_TAB_IDS = [
  "borrowers",
  "guarantors",
  "household",
  "income",
  "assets",
  "reo",
] as const satisfies readonly DealTabId[];

export type LegacyBorrowersMigratedDealTabId =
  (typeof LEGACY_BORROWERS_MIGRATED_DEAL_TAB_IDS)[number];

export function isLegacyBorrowersDealTabHidden(tabId: DealTabId): boolean {
  return (
    HIDE_LEGACY_BORROWERS_DEAL_TABS &&
    (LEGACY_BORROWERS_MIGRATED_DEAL_TAB_IDS as readonly string[]).includes(tabId)
  );
}

/**
 * Phase 37.3.G — when true, the weighted-interest debt grid in the analysis
 * workspace is hidden (schedule lives in Deal Info tab 2).
 */
export const HIDE_LEGACY_BUSINESS_DEBT_IN_ANALYSIS = true;

export function isLegacyBusinessDebtAnalysisHidden(): boolean {
  return HIDE_LEGACY_BUSINESS_DEBT_IN_ANALYSIS;
}

/**
 * Phase 37.3.F / 38.14 — when true, the drawer `dealWorkspace` block is hidden in favor of
 * Tab 3 Deal Workspace shell.
 */
export const HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK = true;

export const LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK_ID =
  "dealWorkspace" as const satisfies PipelineBlockId;

/** Deal tab ids targeted for Tab 3 workspace sub-tab (Phase 37.3.F+). */
export const LEGACY_DEAL_WORKSPACE_WORKSPACE_DEAL_TAB_IDS = [
  "hardmoney",
  "commercial",
  "scenario",
  "fees",
] as const satisfies readonly DealTabId[];

/**
 * Phase 37.3.F.2+ — when true, deal tabs listed in
 * `LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS` render in Tab 3 only (legacy
 * IntakeEditor accordion copies hidden).
 */
export const HIDE_LEGACY_DEAL_WORKSPACE_MIGRATED_TABS = true;

/** Incremental list — add ids as each workspace section migrates to Tab 3. */
export const LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS = [
  "commercial",
  "fees",
  "hardmoney",
  "scenario",
  "analysis",
] as const satisfies readonly DealTabId[];

/**
 * Phase 37.3.F.6 — when true, drawer blocks listed in
 * `LEGACY_DEAL_WORKSPACE_MIGRATED_DRAWER_BLOCK_IDS` render in Tab 3 only.
 */
export const HIDE_LEGACY_DEAL_WORKSPACE_MIGRATED_DRAWER_BLOCKS = true;

/** Drawer block ids migrated to Tab 3 workspace sub-tab (incremental). */
export const LEGACY_DEAL_WORKSPACE_MIGRATED_DRAWER_BLOCK_IDS = [
  "scenarioMatch",
] as const satisfies readonly PipelineBlockId[];

export type LegacyDealWorkspaceMigratedDrawerBlockId =
  (typeof LEGACY_DEAL_WORKSPACE_MIGRATED_DRAWER_BLOCK_IDS)[number];

export type LegacyDealWorkspaceMigratedDealTabId =
  (typeof LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS)[number];

export function isLegacyDealWorkspaceMigratedDealTabHidden(
  tabId: DealTabId,
): boolean {
  return (
    HIDE_LEGACY_DEAL_WORKSPACE_MIGRATED_TABS &&
    (LEGACY_DEAL_WORKSPACE_MIGRATED_DEAL_TAB_IDS as readonly string[]).includes(
      tabId,
    )
  );
}

export function isLegacyDealWorkspaceMigratedDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_DEAL_WORKSPACE_MIGRATED_DRAWER_BLOCKS &&
    (
      LEGACY_DEAL_WORKSPACE_MIGRATED_DRAWER_BLOCK_IDS as readonly string[]
    ).includes(blockId)
  );
}

/** Drawer block ids targeted for Tab 3 workspace sub-tab. */
export const LEGACY_DEAL_WORKSPACE_WORKSPACE_DRAWER_BLOCK_IDS = [
  "scenarioMatch",
] as const satisfies readonly PipelineBlockId[];

/** Analysis tool section ids targeted for Tab 3 calculators sub-tab. */
export const LEGACY_DEAL_WORKSPACE_CALCULATOR_SECTION_IDS = [
  "dti",
  "comparison",
  "weighted",
  "payoff",
  "daycounter",
] as const satisfies readonly DealAnalysisSectionId[];

export function isLegacyDealWorkspaceDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK &&
    blockId === LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK_ID
  );
}

export function isLegacyDealWorkspaceDealTabHidden(tabId: DealTabId): boolean {
  if (isLegacyDealWorkspaceMigratedDealTabHidden(tabId)) return true;
  return (
    HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK &&
    (LEGACY_DEAL_WORKSPACE_WORKSPACE_DEAL_TAB_IDS as readonly string[]).includes(
      tabId,
    )
  );
}

export function isLegacyDealWorkspaceDrawerSectionHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK &&
    (LEGACY_DEAL_WORKSPACE_WORKSPACE_DRAWER_BLOCK_IDS as readonly string[]).includes(
      blockId,
    )
  );
}

export function isLegacyDealWorkspaceCalculatorHidden(
  sectionId: DealAnalysisSectionId,
): boolean {
  return (
    HIDE_LEGACY_DEAL_WORKSPACE_DRAWER_BLOCK &&
    (LEGACY_DEAL_WORKSPACE_CALCULATOR_SECTION_IDS as readonly string[]).includes(
      sectionId,
    )
  );
}

/**
 * Phase 37.10.B — when true, file admin surfaces render in Tab 6 Settings only;
 * legacy drawer blocks, layout strip controls, and header overflow admin items hide.
 */
export const HIDE_LEGACY_FILE_ADMIN_SURFACES = true;

/** Drawer block ids migrated to the Settings tab (Phase 37.10.B). */
export const LEGACY_FILE_ADMIN_DRAWER_BLOCK_IDS = [
  "people",
  "archive",
  "dangerZone",
] as const satisfies readonly PipelineBlockId[];

export type LegacyFileAdminDrawerBlockId =
  (typeof LEGACY_FILE_ADMIN_DRAWER_BLOCK_IDS)[number];

export function isLegacyFileAdminDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_FILE_ADMIN_SURFACES &&
    (LEGACY_FILE_ADMIN_DRAWER_BLOCK_IDS as readonly string[]).includes(blockId)
  );
}

export function isLegacyFileAdminLayoutStripHidden(): boolean {
  return HIDE_LEGACY_FILE_ADMIN_SURFACES;
}

export function isLegacyFileAdminHeaderOverflowHidden(): boolean {
  return HIDE_LEGACY_FILE_ADMIN_SURFACES;
}

/**
 * Phase 37.13.B — when true, the drawer `licensing` block is hidden in favor of
 * Tab 2 Deal Info (toggle false to restore hallway copy).
 */
export const HIDE_LEGACY_LICENSING_DRAWER_BLOCK = true;

export const LEGACY_LICENSING_DRAWER_BLOCK_ID =
  "licensing" as const satisfies PipelineBlockId;

export function isLegacyLicensingDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_LICENSING_DRAWER_BLOCK &&
    blockId === LEGACY_LICENSING_DRAWER_BLOCK_ID
  );
}

/**
 * Phase 37.13.C — when true, the drawer `fileDetails` block is hidden in favor of
 * Tab 2 Deal Info (toggle false to restore hallway copy).
 */
export const HIDE_LEGACY_FILE_DETAILS_DRAWER_BLOCK = true;

export const LEGACY_FILE_DETAILS_DRAWER_BLOCK_ID =
  "fileDetails" as const satisfies PipelineBlockId;

export function isLegacyFileDetailsDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_FILE_DETAILS_DRAWER_BLOCK &&
    blockId === LEGACY_FILE_DETAILS_DRAWER_BLOCK_ID
  );
}

/**
 * Phase 37.13.E — when true, the drawer `feesSplits` block is hidden in favor of
 * Tab 3 Deal Workspace (toggle false to restore hallway copy).
 */
export const HIDE_LEGACY_FEES_SPLITS_DRAWER_BLOCK = true;

export const LEGACY_FEES_SPLITS_DRAWER_BLOCK_ID =
  "feesSplits" as const satisfies PipelineBlockId;

export function isLegacyFeesSplitsDrawerBlockHidden(
  blockId: PipelineBlockId,
): boolean {
  return (
    HIDE_LEGACY_FEES_SPLITS_DRAWER_BLOCK &&
    blockId === LEGACY_FEES_SPLITS_DRAWER_BLOCK_ID
  );
}
