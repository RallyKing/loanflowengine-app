import type { FileSharedNumericFieldKey } from "@/lib/fileSharedFields";

/** Sync / override flags for one numeric block field (UI indicators later). */
export type BlockFieldSyncMeta = {
  /**
   * True when the effective display matches the **file-level shared bus** value
   * (`resolvedField.shared`), there is **no** ephemeral local mask, and the
   * server row is not using a persisted block override (`source === "shared"`).
   */
  isSynced: boolean;
  /** True when an ephemeral local override exists for this `(fileId, blockId)`. */
  isOverridden: boolean;
};

export type BlockFieldSyncMap = Record<
  FileSharedNumericFieldKey,
  BlockFieldSyncMeta
>;

export type BlockDataResolvedFieldLike = {
  shared: number;
  display: number;
  source: "shared" | "override";
};

/**
 * Derives sync metadata for one field. Pure — safe to call from hooks/tests.
 * Persisted Convex state (`patchShared`, `setBlockOverride`) remains the source
 * of truth; this only interprets it plus optional local masks.
 */
export function computeBlockFieldSyncMeta(
  resolvedField: BlockDataResolvedFieldLike,
  effectiveDisplay: number,
  localOverride: number | undefined
): BlockFieldSyncMeta {
  const isOverridden = localOverride !== undefined;
  const isSynced =
    !isOverridden &&
    resolvedField.source === "shared" &&
    effectiveDisplay === resolvedField.shared;
  return { isSynced, isOverridden };
}

export function computeBlockFieldSyncMap(args: {
  funding: BlockDataResolvedFieldLike;
  rate: BlockDataResolvedFieldLike;
  displayFunding: number;
  displayRate: number;
  localFunding: number | undefined;
  localRate: number | undefined;
}): BlockFieldSyncMap {
  return {
    fundingAmount: computeBlockFieldSyncMeta(
      args.funding,
      args.displayFunding,
      args.localFunding
    ),
    interestRate: computeBlockFieldSyncMeta(
      args.rate,
      args.displayRate,
      args.localRate
    ),
  };
}
