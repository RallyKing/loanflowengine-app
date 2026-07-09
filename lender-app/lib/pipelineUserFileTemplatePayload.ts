/**
 * Build storable lists for user-defined pipeline file templates (Convex rows),
 * using the same coercion rules as personal new-file preferences.
 */
import {
  ALL_PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";
import { DEFAULT_PIPELINE_DRAWER_ORDER } from "./pipelineDrawerLayoutStorage";
import {
  coerceUserDrawerPreferenceLists,
  mergeBlockOrder,
} from "./userPreferencesNewFileDrawer";
import type { PipelineFileTemplatePayload } from "./pipelineFileTemplates";

function layoutsEqual(
  a: PipelineBlockId[],
  b: readonly PipelineBlockId[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Returns ordered `includedBlocks` and `blockOrder` for persistence and for
 * `applyPipelineFileTemplatePayloadToLayout`.
 */
export function buildStorableUserTemplateLists(
  includedOrder: PipelineBlockId[],
  effectiveMandatory: readonly PipelineBlockId[],
): { includedBlocks: PipelineBlockId[]; blockOrder: PipelineBlockId[] } {
  const fullSet = new Set(DEFAULT_PIPELINE_DRAWER_ORDER);
  const includedSet = new Set(includedOrder);
  const sameMemberSet =
    includedSet.size === fullSet.size &&
    DEFAULT_PIPELINE_DRAWER_ORDER.every((id) => includedSet.has(id));

  if (sameMemberSet) {
    const orderChanged = !layoutsEqual(
      includedOrder,
      DEFAULT_PIPELINE_DRAWER_ORDER,
    );
    const lists = coerceUserDrawerPreferenceLists(effectiveMandatory, {
      defaultBlocks: [],
      blockOrder: orderChanged ? [...includedOrder] : [],
    });
    const order =
      lists.blockOrder.length > 0
        ? mergeBlockOrder(lists.blockOrder, [...DEFAULT_PIPELINE_DRAWER_ORDER])
        : [...DEFAULT_PIPELINE_DRAWER_ORDER];
    return { includedBlocks: order, blockOrder: order };
  }

  const lists = coerceUserDrawerPreferenceLists(effectiveMandatory, {
    defaultBlocks: [...includedOrder],
    blockOrder: [...includedOrder],
  });
  const blockOrder =
    lists.blockOrder.length > 0 ? lists.blockOrder : lists.defaultBlocks;
  const inc = lists.defaultBlocks.filter((id): id is PipelineBlockId =>
    ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
  );
  const ord = blockOrder.filter((id): id is PipelineBlockId =>
    ALL_PIPELINE_BLOCK_IDS.has(id as PipelineBlockId),
  );
  return { includedBlocks: inc, blockOrder: ord.length > 0 ? ord : inc };
}

export function sanitizeUserTemplateDefaultSettings(
  raw: unknown,
  allowedBlockIds: ReadonlySet<PipelineBlockId>,
): PipelineFileTemplatePayload["defaultSettings"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PipelineFileTemplatePayload["defaultSettings"] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!ALL_PIPELINE_BLOCK_IDS.has(k as PipelineBlockId)) continue;
    if (!allowedBlockIds.has(k as PipelineBlockId)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    out[k as PipelineBlockId] = { ...(v as Record<string, unknown>) };
  }
  return out;
}
