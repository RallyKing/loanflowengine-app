import {
  ALL_PIPELINE_BLOCK_IDS,
  getPipelineBlock,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import { blockMeetsVisibilitySpec } from "@/lib/pipelineBlockVisibility";
import type { DrawerVisibilitySignals } from "@/lib/pipelineBlockVisibility";
import {
  buildActiveBlocksForLayout,
  type PipelineDrawerLayoutV1,
} from "@/lib/pipelineDrawerLayoutStorage";

function blockPassesContextVisibility(
  blockId: PipelineBlockId,
  signals: DrawerVisibilitySignals,
): boolean {
  const def = getPipelineBlock(blockId);
  if (def.isMandatory) return true;
  return blockMeetsVisibilitySpec(def.visibilityWhen, signals);
}

/**
 * Stable, safe list for parallel rendering: drops unknown ids, dedupes while
 * preserving first-seen order (prevents React key collisions / `getPipelineBlock` surprises).
 */
export function sanitizeActivePipelineBlockIdsForRender(
  ids: readonly string[]
): PipelineBlockId[] {
  const out: PipelineBlockId[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string") continue;
    if (!ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id as PipelineBlockId);
  }
  return out;
}

/**
 * Active (visible, non–globally-disabled) pipeline drawer block ids for one file,
 * in layout order. Mirrors the drawer’s primary `activeBlocks` list — used here
 * so parallel block rendering can share the same definition without drift.
 */
export function getActivePipelineBlockIdsForFile(args: {
  layout: PipelineDrawerLayoutV1;
  disabledBlockIds?: readonly string[] | null | undefined;
  /**
   * When set, blocks with registry `visibilityWhen` that fail the deal-context
   * check are omitted from the active list (data + layout unchanged).
   */
  visibilitySignals?: DrawerVisibilitySignals | null;
}): PipelineBlockId[] {
  let base = buildActiveBlocksForLayout(args.layout);
  const vis = args.visibilitySignals;
  if (vis) {
    base = base.filter((sid) => blockPassesContextVisibility(sid, vis));
  }
  const disabled = args.disabledBlockIds;
  if (!disabled?.length) return base;
  const d = new Set(disabled);
  return base.filter((sid) => !d.has(sid));
}
