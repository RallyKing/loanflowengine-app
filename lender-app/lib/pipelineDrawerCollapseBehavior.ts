import type { PipelineBlockId } from "./pipelineBlockRegistry";
import { ALL_PIPELINE_BLOCK_IDS } from "./pipelineBlockRegistry";
import { buildDrawerExpandedForMode } from "./file/fileSectionExpandPolicy";
import type { PipelineDrawerMetricsContext } from "./file/fileSectionMetrics";
import type {
  PipelineDrawerSectionId,
  PipelineFileHeaderSectionId,
} from "./pipelineDrawerLayoutStorage";
import type { UserPreferencesCollapseBehavior } from "./userPreferencesModel";
import type { FileSectionDefaultMode } from "./userSettingsStorage";

/**
 * Maps device-local `fileSectionDefaultMode` to account `collapseBehavior` vocabulary.
 */
export function collapseBehaviorFromDeviceFileSectionMode(
  mode: FileSectionDefaultMode,
): UserPreferencesCollapseBehavior {
  if (mode === "allExpanded") return "all_open";
  if (mode === "allCollapsed") return "all_closed";
  return "smart";
}

export function fileSectionDefaultModeFromCollapseBehavior(
  behavior: UserPreferencesCollapseBehavior,
): FileSectionDefaultMode {
  if (behavior === "all_open") return "allExpanded";
  if (behavior === "all_closed") return "allCollapsed";
  return "dataSmart";
}

/**
 * Expanded flags for visible drawer blocks from a collapse preference.
 * Opt-in: `true` means open. `all_open` → every visible id `true`.
 * `all_closed` → every visible id `false`. `smart` → open only blocks with filled fields.
 */
export function drawerExpandedMapForCollapseBehavior(
  behavior: UserPreferencesCollapseBehavior,
  visibleBlockIds: readonly PipelineBlockId[],
  metricsCtx: PipelineDrawerMetricsContext,
): Partial<Record<PipelineDrawerSectionId, boolean>> {
  if (behavior === "all_open") {
    const out: Partial<Record<PipelineDrawerSectionId, boolean>> = {};
    for (const id of visibleBlockIds) {
      if (ALL_PIPELINE_BLOCK_IDS.has(id)) {
        out[id as PipelineDrawerSectionId] = true;
      }
    }
    return out;
  }
  if (behavior === "all_closed") {
    const out: Partial<Record<PipelineDrawerSectionId, boolean>> = {};
    for (const id of visibleBlockIds) {
      if (ALL_PIPELINE_BLOCK_IDS.has(id)) {
        out[id as PipelineDrawerSectionId] = false;
      }
    }
    return out;
  }
  return buildDrawerExpandedForMode("dataSmart", metricsCtx);
}

/** Header strips (deal messages / email / documents) follow the same open/closed modes as drawer blocks. */
export function headerSectionsExpandedForCollapseBehavior(
  behavior: UserPreferencesCollapseBehavior,
): Record<PipelineFileHeaderSectionId, boolean> {
  const open = behavior === "all_open";
  return {
    dealMessages: open,
    email: open,
    documents: open,
  };
}
