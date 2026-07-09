import type { PipelineBlockId } from "./pipelineBlockRegistry";
import {
  ALL_PIPELINE_BLOCK_IDS,
  getMandatoryPipelineBlockIds,
} from "./pipelineBlockRegistry";
import type { PipelineDrawerLayoutV1 } from "./pipelineDrawerLayoutStorage";

/** Registry mandatory ∪ admin-pinned ids (valid block ids only). */
export function getEffectiveMandatoryPipelineBlockIds(
  adminExtra: readonly string[] | undefined
): PipelineBlockId[] {
  const out = new Set<PipelineBlockId>(getMandatoryPipelineBlockIds());
  for (const id of adminExtra ?? []) {
    if (typeof id === "string" && ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) {
      out.add(id as PipelineBlockId);
    }
  }
  return [...out];
}

/**
 * Removes globally-disabled blocks from order/hidden/expanded, then strips
 * “cannot hide” ids from `hidden`.
 */
export function applyPipelineGlobalBlockPolicy(
  layout: PipelineDrawerLayoutV1,
  opts: {
    disabled: ReadonlySet<string>;
    nonHideable: ReadonlySet<string>;
  }
): PipelineDrawerLayoutV1 {
  const order = layout.order.filter((id) => !opts.disabled.has(id));
  const hidden = layout.hidden
    .filter((id) => !opts.disabled.has(id))
    .filter((id) => !opts.nonHideable.has(id));
  const expanded = { ...layout.expanded };
  for (const id of opts.disabled) {
    delete expanded[id as keyof typeof expanded];
  }
  let settings = layout.settings;
  if (settings && opts.disabled.size > 0) {
    settings = { ...settings };
    for (const id of opts.disabled) {
      delete settings[id as PipelineBlockId];
    }
    if (Object.keys(settings).length === 0) settings = undefined;
  }
  return { ...layout, order, hidden, expanded, settings };
}

export function stripNonHideableFromHidden(
  hidden: readonly string[],
  nonHideable: ReadonlySet<string>
): PipelineBlockId[] {
  const out: PipelineBlockId[] = [];
  const seen = new Set<string>();
  for (const id of hidden) {
    if (typeof id !== "string" || nonHideable.has(id)) continue;
    if (!ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id as PipelineBlockId);
  }
  return out;
}
