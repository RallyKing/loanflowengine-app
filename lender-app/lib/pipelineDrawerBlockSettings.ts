import {
  getPipelineBlock,
  type PipelineBlockId,
} from "./pipelineBlockRegistry";
import { mergeBlockSettingsWithSchemaDefaults } from "./pipelineBlockSettingsSchema";
import type {
  PipelineDrawerLayoutV1,
  PipelineDrawerSectionId,
} from "./pipelineDrawerLayoutStorage";

/** Raw persisted bag for one block (empty object if missing / invalid). */
export function getRawDrawerBlockSettings(
  layout: PipelineDrawerLayoutV1,
  blockId: PipelineBlockId,
): Record<string, unknown> {
  const bag = layout.settings?.[blockId as PipelineDrawerSectionId];
  return bag && typeof bag === "object" && !Array.isArray(bag)
    ? { ...bag }
    : {};
}

/**
 * Stored settings merged with registry `settingsSchema` defaults
 * (see `mergeBlockSettingsWithSchemaDefaults`).
 */
export function resolveDrawerBlockSettings(
  blockId: PipelineBlockId,
  layout: PipelineDrawerLayoutV1,
): Record<string, unknown> {
  const def = getPipelineBlock(blockId);
  const raw = getRawDrawerBlockSettings(layout, blockId);
  return mergeBlockSettingsWithSchemaDefaults(def.settingsSchema, raw);
}

/** Immutable: set one block’s settings object (shallow replace of that block’s bag). */
export function setDrawerBlockSettings(
  layout: PipelineDrawerLayoutV1,
  blockId: PipelineBlockId,
  next: Record<string, unknown>,
): PipelineDrawerLayoutV1 {
  return {
    ...layout,
    settings: {
      ...layout.settings,
      [blockId]: { ...next },
    },
  };
}
