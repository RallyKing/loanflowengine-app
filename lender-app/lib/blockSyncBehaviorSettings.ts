/**
 * Account-level pipeline **shared bus** behavior (`UserPreferences.behaviorSettings`).
 * Keys are flat so other features can add unrelated entries in the same bag.
 */

export const BLOCK_SYNC_BEHAVIOR_KEYS = {
  autoSyncShared: "blockDataAutoSyncShared",
  allowOverrides: "blockDataAllowOverrides",
} as const;

export type BlockSyncBehaviorParsed = {
  /** When true (default), edits to shared fields write through to Convex immediately. */
  autoSyncSharedAcrossBlocks: boolean;
  /** When false, hide “detach / block-only” affordances for funding & rate. */
  allowOverrides: boolean;
};

const DEFAULT_BLOCK_SYNC: BlockSyncBehaviorParsed = {
  autoSyncSharedAcrossBlocks: true,
  allowOverrides: true,
};

export function parseBlockSyncBehavior(
  behaviorSettings: Record<string, unknown> | undefined | null,
): BlockSyncBehaviorParsed {
  if (!behaviorSettings || typeof behaviorSettings !== "object") {
    return { ...DEFAULT_BLOCK_SYNC };
  }
  const auto = behaviorSettings[BLOCK_SYNC_BEHAVIOR_KEYS.autoSyncShared];
  const allow = behaviorSettings[BLOCK_SYNC_BEHAVIOR_KEYS.allowOverrides];
  return {
    autoSyncSharedAcrossBlocks:
      typeof auto === "boolean" ? auto : DEFAULT_BLOCK_SYNC.autoSyncSharedAcrossBlocks,
    allowOverrides:
      typeof allow === "boolean" ? allow : DEFAULT_BLOCK_SYNC.allowOverrides,
  };
}

/** Shallow merge of sync flags into an existing `behaviorSettings` object. */
export function mergeBlockSyncBehaviorIntoSettings(
  base: Record<string, unknown>,
  patch: Partial<BlockSyncBehaviorParsed>,
): Record<string, unknown> {
  const next = { ...base };
  if (patch.autoSyncSharedAcrossBlocks !== undefined) {
    next[BLOCK_SYNC_BEHAVIOR_KEYS.autoSyncShared] =
      patch.autoSyncSharedAcrossBlocks;
  }
  if (patch.allowOverrides !== undefined) {
    next[BLOCK_SYNC_BEHAVIOR_KEYS.allowOverrides] = patch.allowOverrides;
  }
  return next;
}
