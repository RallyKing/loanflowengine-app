"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  blockDataLocalOverrideStore,
  EMPTY_BLOCK_LOCAL_OVERRIDES,
} from "@/lib/blockDataLocalOverrideStore";
import {
  computeBlockFieldSyncMap,
  type BlockFieldSyncMap,
  type BlockFieldSyncMeta,
} from "@/lib/blockDataFieldSync";
import type { FileSharedNumericFieldKey } from "@/lib/fileSharedFields";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import {
  parseBlockSyncBehavior,
  type BlockSyncBehaviorParsed,
} from "@/lib/blockSyncBehaviorSettings";

export type { BlockFieldSyncMap, BlockFieldSyncMeta } from "@/lib/blockDataFieldSync";

/** One numeric field as returned from Convex `getResolvedForBlock`. */
export type BlockDataResolvedField = {
  shared: number;
  display: number;
  source: "shared" | "override";
};

export type BlockDataServerResolved = {
  fileId: Id<"pipeline">;
  blockId: string;
  fields: {
    fundingAmount: BlockDataResolvedField;
    interestRate: BlockDataResolvedField;
  };
};

export type UseBlockDataOptions = {
  /**
   * When the deal workspace drives loan amount, use this for the displayed
   * “shared” funding unless the block has a server override.
   */
  tableFundingAmount?: number;
  dealBacked?: boolean;
  /** Account `behaviorSettings` slice; defaults to full auto-sync + overrides allowed. */
  blockSyncBehavior?: BlockSyncBehaviorParsed;
  /** Browser account id — passed to Convex for notification attribution. */
  preferencesAccountId?: string;
};

export type BlockDataDisplayValues = {
  fundingAmount: number;
  interestRate: number;
};

export type UseBlockDataResult = {
  loading: boolean;
  /** Convex row: shared bus + server per-block overrides (no ephemeral local). */
  resolved: BlockDataServerResolved | null;
  /**
   * Effective UI values: **`localOverride ?? resolved.fields.*.display`**.
   * Updates from Convex (shared) and from any hook instance mutating the
   * same `(fileId, blockId)` local store.
   */
  displayValues: BlockDataDisplayValues | null;
  /** Stable string for `useEffect` deps when either server or local display stack changes. */
  displaySignature: string;
  /** Shallow flags for which fields have an ephemeral local mask. */
  localMask: { fundingAmount: boolean; interestRate: boolean };
  /**
   * Per-field sync flags for this `(fileId, blockId)` — derived from Convex +
   * local store. Ephemeral locals are keyed only in memory; persisted overrides
   * live in Convex (`fileBlockFieldOverrides`).
   */
  fieldSync: BlockFieldSyncMap | null;
  getFieldSync: (key: FileSharedNumericFieldKey) => BlockFieldSyncMeta | null;
  getDisplay: (key: FileSharedNumericFieldKey) => number | null;
  /** Ephemeral local value for one field, if set. */
  getLocalOverride: (key: FileSharedNumericFieldKey) => number | undefined;
  setLocalOverride: (key: FileSharedNumericFieldKey, value: number | null) => void;
  clearLocalOverrides: () => void;
  /** Convex-only resolved field (server override + shared); excludes ephemeral local. */
  field: (key: FileSharedNumericFieldKey) => BlockDataResolvedField | null;
  setSharedValue: (partial: {
    fundingAmount?: number;
    interestRate?: number;
  }) => Promise<void>;
  setFieldOverride: (
    key: FileSharedNumericFieldKey,
    value: number
  ) => Promise<void>;
  clearFieldOverride: (key: FileSharedNumericFieldKey) => Promise<void>;
  /**
   * Writes a numeric edit using shared vs local rules (`blockSyncBehavior` +
   * resolved `source`). Does not apply when `dealBacked` bypasses the bus —
   * callers should branch first.
   */
  commitSharedNumeric: (
    key: FileSharedNumericFieldKey,
    value: number,
    resolvedField: BlockDataResolvedField,
  ) => Promise<void>;
  /** Clears persisted block override and any ephemeral local mask for one field. */
  resetFieldToShared: (key: FileSharedNumericFieldKey) => Promise<void>;
  /** Pushes the current **display** value (including local mask) to the shared bus. */
  pushLocalFieldToShared: (key: FileSharedNumericFieldKey) => Promise<void>;
};

/**
 * Field-level access to the pipeline shared bus + server per-block overrides +
 * ephemeral **local** overrides (same `(fileId, blockId)` syncs across
 * components via `useSyncExternalStore`).
 *
 * **Display rule:** `display = localOverride ?? serverDisplay`, where
 * `serverDisplay` already reflects Convex `override ?? shared`.
 *
 * After successful **shared** or **server override** mutations, matching local
 * masks are cleared so Convex subscriptions cannot appear “stale” behind
 * old local numbers.
 */
export function useBlockData(
  fileId: Id<"pipeline"> | null,
  blockId: PipelineBlockId,
  options: UseBlockDataOptions = {}
): UseBlockDataResult {
  const { tableFundingAmount, dealBacked, blockSyncBehavior: blockSyncOpt, preferencesAccountId } =
    options;
  const blockSyncBehavior = blockSyncOpt ?? parseBlockSyncBehavior(null);

  const accountPatch = useMemo(
    () =>
      preferencesAccountId != null && preferencesAccountId.trim().length > 0
        ? { preferencesAccountId: preferencesAccountId.trim() }
        : {},
    [preferencesAccountId],
  );

  const memberUserKey =
    preferencesAccountId != null && preferencesAccountId.trim().length > 0
      ? preferencesAccountId.trim()
      : undefined;

  const resolved = useQuery(
    api.fileSharedState.getResolvedForBlock,
    fileId
      ? { fileId, blockId, memberUserKey }
      : "skip",
  );

  const localPartial = useSyncExternalStore(
    (onStoreChange) => {
      if (!fileId) return () => {};
      return blockDataLocalOverrideStore.subscribe(fileId, blockId, onStoreChange);
    },
    () =>
      fileId
        ? blockDataLocalOverrideStore.getSnapshot(fileId, blockId)
        : EMPTY_BLOCK_LOCAL_OVERRIDES,
    () => EMPTY_BLOCK_LOCAL_OVERRIDES
  );

  const patchShared = useMutation(api.fileSharedState.patchShared);
  const setOverride = useMutation(api.fileSharedState.setBlockOverride);
  const clearOverride = useMutation(api.fileSharedState.clearBlockOverride);

  const merged = useMemo((): BlockDataServerResolved | null => {
    if (!resolved) return null;
    const f = resolved.fields.fundingAmount;
    const table = tableFundingAmount;
    if (dealBacked && table != null && Number.isFinite(table)) {
      if (f.source === "override") {
        return resolved as BlockDataServerResolved;
      }
      return {
        ...resolved,
        fields: {
          ...resolved.fields,
          fundingAmount: {
            ...f,
            shared: f.shared,
            display: table,
            source: "shared" as const,
          },
        },
      } as BlockDataServerResolved;
    }
    return resolved as BlockDataServerResolved;
  }, [resolved, dealBacked, tableFundingAmount]);

  const displayValues = useMemo((): BlockDataDisplayValues | null => {
    if (!merged) return null;
    return {
      fundingAmount:
        localPartial.fundingAmount ?? merged.fields.fundingAmount.display,
      interestRate:
        localPartial.interestRate ?? merged.fields.interestRate.display,
    };
  }, [merged, localPartial]);

  const fieldSync = useMemo((): BlockFieldSyncMap | null => {
    if (!merged || !displayValues) return null;
    return computeBlockFieldSyncMap({
      funding: merged.fields.fundingAmount,
      rate: merged.fields.interestRate,
      displayFunding: displayValues.fundingAmount,
      displayRate: displayValues.interestRate,
      localFunding: localPartial.fundingAmount,
      localRate: localPartial.interestRate,
    });
  }, [merged, displayValues, localPartial]);

  const displaySignature = useMemo(() => {
    if (!merged || !displayValues) return "loading";
    return JSON.stringify({
      d: displayValues,
      local: localPartial,
      server: merged.fields,
      sync: fieldSync,
      dealBacked: Boolean(dealBacked),
      tableFundingAmount:
        tableFundingAmount != null && Number.isFinite(tableFundingAmount)
          ? tableFundingAmount
          : null,
    });
  }, [
    merged,
    displayValues,
    localPartial,
    fieldSync,
    dealBacked,
    tableFundingAmount,
  ]);

  const localMask = useMemo(
    () => ({
      fundingAmount: localPartial.fundingAmount !== undefined,
      interestRate: localPartial.interestRate !== undefined,
    }),
    [localPartial]
  );

  const getFieldSync = useCallback(
    (key: FileSharedNumericFieldKey) => fieldSync?.[key] ?? null,
    [fieldSync]
  );

  const getDisplay = useCallback(
    (key: FileSharedNumericFieldKey) => displayValues?.[key] ?? null,
    [displayValues]
  );

  const getLocalOverride = useCallback(
    (key: FileSharedNumericFieldKey) => localPartial[key],
    [localPartial]
  );

  const setLocalOverride = useCallback(
    (key: FileSharedNumericFieldKey, value: number | null) => {
      if (!fileId) return;
      if (value === null) {
        blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
        return;
      }
      if (!Number.isFinite(value)) return;
      blockDataLocalOverrideStore.setField(fileId, blockId, key, value);
    },
    [fileId, blockId]
  );

  const clearLocalOverrides = useCallback(() => {
    if (!fileId) return;
    blockDataLocalOverrideStore.clear(fileId, blockId);
  }, [fileId, blockId]);

  const setSharedValue = useCallback(
    async (partial: { fundingAmount?: number; interestRate?: number }) => {
      if (!fileId) return;
      await patchShared({ fileId, ...partial, ...accountPatch });
      for (const key of Object.keys(partial) as FileSharedNumericFieldKey[]) {
        if (partial[key] !== undefined) {
          blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
        }
      }
    },
    [fileId, blockId, patchShared, accountPatch]
  );

  const setFieldOverride = useCallback(
    async (key: FileSharedNumericFieldKey, value: number) => {
      if (!fileId) return;
      await setOverride({ fileId, blockId, fieldKey: key, value });
      blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
    },
    [fileId, blockId, setOverride]
  );

  const clearFieldOverride = useCallback(
    async (key: FileSharedNumericFieldKey) => {
      if (!fileId) return;
      await clearOverride({ fileId, blockId, fieldKey: key });
      blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
    },
    [fileId, blockId, clearOverride]
  );

  const commitSharedNumeric = useCallback(
    async (
      key: FileSharedNumericFieldKey,
      value: number,
      resolvedField: BlockDataResolvedField,
    ) => {
      if (!fileId) return;
      if (!Number.isFinite(value)) return;
      if (resolvedField.source === "override") {
        await setOverride({ fileId, blockId, fieldKey: key, value });
        blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
        return;
      }
      if (blockSyncBehavior.autoSyncSharedAcrossBlocks) {
        await patchShared(
          key === "fundingAmount"
            ? { fileId, fundingAmount: value, ...accountPatch }
            : { fileId, interestRate: value, ...accountPatch },
        );
        blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
      } else {
        blockDataLocalOverrideStore.setField(fileId, blockId, key, value);
      }
    },
    [fileId, blockId, blockSyncBehavior.autoSyncSharedAcrossBlocks, setOverride, patchShared, accountPatch],
  );

  const resetFieldToShared = useCallback(
    async (key: FileSharedNumericFieldKey) => {
      if (!fileId) return;
      const f = merged?.fields[key];
      if (f?.source === "override") {
        await clearOverride({ fileId, blockId, fieldKey: key });
      }
      blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
    },
    [fileId, blockId, merged, clearOverride],
  );

  const pushLocalFieldToShared = useCallback(
    async (key: FileSharedNumericFieldKey) => {
      if (!fileId || !displayValues) return;
      const v = displayValues[key];
      if (!Number.isFinite(v)) return;
      await patchShared(
        key === "fundingAmount"
          ? { fileId, fundingAmount: v, ...accountPatch }
          : { fileId, interestRate: v, ...accountPatch },
      );
      blockDataLocalOverrideStore.setField(fileId, blockId, key, undefined);
    },
    [fileId, blockId, displayValues, patchShared, accountPatch],
  );

  const field = useCallback(
    (key: FileSharedNumericFieldKey) => merged?.fields[key] ?? null,
    [merged]
  );

  return {
    loading: Boolean(fileId) && resolved === undefined,
    resolved: merged,
    displayValues,
    displaySignature,
    localMask,
    fieldSync,
    getFieldSync,
    getDisplay,
    getLocalOverride,
    setLocalOverride,
    clearLocalOverrides,
    setSharedValue,
    setFieldOverride,
    clearFieldOverride,
    field,
    commitSharedNumeric,
    resetFieldToShared,
    pushLocalFieldToShared,
  };
}
