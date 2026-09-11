"use client";

import { useMutation, useQuery } from "convex/react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { traceConvexMutation } from "@/lib/convexWriteStormGovernance";
import { embeddedDealPayloadIsSubstantive } from "@/lib/file/embeddedDealPresence";
import type { DealWorkspaceLayoutV1 } from "@/lib/file/dealWorkspaceLayout";
import { parseDealWorkspaceLayoutFromUnknown } from "@/lib/file/dealWorkspaceLayout";
import {
  parseDealAnalysisLayoutFromUnknown,
  type DealAnalysisLayoutV1,
} from "@/lib/file/dealAnalysisLayoutStorage";
import {
  parseDealInfoLayoutFromUnknown,
  type DealInfoLayoutV1,
} from "@/lib/file/dealInfoTabLayout";
import {
  parseDealInfoCommandCenterLayoutFromUnknown,
  type DealInfoCommandCenterLayoutV1,
} from "@/lib/file/dealInfoCommandCenterLayout";
import {
  parseClientPortalTabLayoutFromUnknown,
  type ClientPortalTabLayoutV1,
} from "@/lib/file/clientPortalTabLayout";
import {
  parsePortalsProgressTabLayoutFromUnknown,
  type PortalsProgressTabLayoutV1,
} from "@/lib/file/portalsProgressTabLayout";
import {
  parseOverviewTabLayoutFromUnknown,
  type OverviewTabLayoutV1,
} from "@/lib/file/overviewTabLayout";
import {
  parseDealWorkspaceTab3LayoutFromUnknown,
  type DealWorkspaceTab3LayoutV1,
} from "@/lib/file/dealWorkspaceTab3Layout";
import {
  buildDealAnalysisExpandedForMode,
  buildDealWorkspaceExpandedForMode,
} from "@/lib/file/fileSectionExpandPolicy";
import {
  BACKEND_SYNC_LOCK_MS,
  createDebouncedFlush,
  dealSheetDeepEqual,
  filterNoOpDealChanges,
  LAYOUT_PATCH_DEBOUNCE_MS,
  layoutPayloadJsonEqual,
  mergeServerSheetIntoDraft,
  PATCH_DEAL_MAX_AUTO_RETRIES,
  patchDealRetryDelayMs,
  type DebouncedFlushHandle,
} from "@/lib/file/dealLayoutAutosave";
import type {
  DealWorkspaceSheet,
  DealWorkspaceUpdater,
} from "@/lib/file/dealSectionTypes";
import type { FileSectionDefaultMode } from "@/lib/userSettingsStorage";
import { useOfflineSync } from "@/lib/offline/OfflineSyncContext";
import { isPatchDealConflictResult } from "@/lib/pipeline/patchDealResult";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useUserSettings } from "@/lib/userSettingsContext";
import { intakeAutosaveDelayMs } from "@/lib/userSettingsStorage";

type Sheet = DealWorkspaceSheet;
type Patch = Partial<Sheet>;

type DealEditorBundle = {
  pipeline: Doc<"pipeline">;
  sheet: Sheet | null;
};

/** Local-only collapse-mode overlay — never written to pendingPatch / patchDeal. */
function applyLocalCollapseModeOverlay(
  sheet: Sheet,
  mode: FileSectionDefaultMode,
): Sheet {
  const ws = parseDealWorkspaceLayoutFromUnknown(sheet.dealWorkspaceLayout);
  const an = parseDealAnalysisLayoutFromUnknown(sheet.dealAnalysisLayout);
  const wsExp = buildDealWorkspaceExpandedForMode(mode, sheet);
  const anExp = buildDealAnalysisExpandedForMode(mode, sheet);
  const nws: DealWorkspaceLayoutV1 = {
    ...ws,
    expanded: { ...ws.expanded, ...wsExp },
  };
  const nan = {
    ...an,
    expanded: { ...an.expanded, ...anExp },
  };
  if (layoutPayloadJsonEqual(nws, ws) && layoutPayloadJsonEqual(nan, an)) {
    return sheet;
  }
  return {
    ...sheet,
    dealWorkspaceLayout: nws as never,
    dealAnalysisLayout: nan as never,
  };
}

export type DealWorkspaceEditorState = {
  fileId: Id<"pipeline">;
  dealBundle: DealEditorBundle | null | undefined;
  sheet: Sheet | null | undefined;
  shareIntakeId: Id<"intakeSheets"> | undefined;
  draft: Sheet | null;
  update: DealWorkspaceUpdater;
  /** Optimistic draft patch without queueing patchDeal (Tab 2 dual-write). */
  updateDraftOnly: DealWorkspaceUpdater;
  /** Prevent Convex sheet subscription from overwriting in-flight dual-write keys. */
  blockServerMergeForKeys: (keys: (keyof Sheet)[]) => void;
  unblockServerMergeForKeys: (keys: (keyof Sheet)[]) => void;
  patchDealWorkspaceLayout: (
    action: SetStateAction<DealWorkspaceLayoutV1>,
  ) => void;
  patchDealAnalysisLayout: (
    action: SetStateAction<DealAnalysisLayoutV1>,
  ) => void;
  patchDealWorkspaceTab3Layout: (
    action: SetStateAction<DealWorkspaceTab3LayoutV1>,
  ) => void;
  patchDealInfoTabLayout: (action: SetStateAction<DealInfoLayoutV1>) => void;
  patchDealInfoCommandCenterLayout: (
    action: SetStateAction<DealInfoCommandCenterLayoutV1>,
  ) => void;
  patchOverviewTabLayout: (
    action: SetStateAction<OverviewTabLayoutV1>,
  ) => void;
  patchClientPortalTabLayout: (
    action: SetStateAction<ClientPortalTabLayoutV1>,
  ) => void;
  patchPortalsProgressTabLayout: (
    action: SetStateAction<PortalsProgressTabLayoutV1>,
  ) => void;
  flush: () => Promise<void>;
  /** Unpersisted local edits awaiting debounced flush. */
  isDirty: boolean;
  /** True while a patchDeal flush is in flight. */
  isUpdating: boolean;
  saving: boolean;
  savedAt: number | null;
  dealInitStatus: "idle" | "pending" | "error";
  setDealInitStatus: Dispatch<SetStateAction<"idle" | "pending" | "error">>;
  dealInitAttemptedForFile: React.MutableRefObject<string | null>;
  initDealDataIfMissing: ReturnType<
    typeof useMutation<typeof api.pipeline.initDealDataIfMissing>
  >;
  preferencesAccountId: string | undefined;
  pipelineHasEmbeddedDealData: boolean;
  needsDealBootstrap: boolean;
};

const DealWorkspaceEditorContext = createContext<DealWorkspaceEditorState | null>(
  null,
);

export function useDealWorkspaceEditorState(
  fileId: Id<"pipeline">,
): DealWorkspaceEditorState {
  const offline = useOfflineSync();
  const { settings } = useUserSettings();
  const { accountId } = useUserPreferences();
  const memberUserKey = accountId.trim() || undefined;
  const preferencesAccountId = memberUserKey;

  const dealBundle = useQuery(
    api.pipeline.getDealForEditor,
    fileId
      ? {
          fileId,
          ...(memberUserKey ? { memberUserKey } : {}),
        }
      : "skip",
  );

  const sheet = dealBundle?.sheet;
  const shareIntakeId = dealBundle?.pipeline?.intakeSheetId ?? undefined;

  const patchDealMut = useMutation(api.pipeline.patchDeal);
  const initDealDataIfMissing = useMutation(api.pipeline.initDealDataIfMissing);

  const [draft, setDraft] = useState<Sheet | null>(null);
  const [dealInitStatus, setDealInitStatus] = useState<
    "idle" | "pending" | "error"
  >("idle");
  const dealInitAttemptedForFile = useRef<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  const pendingPatchRef = useRef<Patch>({});
  const collapseModeApplyRef = useRef<string | null>(null);
  const flushInFlightRef = useRef(false);
  const flushPendingRef = useRef(false);
  const flushingKeysRef = useRef<Set<string>>(new Set());
  const mergeBlockKeysRef = useRef<Set<string>>(new Set());
  const isSyncingFromBackend = useRef(false);
  const syncLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedSheetRef = useRef<Sheet | null>(null);
  const debouncedFlushRef = useRef<DebouncedFlushHandle | null>(null);
  const flushImplRef = useRef<() => Promise<void>>(async () => {});
  /** OCC override after CONFLICT — next flush must use serverUpdatedAt, not stale bundle. */
  const expectedUpdatedAtOverrideRef = useRef<number | null>(null);
  const flushFailCountRef = useRef(0);
  /** When true, finally must not re-arm the 500ms hammer loop. */
  const stopAutoRetryRef = useRef(false);

  function beginBackendSyncLock() {
    isSyncingFromBackend.current = true;
    if (syncLockTimer.current) clearTimeout(syncLockTimer.current);
    syncLockTimer.current = setTimeout(() => {
      isSyncingFromBackend.current = false;
      syncLockTimer.current = null;
      if (flushPendingRef.current && isDirtyRef.current) {
        flushPendingRef.current = false;
        debouncedFlushRef.current?.schedule(LAYOUT_PATCH_DEBOUNCE_MS);
      }
    }, BACKEND_SYNC_LOCK_MS);
  }

  function autosaveBlocked(): boolean {
    return isSyncingFromBackend.current || flushInFlightRef.current;
  }

  function setDirtyState(next: boolean) {
    isDirtyRef.current = next;
    setIsDirty(next);
  }

  function markDirty(delayMs: number) {
    stopAutoRetryRef.current = false;
    flushFailCountRef.current = 0;
    if (isSyncingFromBackend.current) {
      flushPendingRef.current = true;
      return;
    }
    if (!isDirtyRef.current) {
      setDirtyState(true);
    }
    debouncedFlushRef.current?.schedule(delayMs);
  }

  if (!debouncedFlushRef.current) {
    debouncedFlushRef.current = createDebouncedFlush(
      () => flushImplRef.current(),
      () => isDirtyRef.current,
      () => autosaveBlocked(),
    );
  }

  function patchLayoutField<K extends keyof Sheet>(
    field: K,
    parse: (raw: Sheet[K]) => unknown,
    action: SetStateAction<unknown>,
  ) {
    let didChange = false;
    setDraft((prev) => {
      if (!prev) return prev;
      const cur = parse(prev[field]);
      const next =
        typeof action === "function"
          ? (action as (value: unknown) => unknown)(cur)
          : action;
      if (layoutPayloadJsonEqual(next, cur)) return prev;
      didChange = true;
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        [field]: next as Sheet[K],
      };
      return { ...prev, [field]: next as Sheet[K] };
    });
    if (didChange) markDirty(LAYOUT_PATCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    setDealInitStatus("idle");
    dealInitAttemptedForFile.current = null;
    collapseModeApplyRef.current = null;
    lastSyncedSheetRef.current = null;
    pendingPatchRef.current = {};
    expectedUpdatedAtOverrideRef.current = null;
    flushFailCountRef.current = 0;
    stopAutoRetryRef.current = false;
    setDirtyState(false);
    debouncedFlushRef.current?.cancel();
    setDraft(null);
  }, [fileId]);

  useEffect(() => {
    const serverAt = dealBundle?.pipeline?.updatedAt;
    if (serverAt === undefined) return;
    const override = expectedUpdatedAtOverrideRef.current;
    if (override != null && serverAt >= override) {
      expectedUpdatedAtOverrideRef.current = null;
    }
  }, [dealBundle?.pipeline?.updatedAt]);

  const pipelineHasEmbeddedDealData = embeddedDealPayloadIsSubstantive(
    dealBundle?.pipeline?.dealData,
  );

  useEffect(() => {
    if (!fileId || !dealBundle?.pipeline) return;
    if (pipelineHasEmbeddedDealData) return;
    if (dealInitAttemptedForFile.current === fileId) return;
    dealInitAttemptedForFile.current = fileId;
    setDealInitStatus("pending");
    traceConvexMutation("useDealWorkspaceEditor", "pipeline.initDealDataIfMissing");
    void initDealDataIfMissing({
      fileId,
      ...(preferencesAccountId ? { preferencesAccountId } : {}),
    })
      .then(() => setDealInitStatus("idle"))
      .catch(() => setDealInitStatus("error"));
  }, [
    fileId,
    dealBundle?.pipeline,
    initDealDataIfMissing,
    pipelineHasEmbeddedDealData,
    preferencesAccountId,
  ]);

  /** Pull server sheet into draft — never marks dirty or schedules flush. */
  useEffect(() => {
    if (!sheet) return;
    if (
      lastSyncedSheetRef.current &&
      dealSheetDeepEqual(
        lastSyncedSheetRef.current as Record<string, unknown>,
        sheet as Record<string, unknown>,
      )
    ) {
      return;
    }
    lastSyncedSheetRef.current = sheet;
    beginBackendSyncLock();

    const collapseKey = `${String(fileId)}:${settings.fileSectionDefaultMode}`;

    setDraft((prev) => {
      if (!prev) {
        const withCollapse =
          collapseModeApplyRef.current === collapseKey
            ? sheet
            : applyLocalCollapseModeOverlay(
                sheet,
                settings.fileSectionDefaultMode,
              );
        collapseModeApplyRef.current = collapseKey;
        if (
          dealSheetDeepEqual(
            withCollapse as Record<string, unknown>,
            sheet as Record<string, unknown>,
          )
        ) {
          return sheet;
        }
        return withCollapse;
      }

      const merged = mergeServerSheetIntoDraft(
        prev,
        sheet,
        pendingPatchRef.current,
        flushingKeysRef.current,
        mergeBlockKeysRef.current,
      );
      if (
        dealSheetDeepEqual(
          prev as Record<string, unknown>,
          merged as Record<string, unknown>,
        )
      ) {
        return prev;
      }
      return merged;
    });
  }, [sheet, fileId, settings.fileSectionDefaultMode]);

  function update<K extends keyof Sheet>(key: K, value: Sheet[K]) {
    let didChange = false;
    setDraft((prev) => {
      if (!prev) return prev;
      if (layoutPayloadJsonEqual(prev[key], value)) return prev;
      didChange = true;
      pendingPatchRef.current = { ...pendingPatchRef.current, [key]: value };
      return { ...prev, [key]: value };
    });
    if (didChange) {
      markDirty(intakeAutosaveDelayMs(settings.intakeAutosaveCadence));
    }
  }

  function updateDraftOnly<K extends keyof Sheet>(key: K, value: Sheet[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function blockServerMergeForKeys(keys: (keyof Sheet)[]) {
    for (const key of keys) {
      mergeBlockKeysRef.current.add(key as string);
    }
  }

  function unblockServerMergeForKeys(keys: (keyof Sheet)[]) {
    for (const key of keys) {
      mergeBlockKeysRef.current.delete(key as string);
    }
  }

  function patchDealWorkspaceLayout(
    action: SetStateAction<DealWorkspaceLayoutV1>,
  ) {
    patchLayoutField(
      "dealWorkspaceLayout",
      (raw) => parseDealWorkspaceLayoutFromUnknown(raw),
      action,
    );
  }

  function patchDealAnalysisLayout(
    action: SetStateAction<DealAnalysisLayoutV1>,
  ) {
    patchLayoutField(
      "dealAnalysisLayout",
      (raw) => parseDealAnalysisLayoutFromUnknown(raw),
      action,
    );
  }

  function patchDealWorkspaceTab3Layout(
    action: SetStateAction<DealWorkspaceTab3LayoutV1>,
  ) {
    patchLayoutField(
      "dealWorkspaceTab3Layout",
      (raw) => parseDealWorkspaceTab3LayoutFromUnknown(raw),
      action,
    );
  }

  function patchDealInfoTabLayout(action: SetStateAction<DealInfoLayoutV1>) {
    patchLayoutField(
      "dealInfoTabLayout",
      (raw) => parseDealInfoLayoutFromUnknown(raw),
      action,
    );
  }

  function patchDealInfoCommandCenterLayout(
    action: SetStateAction<DealInfoCommandCenterLayoutV1>,
  ) {
    patchLayoutField(
      "dealInfoCommandCenterLayout",
      (raw) => parseDealInfoCommandCenterLayoutFromUnknown(raw),
      action,
    );
  }

  function patchOverviewTabLayout(action: SetStateAction<OverviewTabLayoutV1>) {
    patchLayoutField(
      "overviewTabLayout",
      (raw) => parseOverviewTabLayoutFromUnknown(raw),
      action,
    );
  }

  function patchClientPortalTabLayout(
    action: SetStateAction<ClientPortalTabLayoutV1>,
  ) {
    patchLayoutField(
      "clientPortalTabLayout",
      (raw) => parseClientPortalTabLayoutFromUnknown(raw),
      action,
    );
  }

  function patchPortalsProgressTabLayout(
    action: SetStateAction<PortalsProgressTabLayoutV1>,
  ) {
    patchLayoutField(
      "portalsProgressTabLayout",
      (raw) => parsePortalsProgressTabLayoutFromUnknown(raw),
      action,
    );
  }

  async function flush() {
    if (!isDirtyRef.current) return;
    if (flushInFlightRef.current) {
      flushPendingRef.current = true;
      return;
    }
    if (isSyncingFromBackend.current) {
      flushPendingRef.current = true;
      return;
    }

    const rawChanges = pendingPatchRef.current;
    if (!rawChanges || Object.keys(rawChanges).length === 0) {
      setDirtyState(false);
      flushPendingRef.current = false;
      return;
    }

    const sheetBaseline =
      (lastSyncedSheetRef.current as Sheet | null) ??
      (sheet as Sheet | null | undefined) ??
      null;
    const filtered = filterNoOpDealChanges(
      rawChanges as Record<string, unknown>,
      sheetBaseline as Record<string, unknown> | null,
    ) as Patch;
    if (Object.keys(filtered).length === 0) {
      pendingPatchRef.current = {};
      setDirtyState(false);
      flushPendingRef.current = false;
      flushFailCountRef.current = 0;
      stopAutoRetryRef.current = false;
      return;
    }
    pendingPatchRef.current = filtered;

    const snapshot = { ...filtered };
    flushingKeysRef.current = new Set(Object.keys(snapshot));
    pendingPatchRef.current = {};
    flushInFlightRef.current = true;
    stopAutoRetryRef.current = false;
    setSaving(true);
    try {
      const expectedUpdatedAt =
        expectedUpdatedAtOverrideRef.current ??
        dealBundle?.pipeline?.updatedAt;
      const res = await patchDealMut({
        fileId,
        changes: snapshot as Patch,
        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
      traceConvexMutation("useDealWorkspaceEditor", "pipeline.patchDeal");
      if (isPatchDealConflictResult(res)) {
        expectedUpdatedAtOverrideRef.current = res.serverUpdatedAt;
        pendingPatchRef.current = { ...snapshot, ...pendingPatchRef.current };
        const stillPending = filterNoOpDealChanges(
          pendingPatchRef.current as Record<string, unknown>,
          sheetBaseline as Record<string, unknown> | null,
        ) as Patch;
        pendingPatchRef.current = stillPending;
        if (Object.keys(stillPending).length === 0) {
          setDirtyState(false);
          flushPendingRef.current = false;
          flushFailCountRef.current = 0;
          offline.surfaceSyncConflict(
            "File changed elsewhere. Refreshing latest version.",
          );
          return;
        }
        flushFailCountRef.current += 1;
        setDirtyState(true);
        if (flushFailCountRef.current > PATCH_DEAL_MAX_AUTO_RETRIES) {
          stopAutoRetryRef.current = true;
          flushPendingRef.current = false;
          offline.surfaceSyncConflict(
            "File changed elsewhere. Autosave paused — edit again or refresh to resume.",
          );
          return;
        }
        flushPendingRef.current = true;
        offline.surfaceSyncConflict(
          "File changed elsewhere. Retrying with the latest version…",
        );
        return;
      }
      expectedUpdatedAtOverrideRef.current = null;
      flushFailCountRef.current = 0;
      setSavedAt(Date.now());
      if (Object.keys(pendingPatchRef.current).length === 0) {
        setDirtyState(false);
      }
    } catch {
      pendingPatchRef.current = { ...snapshot, ...pendingPatchRef.current };
      flushFailCountRef.current += 1;
      setDirtyState(true);
      if (flushFailCountRef.current > PATCH_DEAL_MAX_AUTO_RETRIES) {
        stopAutoRetryRef.current = true;
        flushPendingRef.current = false;
        offline.surfaceSyncConflict(
          "Could not save deal changes. Autosave paused — try again shortly.",
        );
      } else {
        flushPendingRef.current = true;
      }
    } finally {
      flushInFlightRef.current = false;
      flushingKeysRef.current.clear();
      setSaving(false);
      if (stopAutoRetryRef.current) {
        return;
      }
      const retryDelay = patchDealRetryDelayMs(
        Math.max(0, flushFailCountRef.current - 1),
      );
      if (
        isDirtyRef.current &&
        !autosaveBlocked() &&
        Object.keys(pendingPatchRef.current).length > 0
      ) {
        debouncedFlushRef.current?.schedule(
          flushFailCountRef.current > 0 ? retryDelay : LAYOUT_PATCH_DEBOUNCE_MS,
        );
      } else if (flushPendingRef.current && isDirtyRef.current) {
        flushPendingRef.current = false;
        debouncedFlushRef.current?.schedule(
          flushFailCountRef.current > 0 ? retryDelay : LAYOUT_PATCH_DEBOUNCE_MS,
        );
      }
    }
  }

  flushImplRef.current = flush;

  useEffect(() => {
    return () => {
      debouncedFlushRef.current?.cancel();
      if (syncLockTimer.current) clearTimeout(syncLockTimer.current);
      if (isDirtyRef.current) void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsDealBootstrap =
    Boolean(fileId) &&
    dealBundle != null &&
    dealBundle.sheet === null &&
    !dealBundle.pipeline.intakeSheetId;

  return {
    fileId,
    dealBundle,
    sheet,
    shareIntakeId,
    draft,
    update,
    updateDraftOnly,
    blockServerMergeForKeys,
    unblockServerMergeForKeys,
    patchDealWorkspaceLayout,
    patchDealAnalysisLayout,
    patchDealWorkspaceTab3Layout,
    patchDealInfoTabLayout,
    patchDealInfoCommandCenterLayout,
    patchOverviewTabLayout,
    patchClientPortalTabLayout,
    patchPortalsProgressTabLayout,
    flush,
    isDirty,
    isUpdating: saving,
    saving,
    savedAt,
    dealInitStatus,
    setDealInitStatus,
    dealInitAttemptedForFile,
    initDealDataIfMissing,
    preferencesAccountId,
    pipelineHasEmbeddedDealData,
    needsDealBootstrap,
  };
}

export function DealWorkspaceEditorProvider({
  fileId,
  children,
}: {
  fileId: Id<"pipeline">;
  children: ReactNode;
}) {
  const value = useDealWorkspaceEditorState(fileId);
  return (
    <DealWorkspaceEditorContext.Provider value={value}>
      {children}
    </DealWorkspaceEditorContext.Provider>
  );
}

/**
 * Local-only deal editor for client portal — no authenticated Convex queries.
 * Mutations stay in memory until the portal block submit mutation runs.
 */
export function DealWorkspaceEditorStaticProvider({
  fileId,
  draft,
  update,
  children,
}: {
  fileId: Id<"pipeline">;
  draft: Sheet | null;
  update: DealWorkspaceUpdater;
  children: ReactNode;
}) {
  const value = useMemo((): DealWorkspaceEditorState => {
    const noop = async () => {};
    return {
      fileId,
      dealBundle: draft ? { pipeline: { _id: fileId } as Doc<"pipeline">, sheet: draft } : null,
      sheet: draft,
      shareIntakeId: undefined,
      draft,
      update,
      updateDraftOnly: update,
      blockServerMergeForKeys: () => {},
      unblockServerMergeForKeys: () => {},
      patchDealWorkspaceLayout: () => {},
      patchDealAnalysisLayout: () => {},
      patchDealWorkspaceTab3Layout: () => {},
      patchDealInfoTabLayout: () => {},
      patchDealInfoCommandCenterLayout: () => {},
      patchOverviewTabLayout: () => {},
      patchClientPortalTabLayout: () => {},
      patchPortalsProgressTabLayout: () => {},
      flush: noop,
      isDirty: false,
      isUpdating: false,
      saving: false,
      savedAt: null,
      dealInitStatus: "idle",
      setDealInitStatus: () => {},
      dealInitAttemptedForFile: { current: String(fileId) },
      initDealDataIfMissing: (async () => {}) as unknown as DealWorkspaceEditorState["initDealDataIfMissing"],
      preferencesAccountId: undefined,
      pipelineHasEmbeddedDealData: Boolean(draft),
      needsDealBootstrap: false,
    };
  }, [fileId, draft, update]);

  return (
    <DealWorkspaceEditorContext.Provider value={value}>
      {children}
    </DealWorkspaceEditorContext.Provider>
  );
}

/** Shared deal editor state — must be under {@link DealWorkspaceEditorProvider}. */
export function useDealWorkspaceEditor(): DealWorkspaceEditorState {
  const ctx = useContext(DealWorkspaceEditorContext);
  if (!ctx) {
    throw new Error(
      "useDealWorkspaceEditor must be used within DealWorkspaceEditorProvider",
    );
  }
  return ctx;
}

/** Optional deal editor — null outside {@link DealWorkspaceEditorProvider}. */
export function useDealWorkspaceEditorOptional(): DealWorkspaceEditorState | null {
  return useContext(DealWorkspaceEditorContext);
}

export function DealWorkspaceSaveStatus({
  saving,
  savedAt,
  isDirty = false,
}: {
  saving: boolean;
  savedAt: number | null;
  isDirty?: boolean;
}) {
  if (saving || isDirty) {
    return (
      <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
        Saving changes…
      </span>
    );
  }
  if (savedAt) {
    return (
      <span
        className="text-xs text-muted-foreground tabular-nums"
        role="status"
        aria-live="polite"
      >
        All changes saved
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
      All changes saved
    </span>
  );
}
