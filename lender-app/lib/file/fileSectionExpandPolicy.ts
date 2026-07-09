import type { FileSectionDefaultMode } from "@/lib/userSettingsStorage";
import type { PipelineDrawerSectionId } from "@/lib/pipelineDrawerLayoutStorage";
import { DEFAULT_PIPELINE_DRAWER_ORDER } from "@/lib/pipelineDrawerLayoutStorage";
import type { DealTabId } from "@/lib/file/dealTabGroups";
import { DEFAULT_DEAL_WORKSPACE_TAB_ORDER } from "@/lib/file/dealWorkspaceLayout";
import type { DealAnalysisSectionId } from "@/lib/file/dealAnalysisLayoutStorage";
import { DEFAULT_DEAL_ANALYSIS_ORDER } from "@/lib/file/dealAnalysisLayoutStorage";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  buildPipelineDrawerMetricsContext,
  dealAnalysisToolFieldCount,
  dealTabFieldCount,
  pipelineDrawerSectionFieldCount,
  type PipelineDrawerMetricsContext,
} from "@/lib/file/fileSectionMetrics";

type Sheet = Doc<"intakeSheets">;

function allCollapsedDrawer(): Partial<Record<PipelineDrawerSectionId, boolean>> {
  return Object.fromEntries(
    DEFAULT_PIPELINE_DRAWER_ORDER.map((id) => [id, false] as const)
  ) as Partial<Record<PipelineDrawerSectionId, boolean>>;
}

export function buildDrawerExpandedForMode(
  mode: FileSectionDefaultMode,
  ctx: PipelineDrawerMetricsContext
): Partial<Record<PipelineDrawerSectionId, boolean>> {
  if (mode === "allExpanded") {
    return Object.fromEntries(
      DEFAULT_PIPELINE_DRAWER_ORDER.map((id) => [id, true] as const),
    ) as Partial<Record<PipelineDrawerSectionId, boolean>>;
  }
  if (mode === "allCollapsed") return allCollapsedDrawer();
  const out: Partial<Record<PipelineDrawerSectionId, boolean>> = {};
  for (const sid of DEFAULT_PIPELINE_DRAWER_ORDER) {
    out[sid] = pipelineDrawerSectionFieldCount(sid, ctx) > 0;
  }
  return out;
}

export function buildDealWorkspaceExpandedForMode(
  mode: FileSectionDefaultMode,
  draft: Sheet
): Partial<Record<DealTabId, boolean>> {
  if (mode === "allExpanded") return {};
  if (mode === "allCollapsed") {
    return Object.fromEntries(
      DEFAULT_DEAL_WORKSPACE_TAB_ORDER.map((id) => [id, false] as const)
    ) as Partial<Record<DealTabId, boolean>>;
  }
  const out: Partial<Record<DealTabId, boolean>> = {};
  for (const tid of DEFAULT_DEAL_WORKSPACE_TAB_ORDER) {
    if (dealTabFieldCount(tid, draft) === 0) {
      out[tid] = false;
    }
  }
  return out;
}

export function buildDealAnalysisExpandedForMode(
  mode: FileSectionDefaultMode,
  draft: Sheet
): Partial<Record<DealAnalysisSectionId, boolean>> {
  if (mode === "allExpanded") {
    return Object.fromEntries(
      DEFAULT_DEAL_ANALYSIS_ORDER.map((id) => [id, true] as const),
    ) as Partial<Record<DealAnalysisSectionId, boolean>>;
  }
  if (mode === "allCollapsed") {
    return Object.fromEntries(
      DEFAULT_DEAL_ANALYSIS_ORDER.map((id) => [id, false] as const)
    ) as Partial<Record<DealAnalysisSectionId, boolean>>;
  }
  const out: Partial<Record<DealAnalysisSectionId, boolean>> = {};
  for (const aid of DEFAULT_DEAL_ANALYSIS_ORDER) {
    out[aid] = dealAnalysisToolFieldCount(aid, draft) > 0;
  }
  return out;
}

export function mergeExpandedPref<T extends string>(
  base: Partial<Record<T, boolean>>,
  pref: Partial<Record<T, boolean>>
): Partial<Record<T, boolean>> {
  return { ...base, ...pref };
}

export { buildPipelineDrawerMetricsContext };
