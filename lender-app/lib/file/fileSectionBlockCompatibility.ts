/**
 * Bridges hardcoded file sections (deal tabs, analysis tools, share sections)
 * with the pipeline {@link PipelineBlockId} registry. Strings like `"notes"` or
 * `"dti"` act as temporary block ids until those surfaces are first-class
 * `PIPELINE_BLOCKS` rows. Callers should branch on `resolveFileSection` and keep
 * rendering legacy components when `kind !== "pipelineRegistry"`.
 */
import type { ShareSectionId } from "@/convex/shareSections";
import { SECTION_LABELS, isShareSection } from "@/convex/shareSections";
import type { DealTabId } from "@/lib/file/dealTabGroups";
import {
  DEFAULT_DEAL_ANALYSIS_ORDER,
  DEAL_ANALYSIS_SECTION_LABELS,
  type DealAnalysisSectionId,
} from "@/lib/file/dealAnalysisLayoutStorage";
import {
  DEFAULT_DEAL_WORKSPACE_TAB_ORDER,
  DEAL_TAB_LABELS,
} from "@/lib/file/dealWorkspaceLayout";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getPipelineBlock,
  type PipelineBlockDefinition,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";

const DEAL_TAB_ID_SET = new Set<string>(DEFAULT_DEAL_WORKSPACE_TAB_ORDER);
const DEAL_ANALYSIS_ID_SET = new Set<string>(DEFAULT_DEAL_ANALYSIS_ORDER);

/** Deal workspace tab ids — each string is a stable temp block handle (e.g. `"notes"`). */
export const LEGACY_DEAL_TAB_TEMP_BLOCK_IDS: readonly DealTabId[] =
  DEFAULT_DEAL_WORKSPACE_TAB_ORDER;

/** Analysis tool ids inside the deal “Calculators & tools” surface (e.g. `"dti"`). */
export const LEGACY_DEAL_ANALYSIS_TEMP_BLOCK_IDS: readonly DealAnalysisSectionId[] =
  DEFAULT_DEAL_ANALYSIS_ORDER;

export function isRegisteredPipelineDrawerBlockId(
  id: string,
): id is PipelineBlockId {
  return ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId);
}

export function isLegacyDealTabTempBlockId(id: string): id is DealTabId {
  return DEAL_TAB_ID_SET.has(id);
}

export function isLegacyDealAnalysisTempBlockId(
  id: string,
): id is DealAnalysisSectionId {
  return DEAL_ANALYSIS_ID_SET.has(id);
}

export type ResolvedFileSection =
  | {
      kind: "pipelineRegistry";
      blockId: PipelineBlockId;
      definition: PipelineBlockDefinition;
    }
  | {
      kind: "legacyDealTab";
      blockId: DealTabId;
      label: string;
    }
  | {
      kind: "legacyDealAnalysis";
      blockId: DealAnalysisSectionId;
      label: string;
    }
  | { kind: "unknown"; rawId: string };

/**
 * Resolves a string handle: registered pipeline drawer blocks win; otherwise
 * known deal tabs and analysis tools fall back to legacy domains.
 */
export function resolveFileSection(rawId: string): ResolvedFileSection {
  const id = rawId.trim();
  if (!id) return { kind: "unknown", rawId: rawId };

  if (isRegisteredPipelineDrawerBlockId(id)) {
    return {
      kind: "pipelineRegistry",
      blockId: id,
      definition: getPipelineBlock(id),
    };
  }
  if (isLegacyDealAnalysisTempBlockId(id)) {
    return {
      kind: "legacyDealAnalysis",
      blockId: id,
      label: DEAL_ANALYSIS_SECTION_LABELS[id],
    };
  }
  if (isLegacyDealTabTempBlockId(id)) {
    return {
      kind: "legacyDealTab",
      blockId: id,
      label: DEAL_TAB_LABELS[id],
    };
  }
  return { kind: "unknown", rawId: id };
}

/** True when the drawer registry owns this id (vs legacy tab/analysis). */
export function fileSectionUsesBlockSystem(rawId: string): boolean {
  return resolveFileSection(rawId).kind === "pipelineRegistry";
}

/** True when this id should keep using existing Intake / analysis components. */
export function fileSectionUsesLegacyRenderer(rawId: string): boolean {
  const r = resolveFileSection(rawId);
  return r.kind === "legacyDealTab" || r.kind === "legacyDealAnalysis";
}

let _labelToShareId: ReadonlyMap<string, ShareSectionId> | null = null;

function shareLabelLookupMap(): ReadonlyMap<string, ShareSectionId> {
  if (_labelToShareId) return _labelToShareId;
  const m = new Map<string, ShareSectionId>();
  for (const [sectionId, label] of Object.entries(SECTION_LABELS) as [
    ShareSectionId,
    string,
  ][]) {
    m.set(sectionId, sectionId);
    m.set(label.trim().toLowerCase(), sectionId);
  }
  _labelToShareId = m;
  return m;
}

/**
 * Maps human-facing section labels (e.g. `"Notes"`, `"DTI"`) to the same temp
 * block ids used in layouts (`"notes"`, `"dti"`). Returns null if unrecognized.
 */
export function tempBlockIdFromSectionLabel(label: string): string | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  const shareId = shareLabelLookupMap().get(key);
  if (!shareId) return null;
  return shareId;
}

/**
 * Canonical temp block id for a shareable section key (already equals handle
 * for every current `ShareSectionId`).
 */
export function tempBlockIdFromShareSectionId(id: ShareSectionId): string {
  return id;
}
