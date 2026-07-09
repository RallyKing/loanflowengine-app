import {
  ALL_PIPELINE_BLOCK_IDS,
  PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";
import { DEFAULT_PIPELINE_DRAWER_ORDER } from "./pipelineDrawerLayoutStorage";
import { mergeBlockOrder } from "./userPreferencesNewFileDrawer";
import type { UserPreferencesV1 } from "./userPreferencesModel";

/** Insert `id` into `prev` at its canonical Global Block Registry position. */
export function insertBlockAtRegistryPosition(
  prev: readonly PipelineBlockId[],
  id: PipelineBlockId,
): PipelineBlockId[] {
  if (prev.includes(id)) return [...prev];
  const pos = PIPELINE_BLOCK_IDS.indexOf(id);
  if (pos < 0) return [...prev, id];
  let insertAt = prev.length;
  for (let i = 0; i < prev.length; i++) {
    const p = PIPELINE_BLOCK_IDS.indexOf(prev[i]);
    if (p > pos) {
      insertAt = i;
      break;
    }
  }
  const next = [...prev];
  next.splice(insertAt, 0, id);
  return next;
}

export function buildInitialIncludedOrderForEditor(
  prefs: UserPreferencesV1,
  nonHideable: ReadonlySet<PipelineBlockId>,
): PipelineBlockId[] {
  const def = [...DEFAULT_PIPELINE_DRAWER_ORDER];
  const mergedOrder =
    prefs.blockOrder.length > 0 ? mergeBlockOrder(prefs.blockOrder, def) : def;

  if (prefs.defaultBlocks.length > 0) {
    const vis = new Set(
      prefs.defaultBlocks.filter((id): id is PipelineBlockId =>
        ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
      ),
    );
    for (const m of nonHideable) {
      vis.add(m);
    }
    let out = mergedOrder.filter((id) => vis.has(id));
    // Optional registry blocks (not in the default drawer order) that the
    // user enabled must survive — insert them at their registry position.
    for (const id of vis) {
      if (!out.includes(id)) {
        out = insertBlockAtRegistryPosition(out, id);
      }
    }
    return out;
  }
  return mergedOrder;
}

export function cloneBlockSettings(
  s: UserPreferencesV1["newFileDrawerSettings"],
): UserPreferencesV1["newFileDrawerSettings"] {
  const out: UserPreferencesV1["newFileDrawerSettings"] = {};
  for (const [k, v] of Object.entries(s)) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k as PipelineBlockId] = { ...v };
    }
  }
  return out;
}
