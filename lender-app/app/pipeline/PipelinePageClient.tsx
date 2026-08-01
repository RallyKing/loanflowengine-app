"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import {
  NewPipelineHierarchyCreateDialog,
  type HierarchyCreateContext,
  type HierarchyCreateMode,
  type HierarchyCreateResult,
} from "@/components/NewPipelineHierarchyCreateDialog";
import { PipelineBoardView } from "@/components/pipeline/PipelineBoardView";
import { PipelineHubProjectionView } from "@/components/pipeline/PipelineHubProjectionView";
import { ProjectionModeSwitcher } from "@/components/ui/ProjectionModeSwitcher";
import { OperationalOrientationStrip } from "@/components/ui/OperationalOrientationStrip";
import type { OrientationPill } from "@/components/ui/OperationalOrientationStrip";
import { PHASE_24_4D_ISOLATION } from "@/lib/debug/phase24-4D-isolation";
import { buildHubProjectionOptions } from "@/lib/pipeline/hubProjectionUi";
import { withOperationalScrollPreserved } from "@/lib/ui/scrollContinuity";
import { PipelineScrollDebugMount } from "@/components/debug/PipelineScrollDebugMount";
import { PipelineLayoutDebugMount } from "@/components/debug/PipelineLayoutDebugMount";
import { PHASE_24_4I_HUB_STABILIZATION } from "@/lib/debug/phase24-4I-hub-stabilization";
import { PHASE_24_4N_VELOCITY_SCROLL_FIX } from "@/lib/debug/phase24-4N-velocity-scroll-fix";
import { PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN } from "@/lib/debug/phase24-4P-master-layout-lockdown";
import { PHASE_24_4Q_PROGRAMMING_PURGE } from "@/lib/debug/phase24-4Q-programming-purge";
import { usePipelineHubLayoutShiftTracker } from "@/lib/debug/pipelineHubLayoutShiftTracker";
import { OperationalContentReveal } from "@/components/ui/OperationalContentReveal";
import { OperationalEmptyState } from "@/components/ui/OperationalEmptyState";
import { OperationalBatchBar } from "@/components/ui/OperationalBatchBar";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { showOperationalToast } from "@/lib/ui/operationalToast";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";
import {
  pipelineHubClientHref,
  pipelineHubProjectHref,
} from "@/components/pipeline/PipelineHierarchyBreadcrumb";
import {
  buildClientFocusTree,
  buildFileFlatList,
  buildGraphProjectionIndex,
  buildLenderFocusTree,
  buildProjectFocusTree,
  buildReferralFocusTree,
  buildTaskFocusTree,
  buildTeamFocusTree,
  filterClientFocusTree,
  filterEntityFocusTree,
  filterFileFocusList,
  filterProjectFocusTree,
  filterReferralFocusTree,
  filterTaskFocusTree,
  DEFAULT_HUB_PROJECTION_MODE,
  isHubProjectionMode,
  projectionTopLevelSearchPlaceholder,
  type HubProjectionMode,
} from "@/lib/pipeline/graphProjection";
import { DEFAULT_CONTACT_ROLE_IDS } from "@/lib/contact/contactRoles";
import {
  loadPipelineClientInvolvementFilters,
  savePipelineClientInvolvementFilters,
  rowMatchesClientInvolvementFilter,
  CLIENT_RELATIONSHIP_LABELS,
  type PipelineClientInvolvementFilters,
} from "@/lib/pipeline/clientRelationshipUi";
import type { ClientRelationshipType } from "@/lib/pipelineClientRelationships";
import {
  CAPITAL_SOURCE_TYPE_LABELS,
  CAPITAL_SOURCE_TYPES,
} from "@/lib/projectCapitalStack";
import {
  loadPipelineCapitalStackFilters,
  savePipelineCapitalStackFilters,
  rowMatchesCapitalStackFilter,
  capitalStackSearchHaystack,
  type PipelineCapitalStackFilters,
} from "@/lib/pipeline/capitalStackFilters";
import {
  hubRowClientKey,
  hubRowProjectKey,
} from "@/lib/pipeline/hubHierarchyTree";
import {
  expandClientAndProject,
  loadHubHierarchyExpansion,
  saveHubHierarchyExpansion,
  type HubHierarchyExpansionState,
} from "@/lib/pipeline/hubHierarchyExpansion";
import { groupPipelineRowsByParentStage } from "@/lib/pipeline/groupPipelineRowsByParentStage";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { InlineSelect } from "@/components/inline";
import {
  rowMatchesStageFilters,
  resolveRowStageWeight,
  useOrganizationPipelineStages,
} from "@/hooks/useOrganizationPipelineStages";
import {
  PIPELINE_STATUSES,
  getPipelineStatusBadgeStyle,
  getPipelineStatusDotStyle,
  getPipelineStatusSelectOptions,
  getPipelineStatusInfo,
} from "@/lib/pipelineStatus";
import { cn } from "@/lib/cn";
import {
  PIPELINE_HUB_CLIENT_QUERY,
  PIPELINE_HUB_ENTITY_QUERY,
  PIPELINE_HUB_FOCUS_QUERY,
  PIPELINE_HUB_PROJECT_QUERY,
  PIPELINE_HUB_PROJECTION_QUERY,
  pipelineDealEditorHref,
  pipelineLicensesHref,
  resolveFractalClientWorkspaceHref,
} from "@/lib/pipeline/routes";
import { SettingsLink } from "@/components/SettingsLink";
import {
  operationalOverlayDropdownClass,
  operationalZIndexClass,
  OP_BORDER_SOFT,
  OP_DISCLOSURE_TRANSITION,
} from "@/lib/ui/operationalTokens";
import { useUserSettings } from "@/lib/userSettingsContext";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { parseUiDisplayColors } from "@/lib/uiDisplaySettings";
import {
  Archive,
  ArchiveRestore,
  BellOff,
  FileText,
  Check,
  Gavel,
  Copy,
  Download,
  FileJson,
  LayoutGrid,
  List,
  Plus,
  Trash2,
  User,
  X,
  MoreHorizontal,
  Bookmark,
  Rows3,
  LayoutList,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import {
  buildPipelineListCsv,
  buildPipelineListJson,
  buildPipelineListTsv,
} from "@/lib/export/pipelineExport";
import { downloadTextFile } from "@/lib/export/downloadClient";
import { buildExportFilename } from "@/lib/export/exportFilename";
import {
  fmtPipelineBoardLoanCompact,
  fmtPipelineRelativeUpdated,
} from "@/lib/pipeline/pipelineTableFormatting";
import { snoozedUntilToMs } from "@/lib/pipelineSnooze";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { useLiveConnection } from "@/lib/useLiveConnection";
import {
  loadQuerySnapshot,
  persistQuerySnapshot,
  pipelineListSnapshotKey,
  useOfflineSync,
} from "@/lib/offline/OfflineSyncContext";
import { patchPreviewRowInList } from "@/lib/offline/previewRowPatch";
import { isPatchDealConflictResult } from "@/lib/pipeline/patchDealResult";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useConvexOrgQueryReady } from "@/lib/useConvexOrgQueryReady";
import { useActorUserKey } from "@/lib/useActorUserKey";
import {
  loadHubFilterSnapshot,
  loadHubMobileDisplay,
  loadHubProjectionMode,
  loadHubSavedViews,
  saveHubProjectionMode,
  newSavedViewId,
  parseMomentumFilterTokens,
  saveHubFilterSnapshot,
  saveHubMobileDisplay,
  saveHubSavedViews,
  type HubMobileDisplayMode,
  type PipelineHubSavedView,
  type PipelineHubSortKey,
  type PipelineHubFilterSnapshot,
} from "@/lib/pipeline/pipelineHubPersistence";
import { ClientMomentumStars } from "@/components/pipeline/ClientMomentumStars";
import {
  CLIENT_MOMENTUM_FILTER_OPTIONS,
  clientMomentumSortKeyAsc,
  clientMomentumSortKeyDesc,
  parseClientMomentum,
  type ClientMomentumFilterToken,
} from "@/lib/clientMomentum";

type SortKey = PipelineHubSortKey;

const SORT_LABEL: Record<SortKey, string> = {
  updatedDesc: "Recently updated",
  createdDesc: "Recently created",
  loanDesc: "Funding amount (high → low)",
  loanAsc: "Funding amount (low → high)",
  stageAsc: "Stage (funnel order · early → late)",
  stageDesc: "Stage (funnel order · late → early)",
  momentumDesc: "Client confidence (high → low)",
  momentumAsc: "Client confidence (low → high)",
};

const PIPELINE_SORT_STORAGE_KEY = "dlc.pipeline.sort.v1";

function isSortKey(v: string): v is SortKey {
  return Object.prototype.hasOwnProperty.call(SORT_LABEL, v);
}

type ViewMode = "table" | "board";

const EMPTY_PIPELINE: PipelineTablePreviewRow[] = [];

/** Persisted hub filters must not reference unknown stage keys (breaks matches after schema changes). */
const KNOWN_PIPELINE_STAGE_VALUES: ReadonlySet<string> = new Set(
  PIPELINE_STATUSES.map((s) => s.value),
);

export function PipelinePageClient() {
  const { confirm } = useOperationalConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hubFocusFileId, setHubFocusFileId] = useState<
    Id<"pipeline"> | null
  >(null);
  const [createContext, setCreateContext] =
    useState<HierarchyCreateContext | null>(null);
  const [hubExpansion, setHubExpansion] = useState<HubHierarchyExpansionState>(
    () => loadHubHierarchyExpansion(),
  );
  const [projectionMode, setProjectionMode] = useState<HubProjectionMode>(
    () => loadHubProjectionMode() ?? DEFAULT_HUB_PROJECTION_MODE,
  );
  const [filterEntityKey, setFilterEntityKey] = useState<string | null>(null);
  const [filterClientKey, setFilterClientKey] = useState<string | null>(null);
  const [filterProjectKey, setFilterProjectKey] = useState<string | null>(null);
  const [clientInvolvementFilters, setClientInvolvementFilters] =
    useState<PipelineClientInvolvementFilters>(() =>
      loadPipelineClientInvolvementFilters(),
    );
  const [capitalStackFilters, setCapitalStackFilters] =
    useState<PipelineCapitalStackFilters>(() =>
      loadPipelineCapitalStackFilters(),
    );
  const [search, setSearch] = useState("");
  const [projectionSearch, setProjectionSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
  const [subStageFilter, setSubStageFilter] = useState<Set<string>>(new Set());
  const [momentumFilter, setMomentumFilter] = useState<
    Set<ClientMomentumFilterToken>
  >(new Set());
  const [sort, setSort] = useState<SortKey>("stageAsc");
  const [showArchived, setShowArchived] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const hubHydrated = useRef(false);
  const hubListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layoutContain =
      PHASE_24_4I_HUB_STABILIZATION.layoutContainment &&
      !PHASE_24_4N_VELOCITY_SCROLL_FIX.disableHubLayoutContainment;
    if (!layoutContain) return;
    document.documentElement.setAttribute(
      "data-pipeline-hub-layout-contain",
      "true",
    );
    return () => {
      document.documentElement.removeAttribute(
        "data-pipeline-hub-layout-contain",
      );
    };
  }, []);
  useLayoutEffect(() => {
    if (typeof window === "undefined" || hubHydrated.current) return;
    hubHydrated.current = true;
    const snap = loadHubFilterSnapshot();
    if (snap) {
      if (typeof snap.search === "string") setSearch(snap.search);
      if (Array.isArray(snap.statusValues)) {
        const cleaned = snap.statusValues.filter((x) =>
          KNOWN_PIPELINE_STAGE_VALUES.has(x),
        );
        setStatusFilter(new Set(cleaned));
      }
      if (Array.isArray(snap.stageIds)) {
        setStageFilter(new Set(snap.stageIds));
      }
      if (Array.isArray(snap.subStageIds)) {
        setSubStageFilter(new Set(snap.subStageIds));
      }
      setMomentumFilter(new Set(parseMomentumFilterTokens(snap.momentumValues)));
      setShowArchived(snap.showArchived);
      setShowSnoozed(snap.showSnoozed);
      if (isSortKey(snap.sort)) setSort(snap.sort);
    } else {
      try {
        const raw = window.localStorage.getItem(PIPELINE_SORT_STORAGE_KEY);
        if (raw && isSortKey(raw)) setSort(raw);
      } catch {
        /* private mode */
      }
    }
  }, []);

  useEffect(() => {
    if (!hubHydrated.current) return;
    const t = window.setTimeout(() => {
      saveHubFilterSnapshot({
        search,
        statusValues: [...statusFilter],
        stageIds: [...stageFilter],
        subStageIds: [...subStageFilter],
        momentumValues: [...momentumFilter],
        showArchived,
        showSnoozed,
        sort,
      });
    }, 320);
    return () => window.clearTimeout(t);
  }, [search, statusFilter, stageFilter, subStageFilter, momentumFilter, showArchived, showSnoozed, sort]);

  useEffect(() => {
    const rawFocus = searchParams.get(PIPELINE_HUB_FOCUS_QUERY);
    if (!rawFocus) return;
    setHubFocusFileId(rawFocus as Id<"pipeline">);
    router.replace("/pipeline", { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    const hubClient = searchParams.get(PIPELINE_HUB_CLIENT_QUERY)?.trim();
    if (!hubClient) return;
    const hubProject = searchParams.get(PIPELINE_HUB_PROJECT_QUERY)?.trim();
    const fractalHref = resolveFractalClientWorkspaceHref(
      hubClient,
      hubProject || undefined,
    );
    if (!fractalHref) return;
    router.replace(fractalHref);
  }, [searchParams, router]);

  useEffect(() => {
    const hubClient = searchParams.get(PIPELINE_HUB_CLIENT_QUERY);
    const hubProject = searchParams.get(PIPELINE_HUB_PROJECT_QUERY);
    const hubMode = searchParams.get(PIPELINE_HUB_PROJECTION_QUERY);
    const hubEntity = searchParams.get(PIPELINE_HUB_ENTITY_QUERY);
    if (hubClient && resolveFractalClientWorkspaceHref(hubClient.trim())) {
      return;
    }
    if (hubClient) setFilterClientKey(hubClient);
    if (hubProject) setFilterProjectKey(hubProject);
    if (hubMode && isHubProjectionMode(hubMode)) {
      setProjectionMode(hubMode);
      saveHubProjectionMode(hubMode);
    }
    if (hubEntity) setFilterEntityKey(hubEntity);
  }, [searchParams]);

  useEffect(() => {
    saveHubProjectionMode(projectionMode);
  }, [projectionMode]);

  const { settings, update: updateUserSettings } = useUserSettings();
  const { preferences } = useUserPreferences();
  const { activeOrganizationId } = useOrgPermissions();
  const orgQueryReady = useConvexOrgQueryReady();
  const memberUserKey = useActorUserKey().trim() || undefined;
  const stageIndex = useOrganizationPipelineStages();
  const globalUiIndicator = useMemo(
    () => parseUiDisplayColors(preferences.displaySettings).indicatorColor ?? null,
    [preferences.displaySettings],
  );
  const [view, setView] = useState<ViewMode>(settings.pipelineDefaultView);
  useLayoutEffect(() => {
    setView(settings.pipelineDefaultView);
  }, [settings.pipelineDefaultView]);
  const skipViewPersist = useRef(true);
  useEffect(() => {
    if (skipViewPersist.current) {
      skipViewPersist.current = false;
      return;
    }
    updateUserSettings({ pipelineDefaultView: view });
  }, [view, updateUserSettings]);

  const narrow = useNarrowViewport();
  const effectiveView: ViewMode = narrow ? "table" : view;

  const [savedViews, setSavedViews] = useState<PipelineHubSavedView[]>([]);
  useLayoutEffect(() => {
    setSavedViews(loadHubSavedViews());
  }, []);

  const [hubMobileDisplay, setHubMobileDisplay] =
    useState<HubMobileDisplayMode>("cards");
  const skipHubMobilePersist = useRef(true);
  useLayoutEffect(() => {
    const m = loadHubMobileDisplay();
    if (m) setHubMobileDisplay(m);
  }, []);
  useEffect(() => {
    if (skipHubMobilePersist.current) {
      skipHubMobilePersist.current = false;
      return;
    }
    saveHubMobileDisplay(hubMobileDisplay);
  }, [hubMobileDisplay]);


  const [hubViewsFiltersOpen, setHubViewsFiltersOpen] = useState(false);

  const hubMobileFilterActiveCount = useMemo(() => {
    let n = statusFilter.size + momentumFilter.size;
    if (search.trim()) n += 1;
    if (showArchived) n += 1;
    if (showSnoozed) n += 1;
    return n;
  }, [search, statusFilter, momentumFilter, showArchived, showSnoozed]);

  const [bulkIds, setBulkIds] = useState<Set<Id<"pipeline">>>(
    () => new Set(),
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const [pipelineCopyState, setPipelineCopyState] = useState<
    "idle" | "ok" | "err"
  >("idle");
  const statusOptions = useMemo(
    () =>
      getPipelineStatusSelectOptions(
        settings.pipelineStageStyles,
        globalUiIndicator,
      ),
    [settings.pipelineStageStyles, globalUiIndicator],
  );
  const listPreviewArgs = useMemo(() => {
    if (!orgQueryReady || !activeOrganizationId || !memberUserKey) return "skip" as const;
    return {
      includeArchived: showArchived,
      includeSnoozed: showSnoozed,
      organizationId: activeOrganizationId,
      memberUserKey,
    };
  }, [
    orgQueryReady,
    showArchived,
    showSnoozed,
    activeOrganizationId,
    memberUserKey,
  ]);
  const rows = useQuery(api.pipeline.listTablePreview, listPreviewArgs);
  const referralPartnerListArgs = useMemo(() => {
    if (!orgQueryReady || !activeOrganizationId || !memberUserKey) return "skip" as const;
    return {
      organizationId: activeOrganizationId,
      memberUserKey,
      contactRoleIdFilter: DEFAULT_CONTACT_ROLE_IDS.referralPartner,
      strictCanonicalRoleMatch: true,
    };
  }, [orgQueryReady, activeOrganizationId, memberUserKey]);
  const referralPartnerContacts = useQuery(
    api.contacts.list,
    referralPartnerListArgs,
  );
  const { canUseHub } = useLiveConnection();
  const offline = useOfflineSync();
  const snapshotKey = useMemo(
    () =>
      pipelineListSnapshotKey({
        includeArchived: showArchived,
        includeSnoozed: showSnoozed,
        organizationId: activeOrganizationId ?? undefined,
      }),
    [showArchived, showSnoozed, activeOrganizationId],
  );
  const [cachedRows, setCachedRows] = useState<
    PipelineTablePreviewRow[] | undefined
  >(undefined);
  /** True after IndexedDB read when offline (or immediately when live). */
  const [cacheReady, setCacheReady] = useState(true);
  /** Rows patched while offline (until live data refresh clears). */
  const [optimisticRows, setOptimisticRows] = useState<
    PipelineTablePreviewRow[] | null
  >(null);
  const dataRef = useRef<PipelineTablePreviewRow[]>(EMPTY_PIPELINE);
  const patchPipelineMut = useMutation(api.pipeline.patch);
  const patchDealMut = useMutation(api.pipeline.patchDeal);
  const setClientMomentumMut = useMutation(api.pipeline.setClientMomentum);

  useEffect(() => {
    if (canUseHub) {
      setCacheReady(true);
    } else {
      setCacheReady(false);
    }
  }, [canUseHub]);

  useEffect(() => {
    if (canUseHub && rows !== undefined) {
      void persistQuerySnapshot(snapshotKey, rows);
    }
  }, [canUseHub, rows, snapshotKey]);

  useEffect(() => {
    if (canUseHub) {
      setCachedRows(undefined);
      return;
    }
    let cancelled = false;
    void loadQuerySnapshot<PipelineTablePreviewRow[]>(snapshotKey).then((r) => {
      if (!cancelled) {
        setCachedRows(r ?? []);
        setCacheReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [canUseHub, snapshotKey]);

  useEffect(() => {
    if (canUseHub && rows !== undefined) {
      setOptimisticRows(null);
    }
  }, [canUseHub, rows]);

  const baseRows = rows ?? cachedRows;
  const data: PipelineTablePreviewRow[] =
    optimisticRows ?? baseRows ?? EMPTY_PIPELINE;
  dataRef.current = data;

  const runPatchPipeline = useCallback(
    async (args: Parameters<typeof patchPipelineMut>[0]) => {
      const row = dataRef.current.find((r) => r._id === args.id);
      const expectedUpdatedAt = row?.updatedAt;
      const payload = {
        ...args,
        ...(memberUserKey ? { memberUserKey } : {}),
        ...(expectedUpdatedAt !== undefined
          ? { expectedUpdatedAt }
          : {}),
      } as Parameters<typeof patchPipelineMut>[0];
      if (canUseHub) {
        return patchPipelineMut(payload);
      }
      await offline.enqueue({
        kind: "pipeline.patch",
        queueKey: `pipeline.patch::${args.id}`,
        args: { ...(payload as Record<string, unknown>) },
      });
      setOptimisticRows((prev) =>
        patchPreviewRowInList(prev ?? dataRef.current, args.id, args),
      );
    },
    [canUseHub, offline, patchPipelineMut, memberUserKey],
  );
  const runPatchDeal = useCallback(
    async (args: Parameters<typeof patchDealMut>[0]) => {
      const row = dataRef.current.find((r) => r._id === args.fileId);
      const expectedUpdatedAt = row?.updatedAt;
      const payload = {
        ...args,
        ...(memberUserKey ? { memberUserKey } : {}),
        ...(expectedUpdatedAt !== undefined
          ? { expectedUpdatedAt }
          : {}),
      } as Parameters<typeof patchDealMut>[0];
      if (canUseHub) {
        const res = await patchDealMut(payload);
        if (isPatchDealConflictResult(res)) {
          offline.surfaceSyncConflict(
            "File changed elsewhere. Refreshing latest version.",
          );
        }
        return res;
      }
      await offline.enqueue({
        kind: "pipeline.patchDeal",
        queueKey: `pipeline.patchDeal::${args.fileId}`,
        args: { ...(payload as Record<string, unknown>) },
      });
    },
    [canUseHub, offline, patchDealMut, memberUserKey],
  );
  const runSetClientMomentum = useCallback(
    async (fileId: Id<"pipeline">, clientMomentum: number | null) => {
      const row = dataRef.current.find((r) => r._id === fileId);
      const expectedUpdatedAt = row?.updatedAt;
      const payload = {
        id: fileId,
        clientMomentum,
        ...(memberUserKey ? { memberUserKey } : {}),
        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      } as Parameters<typeof setClientMomentumMut>[0];
      if (canUseHub) {
        await setClientMomentumMut(payload);
        return;
      }
      await offline.enqueue({
        kind: "pipeline.setClientMomentum",
        queueKey: `pipeline.setClientMomentum::${fileId}`,
        args: { ...(payload as Record<string, unknown>) },
      });
      setOptimisticRows((prev) =>
        patchPreviewRowInList(prev ?? dataRef.current, fileId, {
          clientMomentum,
        }),
      );
    },
    [canUseHub, offline, memberUserKey, setClientMomentumMut],
  );
  const archivePipeline = useMutation(api.pipeline.archive);
  const unarchivePipeline = useMutation(api.pipeline.unarchive);
  const removePipeline = useMutation(api.pipeline.remove);

  const hubReturnParams = useMemo(
    () => ({
      hubMode: projectionMode,
      hubEntity: filterEntityKey ?? undefined,
      hubClient: filterClientKey ?? undefined,
      hubProject: filterProjectKey ?? undefined,
    }),
    [projectionMode, filterEntityKey, filterClientKey, filterProjectKey],
  );

  const selectFile = useCallback(
    (fileId: Id<"pipeline">) => {
      startTransition(() => {
        router.push(pipelineDealEditorHref(String(fileId), hubReturnParams));
      });
    },
    [router, hubReturnParams],
  );

  const selectFileNotes = useCallback(
    (fileId: Id<"pipeline">) => {
      startTransition(() => {
        router.push(
          pipelineDealEditorHref(String(fileId), {
            ...hubReturnParams,
            focusBlock: "fileNotes",
          }),
        );
      });
    },
    [router, hubReturnParams],
  );

  const listLoading = canUseHub ? rows === undefined : !cacheReady;

  usePipelineHubLayoutShiftTracker(
    hubListRef,
    PHASE_24_4I_HUB_STABILIZATION.layoutShiftTracker &&
      !PHASE_24_4Q_PROGRAMMING_PURGE.disableHubResizeObserver,
    `${effectiveView}:${listLoading}`,
  );

  const clearHubSearchAndStageFilters = useCallback(() => {
    setSearch("");
    setStatusFilter(new Set());
    setStageFilter(new Set());
    setSubStageFilter(new Set());
    setMomentumFilter(new Set());
    try {
      saveHubFilterSnapshot({
        search: "",
        statusValues: [],
        stageIds: [],
        subStageIds: [],
        momentumValues: [],
        showArchived,
        showSnoozed,
        sort,
      });
    } catch {
      /* private mode */
    }
  }, [showArchived, showSnoozed, sort]);

  useEffect(() => {
    savePipelineClientInvolvementFilters(clientInvolvementFilters);
  }, [clientInvolvementFilters]);

  useEffect(() => {
    savePipelineCapitalStackFilters(capitalStackFilters);
  }, [capitalStackFilters]);

  useEffect(() => {
    saveHubHierarchyExpansion(hubExpansion);
  }, [hubExpansion]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = data;
    if (q) {
      out = out.filter(
        (r) =>
          (r.searchText?.toLowerCase().includes(q) ?? false) ||
          capitalStackSearchHaystack(r).includes(q),
      );
    }
    if (filterClientKey) {
      out = out.filter((r) => hubRowClientKey(r) === filterClientKey);
    }
    if (filterProjectKey) {
      out = out.filter((r) => hubRowProjectKey(r) === filterProjectKey);
    }
    if (clientInvolvementFilters.clientId) {
      out = out.filter((r) =>
        rowMatchesClientInvolvementFilter(r, clientInvolvementFilters),
      );
    }
    if (
      capitalStackFilters.fundingHealth !== "any" ||
      capitalStackFilters.gapThreshold > 0 ||
      capitalStackFilters.sourceType !== "any"
    ) {
      out = out.filter((r) => rowMatchesCapitalStackFilter(r, capitalStackFilters));
    }
    if (statusFilter.size > 0) {
      out = out.filter((r) => {
        const info = getPipelineStatusInfo(r.status);
        return statusFilter.has(info.value);
      });
    }
    if (stageFilter.size > 0 || subStageFilter.size > 0) {
      out = out.filter((r) =>
        rowMatchesStageFilters(r, stageFilter, subStageFilter, stageIndex),
      );
    }
    if (momentumFilter.size > 0) {
      out = out.filter((r) => {
        const cm = parseClientMomentum(r.clientMomentum);
        return [...momentumFilter].some((t) =>
          t === "unrated" ? cm === undefined : cm === t,
        );
      });
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "updatedDesc":
          return b.updatedAt - a.updatedAt;
        case "createdDesc":
          return b.createdAt - a.createdAt;
        case "loanDesc":
          return b.fundingAmount - a.fundingAmount;
        case "loanAsc":
          return a.fundingAmount - b.fundingAmount;
        case "stageAsc": {
          const wa = resolveRowStageWeight(a, stageIndex);
          const wb = resolveRowStageWeight(b, stageIndex);
          if (wa !== wb) return wa - wb;
          return b.updatedAt - a.updatedAt;
        }
        case "stageDesc": {
          const wa = resolveRowStageWeight(a, stageIndex);
          const wb = resolveRowStageWeight(b, stageIndex);
          if (wa !== wb) return wb - wa;
          return b.updatedAt - a.updatedAt;
        }
        case "momentumDesc": {
          const ma = clientMomentumSortKeyDesc(a.clientMomentum);
          const mb = clientMomentumSortKeyDesc(b.clientMomentum);
          if (ma !== mb) return mb - ma;
          return b.updatedAt - a.updatedAt;
        }
        case "momentumAsc": {
          const ma = clientMomentumSortKeyAsc(a.clientMomentum);
          const mb = clientMomentumSortKeyAsc(b.clientMomentum);
          if (ma !== mb) return ma - mb;
          return b.updatedAt - a.updatedAt;
        }
      }
    });
    return sorted;
  }, [
    data,
    search,
    statusFilter,
    stageFilter,
    subStageFilter,
    momentumFilter,
    sort,
    stageIndex,
    filterClientKey,
    filterProjectKey,
    clientInvolvementFilters,
    capitalStackFilters,
  ]);

  const graphIndex = useMemo(
    () => buildGraphProjectionIndex(filtered),
    [filtered],
  );

  const clientFocusTree = useMemo(
    () =>
      filterClientFocusTree(
        buildClientFocusTree(filtered, graphIndex, {
          sort,
          stageIndex,
        }),
        projectionSearch,
      ),
    [filtered, graphIndex, projectionSearch, sort, stageIndex],
  );
  const projectFocusTree = useMemo(
    () =>
      filterProjectFocusTree(
        buildProjectFocusTree(filtered, graphIndex, {
          sort,
          stageIndex,
        }),
        projectionSearch,
      ),
    [filtered, graphIndex, projectionSearch, sort, stageIndex],
  );
  const fileFlatList = useMemo(
    () =>
      filterFileFocusList(
        buildFileFlatList(filtered, {
          sort,
          stageIndex,
        }).map((n) => n.row),
        projectionSearch,
      ),
    [filtered, projectionSearch, sort, stageIndex],
  );
  const fileFlatGrouped = useMemo(
    () => groupPipelineRowsByParentStage(fileFlatList, stageIndex),
    [fileFlatList, stageIndex],
  );
  const lenderFocusTree = useMemo(
    () =>
      filterEntityFocusTree(
        buildLenderFocusTree(graphIndex, {
          sort,
          stageIndex,
        }),
        projectionSearch,
      ),
    [graphIndex, projectionSearch, sort, stageIndex],
  );
  const referralFocusTree = useMemo(() => {
    let tree = filterReferralFocusTree(
      buildReferralFocusTree(graphIndex, {
        sort,
        stageIndex,
      }),
      projectionSearch,
    );
    if (filterEntityKey) {
      tree = tree.filter((n) => n.entityId === filterEntityKey);
    }
    return tree;
  }, [graphIndex, projectionSearch, sort, stageIndex, filterEntityKey]);
  const teamFocusTree = useMemo(
    () =>
      filterEntityFocusTree(
        buildTeamFocusTree(graphIndex, { sort, stageIndex }),
        projectionSearch,
      ),
    [graphIndex, projectionSearch, sort, stageIndex],
  );
  const taskFocusTree = useMemo(
    () =>
      filterTaskFocusTree(
        buildTaskFocusTree(filtered, { sort, stageIndex }),
        projectionSearch,
      ),
    [filtered, projectionSearch, sort, stageIndex],
  );

  const projectionVisibleCount = useMemo(() => {
    switch (projectionMode) {
      case "client":
        return clientFocusTree.length;
      case "project":
        return projectFocusTree.length;
      case "file":
        return fileFlatList.length;
      case "lender":
        return lenderFocusTree.length;
      case "referral":
        return referralFocusTree.length;
      case "team":
        return teamFocusTree.length;
      case "task":
        return (
          taskFocusTree.open.length + taskFocusTree.completed.length
        );
    }
  }, [
    projectionMode,
    clientFocusTree.length,
    projectFocusTree.length,
    fileFlatList.length,
    lenderFocusTree.length,
    referralFocusTree.length,
    teamFocusTree.length,
    taskFocusTree.open.length,
    taskFocusTree.completed.length,
  ]);

  const projectionSearchNoMatches =
    projectionSearch.trim().length > 0 && projectionVisibleCount === 0;

  const hubProjectionCounts = useMemo(
    () => ({
      client: clientFocusTree.length,
      project: projectFocusTree.length,
      file: fileFlatList.length,
      lender: lenderFocusTree.length,
      referral: referralFocusTree.length,
      team: teamFocusTree.length,
      task: taskFocusTree.open.length + taskFocusTree.completed.length,
    }),
    [
      clientFocusTree.length,
      projectFocusTree.length,
      fileFlatList.length,
      lenderFocusTree.length,
      referralFocusTree.length,
      teamFocusTree.length,
      taskFocusTree.open.length,
      taskFocusTree.completed.length,
    ],
  );

  const hubProjectionOptions = useMemo(
    () =>
      buildHubProjectionOptions({
        counts: hubProjectionCounts,
        includeEventsLink: true,
      }),
    [hubProjectionCounts],
  );

  const hierarchyFilterOptions = useMemo(() => {
    const clients = new Map<string, string>();
    const projects = new Map<string, string>();
    for (const r of data) {
      const ck = hubRowClientKey(r);
      clients.set(ck, r.clientDisplayName ?? "Client");
      const pk = hubRowProjectKey(r);
      projects.set(pk, r.projectDisplayTitle ?? "Project");
    }
    return {
      clients: [...clients.entries()].map(([id, label]) => ({ id, label })),
      projects: [...projects.entries()].map(([id, label]) => ({ id, label })),
    };
  }, [data]);

  const hierarchyProjectFilterOptions = useMemo(() => {
    if (!filterClientKey) return hierarchyFilterOptions.projects;
    const seen = new Set<string>();
    const out: Array<{ id: string; label: string }> = [];
    for (const r of data) {
      if (hubRowClientKey(r) !== filterClientKey) continue;
      const pk = hubRowProjectKey(r);
      if (seen.has(pk)) continue;
      seen.add(pk);
      out.push({ id: pk, label: r.projectDisplayTitle ?? "Project" });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [data, filterClientKey, hierarchyFilterOptions.projects]);

  const hubOrientationPills = useMemo((): OrientationPill[] => {
    const pills: OrientationPill[] = [];
    if (search.trim()) {
      pills.push({
        id: "search",
        label: `Hub: ${search.trim().slice(0, 24)}${search.trim().length > 24 ? "…" : ""}`,
        onRemove: () => setSearch(""),
      });
    }
    if (projectionSearch.trim()) {
      pills.push({
        id: "proj-search",
        label: `View: ${projectionSearch.trim().slice(0, 20)}`,
        onRemove: () => setProjectionSearch(""),
      });
    }
    if (filterClientKey) {
      const label =
        hierarchyFilterOptions.clients.find((c) => c.id === filterClientKey)
          ?.label ?? "Client";
      pills.push({
        id: "client",
        label: `Client: ${label}`,
        onRemove: () => {
          setFilterClientKey(null);
          setFilterProjectKey(null);
        },
      });
    }
    if (filterProjectKey) {
      const label =
        hierarchyProjectFilterOptions.find((p) => p.id === filterProjectKey)
          ?.label ?? "Project";
      pills.push({
        id: "project",
        label: `Project: ${label}`,
        onRemove: () => setFilterProjectKey(null),
      });
    }
    if (statusFilter.size > 0) {
      pills.push({
        id: "status",
        label: `${statusFilter.size} stage${statusFilter.size === 1 ? "" : "s"}`,
      });
    }
    if (showArchived) {
      pills.push({
        id: "archived",
        label: "Archived",
        onRemove: () => setShowArchived(false),
      });
    }
    if (showSnoozed) {
      pills.push({
        id: "snoozed",
        label: "Snoozed",
        onRemove: () => setShowSnoozed(false),
      });
    }
    return pills;
  }, [
    search,
    projectionSearch,
    filterClientKey,
    filterProjectKey,
    statusFilter.size,
    showArchived,
    showSnoozed,
    hierarchyFilterOptions.clients,
    hierarchyProjectFilterOptions,
  ]);

  const hubFilterActiveCount = useMemo(() => {
    let n = hubMobileFilterActiveCount;
    if (stageFilter.size > 0) n += stageFilter.size;
    if (subStageFilter.size > 0) n += subStageFilter.size;
    if (filterClientKey) n += 1;
    if (filterProjectKey) n += 1;
    return n;
  }, [
    hubMobileFilterActiveCount,
    stageFilter.size,
    subStageFilter.size,
    filterClientKey,
    filterProjectKey,
  ]);

  const hubViewsFiltersActiveCount = useMemo(() => {
    let n = hubFilterActiveCount;
    if (sort !== "updatedDesc") n += 1;
    if (!narrow && view !== "table") n += 1;
    if (settings.tableDensity !== "analyst") n += 1;
    if (clientInvolvementFilters.clientId) n += 1;
    if (clientInvolvementFilters.relationshipType !== "any") n += 1;
    if (clientInvolvementFilters.primaryOnly) n += 1;
    if (capitalStackFilters.sourceType !== "any") n += 1;
    if (capitalStackFilters.fundingHealth !== "any") n += 1;
    if (capitalStackFilters.gapThreshold > 0) n += 1;
    if (filterEntityKey) n += 1;
    return n;
  }, [
    hubFilterActiveCount,
    sort,
    narrow,
    view,
    settings.tableDensity,
    clientInvolvementFilters,
    capitalStackFilters,
    filterEntityKey,
  ]);

  const hubOrientationCrumbs = useMemo(() => {
    const crumbs: Array<{ label: string; href?: string }> = [];
    if (filterClientKey) {
      crumbs.push({
        label:
          hierarchyFilterOptions.clients.find((c) => c.id === filterClientKey)
            ?.label ?? "Client",
        href: pipelineHubClientHref(filterClientKey),
      });
    }
    if (filterProjectKey && filterClientKey) {
      crumbs.push({
        label:
          hierarchyProjectFilterOptions.find((p) => p.id === filterProjectKey)
            ?.label ?? "Project",
        href: pipelineHubProjectHref(filterClientKey, filterProjectKey),
      });
    }
    return crumbs;
  }, [
    filterClientKey,
    filterProjectKey,
    hierarchyFilterOptions.clients,
    hierarchyProjectFilterOptions,
  ]);

  const clearHubAdvancedFilters = useCallback(() => {
    clearHubSearchAndStageFilters();
    setFilterClientKey(null);
    setFilterProjectKey(null);
    setStageFilter(new Set());
    setSubStageFilter(new Set());
  }, [clearHubSearchAndStageFilters]);

  const onChangeRowStage = useCallback(
    async (
      id: Id<"pipeline">,
      next: {
        stageId?: Id<"organizationPipelineStages">;
        subStageId?: Id<"organizationPipelineSubStages">;
      },
    ) => {
      await runPatchPipeline({
        id,
        stageId: next.stageId,
        subStageId: next.subStageId ?? null,
      });
    },
    [runPatchPipeline],
  );

  useEffect(() => {
    if (!hubFocusFileId || listLoading) return;
    if (!filtered.some((r) => r._id === hubFocusFileId)) return;
    const t = window.setTimeout(() => {
      const sel = `[data-pipeline-row="${CSS.escape(String(hubFocusFileId))}"]`;
      document.querySelector(sel)?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [hubFocusFileId, listLoading, filtered]);

  useEffect(() => {
    if (view !== "table") {
      setBulkIds(new Set());
    }
  }, [view]);

  const toggleBulkOne = useCallback((id: Id<"pipeline">, checked: boolean) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      const ids = filtered.map((r) => r._id);
      const allIn =
        ids.length > 0 && ids.every((id) => next.has(id));
      if (allIn) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }, [filtered]);

  const clearBulkSelection = useCallback(() => {
    setBulkIds(new Set());
  }, []);

  const rowById = useMemo(() => {
    const m = new Map<Id<"pipeline">, PipelineTablePreviewRow>();
    for (const r of data) m.set(r._id, r);
    return m;
  }, [data]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((r) => bulkIds.has(r._id));
  const someFilteredChecked = filtered.some((r) => bulkIds.has(r._id));

  useLayoutEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someFilteredChecked && !allFilteredChecked;
  }, [someFilteredChecked, allFilteredChecked]);

  const bulkArchiveEligible = useMemo(() => {
    for (const id of bulkIds) {
      const row = rowById.get(id);
      if (row && row.archivedAt == null) return true;
    }
    return false;
  }, [bulkIds, rowById]);

  const bulkUnarchiveEligible = useMemo(() => {
    for (const id of bulkIds) {
      const row = rowById.get(id);
      if (row && row.archivedAt != null) return true;
    }
    return false;
  }, [bulkIds, rowById]);

  const runBulkArchive = useCallback(async () => {
    if (bulkIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...bulkIds].map((id) =>
          archivePipeline({
            id,
            ...(memberUserKey ? { memberUserKey } : {}),
          }),
        ),
      );
      const n = bulkIds.size;
      setBulkIds(new Set());
      showOperationalToast({
        title: "Files archived",
        description: `${n} pipeline file${n === 1 ? "" : "s"} moved to archive`,
        variant: "success",
      });
    } finally {
      setBulkBusy(false);
    }
  }, [bulkIds, archivePipeline, memberUserKey]);

  const runBulkUnarchive = useCallback(async () => {
    if (bulkIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...bulkIds].map((id) =>
          unarchivePipeline({
            id,
            ...(memberUserKey ? { memberUserKey } : {}),
          }),
        ),
      );
      const n = bulkIds.size;
      setBulkIds(new Set());
      showOperationalToast({
        title: "Files restored",
        description: `${n} pipeline file${n === 1 ? "" : "s"} returned to active`,
        variant: "success",
      });
    } finally {
      setBulkBusy(false);
    }
  }, [bulkIds, unarchivePipeline, memberUserKey]);

  const runBulkDelete = useCallback(async () => {
    if (bulkIds.size === 0) return;
    const n = bulkIds.size;
    const ok = await confirm({
      ...simpleDeleteConfirm(
        `${n} pipeline file${n === 1 ? "" : "s"}`,
        {
          title: "Delete pipeline files",
          impact:
            "Selected files are permanently removed. This cannot be undone.",
        },
      ),
    });
    if (!ok) return;
    const ids = [...bulkIds];
    setBulkBusy(true);
    try {
      for (const id of ids) {
        await removePipeline({
          id,
          ...(memberUserKey ? { memberUserKey } : {}),
        });
      }
      setBulkIds(new Set());
      showOperationalToast({
        title: "Files removed",
        description: `${n} pipeline file${n === 1 ? "" : "s"} permanently deleted`,
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  }, [bulkIds, removePipeline, memberUserKey, confirm]);

  const totalLoan = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.fundingAmount || 0), 0),
    [filtered]
  );

  const empty = !listLoading && data.length === 0;
  const noMatches = !listLoading && data.length > 0 && filtered.length === 0;

  const pipelineExportTags = useMemo(
    () =>
      [
        search.trim() ? "search" : "",
        statusFilter.size > 0 ? `${statusFilter.size}-statuses` : "",
        momentumFilter.size > 0 ? `${momentumFilter.size}-momentum` : "",
        showArchived ? "with-archived" : "active-only",
        showSnoozed ? "with-snoozed" : "without-snoozed",
        sort,
      ].filter(Boolean),
    [search, statusFilter, momentumFilter, showArchived, showSnoozed, sort]
  );

  const exportPipelineCsv = useCallback(() => {
    downloadTextFile(
      buildExportFilename("pipeline", "csv", pipelineExportTags),
      buildPipelineListCsv(filtered),
      "text/csv;charset=utf-8",
      { utf8Bom: true }
    );
  }, [filtered, pipelineExportTags]);

  const exportPipelineTsv = useCallback(() => {
    downloadTextFile(
      buildExportFilename("pipeline", "tsv", pipelineExportTags),
      buildPipelineListTsv(filtered),
      "text/tab-separated-values;charset=utf-8",
      { utf8Bom: false }
    );
  }, [filtered, pipelineExportTags]);

  const exportPipelineJson = useCallback(() => {
    downloadTextFile(
      buildExportFilename("pipeline", "json", pipelineExportTags),
      buildPipelineListJson(filtered),
      "application/json;charset=utf-8",
      { utf8Bom: false }
    );
  }, [filtered, pipelineExportTags]);

  const copyPipelineTsv = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPipelineListTsv(filtered));
      setPipelineCopyState("ok");
      window.setTimeout(() => setPipelineCopyState("idle"), 1800);
    } catch {
      setPipelineCopyState("err");
      window.setTimeout(() => setPipelineCopyState("idle"), 2400);
    }
  }, [filtered]);

  const toggleStageFilter = useCallback((stageId: string) => {
    setStageFilter((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
    setStatusFilter(new Set());
  }, []);

  const toggleStatus = useCallback((value: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setStageFilter(new Set());
    setSubStageFilter(new Set());
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter(new Set());
    setStageFilter(new Set());
    setSubStageFilter(new Set());
    setMomentumFilter(new Set());
  }, []);

  const toggleMomentum = useCallback((value: ClientMomentumFilterToken) => {
    setMomentumFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const applyHubSnapshot = useCallback(
    (snap: Omit<PipelineHubFilterSnapshot, "v">) => {
      setSearch(snap.search);
      setStatusFilter(new Set(snap.statusValues));
      setStageFilter(new Set(snap.stageIds ?? []));
      setSubStageFilter(new Set(snap.subStageIds ?? []));
      setMomentumFilter(new Set(parseMomentumFilterTokens(snap.momentumValues)));
      setShowArchived(snap.showArchived);
      setShowSnoozed(snap.showSnoozed);
      setSort(snap.sort);
    },
    [],
  );

  const saveNamedView = useCallback(() => {
    const name = window.prompt("Name for this saved view (stored on this device)");
    if (!name?.trim()) return;
    const entry: PipelineHubSavedView = {
      id: newSavedViewId(),
      name: name.trim(),
      v: 3,
      search: search.trim(),
      statusValues: [...statusFilter],
      stageIds: [...stageFilter],
      subStageIds: [...subStageFilter],
      momentumValues: [...momentumFilter],
      showArchived,
      showSnoozed,
      sort,
    };
    setSavedViews((prev) => {
      const next = [...prev, entry];
      saveHubSavedViews(next);
      return next;
    });
  }, [search, statusFilter, stageFilter, subStageFilter, momentumFilter, showArchived, showSnoozed, sort]);

  const deleteNamedView = useCallback((id: string) => {
    setSavedViews((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveHubSavedViews(next);
      return next;
    });
  }, []);

  const applyColumnPreset = useCallback(
    (preset: "funnel" | "funding") => {
      if (preset === "funnel") {
        applyHubSnapshot({
          search: "",
          statusValues: [],
          stageIds: [],
          subStageIds: [],
          momentumValues: [],
          showArchived: false,
          showSnoozed: false,
          sort: "stageAsc",
        });
      } else {
        applyHubSnapshot({
          search: "",
          statusValues: [],
          stageIds: [],
          subStageIds: [],
          momentumValues: [],
          showArchived: false,
          showSnoozed: false,
          sort: "loanDesc",
        });
      }
    },
    [applyHubSnapshot],
  );

  const onChangeRowStatus = useCallback(
    async (id: Id<"pipeline">, next: string): Promise<void> => {
      await runPatchPipeline({ id, status: next });
    },
    [runPatchPipeline],
  );

  const openCreate = useCallback((ctx: HierarchyCreateContext) => {
    setCreateContext(ctx);
  }, []);

  const handleHubCreated = useCallback((result: HierarchyCreateResult) => {
    setHubExpansion((prev) =>
      expandClientAndProject(
        prev,
        String(result.clientId),
        String(result.projectId),
      ),
    );
  }, []);

  const onAddProjectFromClient = useCallback(
    (clientId: Id<"clients">) => {
      openCreate({
        mode: "project",
        clientId,
        stayOnHub: true,
      });
    },
    [openCreate],
  );

  const onAddLoanFromProject = useCallback(
    (projectId: Id<"projects">) => {
      openCreate({
        mode: "loan",
        projectId,
        stayOnHub: true,
      });
    },
    [openCreate],
  );

  return (
    <>
      <PipelineScrollDebugMount />
      <PipelineLayoutDebugMount />
    <div
      className="flex min-w-0 max-w-full flex-col gap-3 md:gap-4"
      data-pipeline-page-root
      data-clipping-parent="pipeline-page"
      data-phase24-4d-step1-orientation-strip={
        PHASE_24_4D_ISOLATION.omitOperationalOrientationStrip ? "omitted" : "rendered"
      }
    >
      <div className="flex min-h-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold md:text-2xl">
            Pipeline
          </h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            Clients, projects, and loan files — expand a client or project to
            open loans. One subscription keeps the hub in sync with your file
            workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Link
            href={pipelineLicensesHref()}
            className={cn(
              "hidden h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors md:inline-flex",
              "hover:border-brand-accent/60 hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            )}
          >
            <Gavel className="h-4 w-4" />
            Licenses
          </Link>
          <details className="relative md:hidden">
            <summary
              className={cn(
                "flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium shadow-sm",
                "marker:content-none [&::-webkit-details-marker]:hidden"
              )}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
              More
            </summary>
            <div
              className={cn(
                "absolute right-0 mt-1 min-w-[12rem] space-y-0.5",
                operationalZIndexClass("DROPDOWN"),
                operationalOverlayDropdownClass(),
              )}
              role="menu"
            >
              <Link
                href={pipelineLicensesHref()}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                role="menuitem"
              >
                <Gavel className="h-4 w-4 shrink-0" aria-hidden />
                Licenses
              </Link>
            </div>
          </details>
          <details className="relative max-md:flex-1">
            <summary
              className={cn(
                "flex h-9 cursor-pointer list-none items-center justify-center gap-1.5 rounded-md border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm",
                "marker:content-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New…
            </summary>
            <div
              className={cn(
                "absolute right-0 z-[var(--dlc-z-dropdown,38)] mt-1 min-w-[14rem]",
                operationalOverlayDropdownClass(),
              )}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => openCreate({ mode: "full" })}
              >
                New client + project + loan
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => openCreate({ mode: "project" })}
              >
                New project under client
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => openCreate({ mode: "loan" })}
              >
                New loan under project
              </button>
            </div>
          </details>
        </div>
      </div>

      {createContext ? (
        <NewPipelineHierarchyCreateDialog
          open
          context={createContext}
          onClose={() => setCreateContext(null)}
          onCreated={createContext.stayOnHub ? handleHubCreated : undefined}
        />
      ) : null}

      <div className="flex min-w-0 max-w-full flex-col gap-3">
        <div className="relative z-20 isolate min-w-0 max-w-full rounded-xl border border-border/80 bg-background shadow-sm">
        <div
          data-pipeline-hub-filter-toolbar
          className="relative shrink-0 border-b border-border/80 bg-background"
        >
          <div className="flex min-h-0 flex-col gap-3 p-3">
            <div
              className="flex min-h-0 min-w-0 max-w-full flex-col flex-wrap items-stretch gap-4"
              data-testid="pipeline-hub-primary-toolbar"
            >
              <SearchField
                containerClassName="min-w-0 w-full shrink-0 basis-full sm:max-w-md sm:flex-1 sm:basis-[min(100%,20rem)]"
                placeholder="Search client, project, loan, or deal fields…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                aria-label="Search pipeline"
              />
              <div className="min-w-0 w-full max-w-full flex-1 basis-full overflow-hidden sm:min-w-[12rem] sm:flex-[2_1_0%]">
                <ProjectionModeSwitcher
                  className="w-full max-w-full"
                  compact={narrow}
                  options={hubProjectionOptions}
                  value={projectionMode}
                  onChange={(mode) => {
                    if (mode === "events") return;
                    withOperationalScrollPreserved(() => {
                      setProjectionMode(mode as HubProjectionMode);
                      setFilterEntityKey(null);
                    });
                  }}
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-2.5 text-xs font-medium"
                aria-expanded={hubViewsFiltersOpen}
                aria-controls="pipeline-hub-views-filters-panel"
                data-testid="pipeline-hub-views-filters-toggle"
                onClick={() => setHubViewsFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Tune view &amp; filters
                {hubViewsFiltersActiveCount > 0 ? (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                    {hubViewsFiltersActiveCount}
                  </span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-dlc-fast ease-dlc-standard",
                    hubViewsFiltersOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </Button>
              {!hubViewsFiltersOpen && hubOrientationPills.length > 0 ? (
                <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1 md:flex">
                  {hubOrientationPills.slice(0, 4).map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full border border-border/40 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {p.label}
                    </span>
                  ))}
                  {hubOrientationPills.length > 4 ? (
                    <span className="text-[11px] text-muted-foreground/80">
                      +{hubOrientationPills.length - 4}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {hubFilterActiveCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-8 text-xs text-muted-foreground md:inline-flex"
                  onClick={clearHubAdvancedFilters}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>

            <div
              id="pipeline-hub-views-filters-panel"
              className={cn(
                "min-w-0 overflow-hidden",
                OP_DISCLOSURE_TRANSITION,
                hubViewsFiltersOpen
                  ? "max-h-[min(80vh,48rem)] opacity-100"
                  : "max-h-0 opacity-0",
              )}
              aria-hidden={!hubViewsFiltersOpen}
            >
              <div
                className={cn(
                  "max-h-[min(75vh,44rem)] space-y-4 overflow-y-auto overscroll-contain rounded-lg border bg-dlc-surface-low/40 p-3 shadow-sm touch-scroll-y",
                  OP_BORDER_SOFT,
                )}
              >
                {effectiveView === "table" ? (
                  <section
                    className="flex min-w-0 flex-col gap-3 py-2"
                    aria-label="Entity and scope filters"
                    data-testid="pipeline-hub-entity-filters"
                  >
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Entity &amp; scope filters
                    </h3>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-3">
                      <select
                        className="h-8 min-w-0 max-w-full flex-1 basis-[8rem] rounded-md border border-border bg-background px-2 text-xs sm:min-w-[8rem] sm:flex-none"
                        value={filterClientKey ?? ""}
                        onChange={(e) => {
                          const key = e.target.value || null;
                          const fractalHref = key
                            ? resolveFractalClientWorkspaceHref(key)
                            : null;
                          if (fractalHref) {
                            router.push(fractalHref);
                            return;
                          }
                          setFilterClientKey(key);
                          setFilterProjectKey(null);
                        }}
                        aria-label="Filter by client"
                      >
                        <option value="">All clients</option>
                        {hierarchyFilterOptions.clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-8 min-w-0 max-w-full flex-1 basis-[8rem] rounded-md border border-border bg-background px-2 text-xs sm:min-w-[8rem] sm:flex-none"
                        value={filterProjectKey ?? ""}
                        onChange={(e) =>
                          setFilterProjectKey(e.target.value || null)
                        }
                        aria-label="Filter by project"
                      >
                        <option value="">All projects</option>
                        {hierarchyProjectFilterOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-8 min-w-[9rem] max-w-full rounded-md border border-border bg-background px-2 text-xs"
                        value={clientInvolvementFilters.clientId ?? ""}
                        onChange={(e) =>
                          setClientInvolvementFilters((prev) => ({
                            ...prev,
                            clientId: e.target.value || null,
                          }))
                        }
                        aria-label="Client involvement filter"
                      >
                        <option value="">Any client involvement</option>
                        {hierarchyFilterOptions.clients.map((c) => (
                          <option key={`involve-${c.id}`} value={c.id}>
                            Involves: {c.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-8 min-w-[7rem] rounded-md border border-border bg-background px-2 text-xs"
                        value={clientInvolvementFilters.relationshipType}
                        onChange={(e) =>
                          setClientInvolvementFilters((prev) => ({
                            ...prev,
                            relationshipType: e.target.value as
                              | ClientRelationshipType
                              | "any",
                          }))
                        }
                        aria-label="Relationship type filter"
                      >
                        <option value="any">Any relationship</option>
                        {(Object.keys(
                          CLIENT_RELATIONSHIP_LABELS,
                        ) as ClientRelationshipType[]).map((t) => (
                          <option key={t} value={t}>
                            {CLIENT_RELATIONSHIP_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <label className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={clientInvolvementFilters.primaryOnly}
                          onChange={(e) =>
                            setClientInvolvementFilters((prev) => ({
                              ...prev,
                              primaryOnly: e.target.checked,
                            }))
                          }
                        />
                        Primary only
                      </label>
                      <select
                        className="h-8 min-w-[7rem] rounded-md border border-border bg-background px-2 text-xs"
                        value={capitalStackFilters.sourceType}
                        onChange={(e) =>
                          setCapitalStackFilters((prev) => ({
                            ...prev,
                            sourceType: e.target.value as PipelineCapitalStackFilters["sourceType"],
                          }))
                        }
                        aria-label="Funding source type filter"
                      >
                        <option value="any">Any source type</option>
                        {CAPITAL_SOURCE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {CAPITAL_SOURCE_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-8 min-w-[8rem] rounded-md border border-border bg-background px-2 text-xs"
                        value={capitalStackFilters.fundingHealth}
                        onChange={(e) =>
                          setCapitalStackFilters((prev) => ({
                            ...prev,
                            fundingHealth: e.target.value as PipelineCapitalStackFilters["fundingHealth"],
                          }))
                        }
                        aria-label="Capital funding health filter"
                      >
                        <option value="any">Any funding health</option>
                        <option value="underfunded">Underfunded projects</option>
                        <option value="fully_funded">Fully funded</option>
                      </select>
                      <select
                        className="h-8 min-w-[7rem] rounded-md border border-border bg-background px-2 text-xs"
                        value={capitalStackFilters.gapThreshold}
                        onChange={(e) =>
                          setCapitalStackFilters((prev) => ({
                            ...prev,
                            gapThreshold: Number(e.target.value),
                          }))
                        }
                        aria-label="Minimum funding gap filter"
                      >
                        <option value={0}>Any gap size</option>
                        <option value={50000}>Gap ≥ $50K</option>
                        <option value={250000}>Gap ≥ $250K</option>
                        <option value={1000000}>Gap ≥ $1M</option>
                      </select>
                      {projectionMode === "referral" ? (
                        <select
                          className="h-8 min-w-[10rem] max-w-full flex-1 basis-[10rem] rounded-md border border-border bg-background px-2 text-xs sm:flex-none"
                          value={filterEntityKey ?? ""}
                          onChange={(e) =>
                            setFilterEntityKey(e.target.value || null)
                          }
                          aria-label="Filter by referral partner"
                          data-testid="pipeline-referral-partner-filter"
                        >
                          <option value="">All referral partners</option>
                          {(referralPartnerContacts ?? []).map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <label className="flex h-8 w-full basis-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto sm:basis-auto">
                        <input
                          ref={selectAllCheckboxRef}
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={allFilteredChecked}
                          disabled={listLoading || filtered.length === 0}
                          onChange={() => toggleSelectAllFiltered()}
                          aria-label="Select all visible loans"
                        />
                        Select visible ({filtered.length})
                      </label>
                    </div>
                  </section>
                ) : null}
                <section
                  className="flex min-w-0 flex-col gap-3"
                  aria-label="View and layout"
                >
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    View &amp; layout
                  </h3>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">Sort</span>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="h-9 min-w-0 max-w-full flex-1 rounded-md border border-border/50 bg-background px-2 text-base shadow-sm sm:max-w-[11rem] sm:flex-none sm:text-sm"
                        aria-label="Sort pipeline"
                      >
                        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                          <option key={k} value={k}>
                            {SORT_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div
                      className={cn(
                        "inline-flex h-9 items-center rounded-md border border-border/50 bg-background text-xs shadow-sm",
                        narrow && "hidden",
                      )}
                      role="tablist"
                      aria-label="View mode"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === "table"}
                        onClick={() => setView("table")}
                        className={cn(
                          "inline-flex h-full items-center gap-1.5 px-2.5",
                          view === "table"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                        title="Table view"
                      >
                        <List className="h-3.5 w-3.5" />
                        Table
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={view === "board"}
                        onClick={() => setView("board")}
                        className={cn(
                          "inline-flex h-full items-center gap-1.5 border-l border-border/80 px-2.5",
                          view === "board"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                        title="Board view"
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        Board
                      </button>
                    </div>
                    <SettingsLink
                      section="workflow"
                      iconOnly
                      ariaLabel="Open settings: Pipeline default view"
                    />
                    <SettingsLink
                      section="layout"
                      iconOnly
                      ariaLabel="Open settings: table layout and drawers"
                    />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Density
                    </span>
                    <div
                      className="inline-flex h-8 overflow-hidden rounded-md border border-border bg-background text-[11px] font-medium shadow-sm"
                      role="group"
                      aria-label="Table row density"
                    >
                      <button
                        type="button"
                        className={cn(
                          "px-2 transition-colors",
                          settings.tableDensity === "analyst"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                        onClick={() =>
                          updateUserSettings({ tableDensity: "analyst" })
                        }
                      >
                        Analyst
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "border-l border-border/80 px-2 transition-colors",
                          settings.tableDensity === "compact"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                        onClick={() =>
                          updateUserSettings({ tableDensity: "compact" })
                        }
                      >
                        Compact
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "border-l border-border/80 px-2 transition-colors",
                          settings.tableDensity === "comfortable"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                        onClick={() =>
                          updateUserSettings({ tableDensity: "comfortable" })
                        }
                      >
                        Comfortable
                      </button>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Quick
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => applyColumnPreset("funnel")}
                      title="Stage order, active only — operational funnel scan"
                    >
                      Funnel scan
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => applyColumnPreset("funding")}
                      title="Sort by funding (high → low)"
                    >
                      By funding
                    </Button>
                    <details className="relative min-w-0 shrink">
                      <summary
                        className={cn(
                          "flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium shadow-sm",
                          "marker:content-none [&::-webkit-details-marker]:hidden",
                        )}
                      >
                        <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Saved views
                        {savedViews.length > 0 && (
                          <span className="tabular-nums text-muted-foreground">
                            ({savedViews.length})
                          </span>
                        )}
                      </summary>
                      <div
                        className={cn(
                          "absolute left-0 z-[var(--dlc-z-dropdown,38)] mt-1 w-[min(calc(100dvw-2rem),18rem)] space-y-2 p-2 sm:right-0 sm:left-auto",
                          operationalOverlayDropdownClass(),
                        )}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-full justify-center text-xs"
                          onClick={saveNamedView}
                        >
                          Save current filters…
                        </Button>
                        {savedViews.length === 0 ? (
                          <p className="px-1 text-xs text-muted-foreground">
                            No saved views yet. Apply filters and sort, then save.
                          </p>
                        ) : (
                          <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
                            {savedViews.map((v) => (
                              <li
                                key={v.id}
                                className="flex items-center gap-1 rounded-md hover:bg-muted"
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-foreground"
                                  onClick={() => applyHubSnapshot(v)}
                                >
                                  {v.name}
                                </button>
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Delete saved view ${v.name}`}
                                  onClick={() => deleteNamedView(v.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </details>
                    {narrow ? (
                      <div
                        className="inline-flex h-8 overflow-hidden rounded-md border border-border bg-background text-[11px] font-medium shadow-sm"
                        role="tablist"
                        aria-label="Mobile row layout"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={hubMobileDisplay === "cards"}
                          className={cn(
                            "inline-flex h-full items-center gap-1 px-2.5",
                            hubMobileDisplay === "cards"
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted",
                          )}
                          onClick={() => setHubMobileDisplay("cards")}
                          title="Card list for field scanning"
                        >
                          <LayoutList className="h-3.5 w-3.5" />
                          Cards
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={hubMobileDisplay === "table"}
                          className={cn(
                            "inline-flex h-full items-center gap-1 border-l border-border/80 px-2.5",
                            hubMobileDisplay === "table"
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted",
                          )}
                          onClick={() => setHubMobileDisplay("table")}
                          title="Full data grid (horizontal scroll)"
                        >
                          <Rows3 className="h-3.5 w-3.5" />
                          Grid
                        </button>
                      </div>
                    ) : null}
                  </div>
                </section>

                {!listLoading && filtered.length > 0 ? (
                  <section
                    className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border/50 pt-3"
                    aria-label="Export visible rows"
                  >
                    <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Export
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={() => void copyPipelineTsv()}
                      title="Copy visible rows as TSV (paste into Excel or Sheets)"
                    >
                      {pipelineCopyState === "ok" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {pipelineCopyState === "ok"
                        ? "Copied"
                        : pipelineCopyState === "err"
                          ? "Copy failed"
                          : "Copy"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={exportPipelineTsv}
                      title="Download visible rows as TSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                      TSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={exportPipelineCsv}
                      title="Download visible rows as CSV (UTF-8 with BOM)"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={exportPipelineJson}
                      title="Download visible rows as JSON"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                      JSON
                    </Button>
                  </section>
                ) : null}

                <section
                  className="flex flex-col gap-2 border-t border-border/50 pt-3"
                  aria-label="Pipeline filters"
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Stage &amp; status filters
                    </h3>
                    {hubFilterActiveCount > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-muted-foreground"
                        onClick={clearHubAdvancedFilters}
                      >
                        Clear all
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 max-h-[min(40vh,16rem)] flex-wrap items-center gap-1.5 overflow-y-auto overscroll-contain touch-scroll-y md:max-h-none">
              {(stageIndex.tree.length > 0
                ? stageIndex.tree.map(({ stage, subStages }) => ({ stage, subStages }))
                : PIPELINE_STATUSES.map((s) => ({
                    stage: {
                      _id: s.value,
                      name: s.label,
                      color: "#F59E0B",
                    },
                    subStages: [] as never[],
                    legacyValue: s.value,
                  }))
              ).map((entry) => {
                const legacyValue =
                  "legacyValue" in entry
                    ? (entry.legacyValue as string)
                    : undefined;
                const stageKey = legacyValue ?? String(entry.stage._id);
                const active = legacyValue
                  ? statusFilter.has(legacyValue)
                  : stageFilter.has(stageKey);
                const badgeStyle = legacyValue
                  ? getPipelineStatusBadgeStyle(
                      legacyValue,
                      settings.pipelineStageStyles,
                      { selected: active, globalIndicator: globalUiIndicator },
                    )
                  : {
                      backgroundColor: `${entry.stage.color}22`,
                      borderColor: entry.stage.color,
                      color: "#111827",
                    };
                return (
                  <button
                    key={stageKey}
                    type="button"
                    onClick={() =>
                      legacyValue
                        ? toggleStatus(legacyValue)
                        : toggleStageFilter(stageKey)
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "ring-2 ring-brand-accent/40 ring-offset-1 ring-offset-background"
                        : "hover:border-brand-accent/40 hover:bg-muted hover:text-foreground",
                    )}
                    style={badgeStyle}
                    aria-pressed={active}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={
                        legacyValue
                          ? getPipelineStatusDotStyle(
                              legacyValue,
                              settings.pipelineStageStyles,
                              globalUiIndicator,
                            )
                          : { backgroundColor: entry.stage.color }
                      }
                    />
                    {entry.stage.name}
                  </button>
                );
              })}
              {CLIENT_MOMENTUM_FILTER_OPTIONS.map((o) => {
                const active = momentumFilter.has(o.value);
                return (
                  <button
                    key={`momentum-${o.value}`}
                    type="button"
                    onClick={() => toggleMomentum(o.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-amber-400/80 bg-amber-50 text-amber-950 ring-2 ring-brand-accent/40 ring-offset-1 ring-offset-background dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-50"
                        : "hover:border-brand-accent/40 hover:bg-muted hover:text-foreground",
                    )}
                    aria-pressed={active}
                    title={o.label}
                  >
                    <span className="tabular-nums tracking-tight" aria-hidden>
                      {o.value === "unrated"
                        ? "☆".repeat(5)
                        : "★".repeat(o.value)}
                    </span>
                    <span className="max-md:sr-only">{o.label}</span>
                  </button>
                );
              })}
              {(statusFilter.size > 0 ||
                stageFilter.size > 0 ||
                subStageFilter.size > 0 ||
                momentumFilter.size > 0 ||
                search) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-1 inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className={cn(
                  "ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  showArchived
                    ? "border-amber-300 bg-amber-50 text-amber-800 ring-2 ring-brand-accent/40 ring-offset-1 ring-offset-background dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                    : "border-border bg-background text-foreground/75 hover:border-brand-accent/40 hover:bg-muted hover:text-foreground"
                )}
                aria-pressed={showArchived}
                title={
                  showArchived
                    ? "Hide archived files"
                    : "Show archived files alongside active ones"
                }
              >
                <Archive className="h-3 w-3" />
                {showArchived ? "Including archived" : "Show archived"}
              </button>
              <button
                type="button"
                onClick={() => setShowSnoozed((v) => !v)}
                className={cn(
                  "ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  showSnoozed
                    ? "border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-brand-accent/40 ring-offset-1 ring-offset-background dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
                    : "border-border bg-background text-foreground/75 hover:border-brand-accent/40 hover:bg-muted hover:text-foreground"
                )}
                aria-pressed={showSnoozed}
                title={
                  showSnoozed
                    ? "Hide snoozed files"
                    : "Show files snoozed until a future date"
                }
              >
                <BellOff className="h-3 w-3" />
                {showSnoozed ? "Including snoozed" : "Show snoozed"}
              </button>
                  </div>
                </section>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground"
              data-testid="pipeline-hub-result-summary"
            >
              <span>
                {listLoading
                  ? "Loading…"
                  : `${filtered.length.toLocaleString()} of ${data.length.toLocaleString()}`}
              </span>
              {!listLoading && filtered.length > 0 ? (
                <span className="font-medium tabular-nums text-foreground">
                  Total · {fmtPipelineBoardLoanCompact(totalLoan)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        </div>

        {/*
          Single vertical scrollport is AppChrome <main>. No nested overflow-y here
          (avoids competing stickies). Clip horizontal bleed only.
        */}
        <OperationalContentReveal
          className="relative z-0 flex min-w-0 max-w-full flex-col"
          instant={PHASE_24_4I_HUB_STABILIZATION.omitEntryAnimations}
        >
        {!PHASE_24_4D_ISOLATION.omitOperationalOrientationStrip ? (
        <OperationalOrientationStrip
          sticky={
            !PHASE_24_4P_MASTER_LAYOUT_LOCKDOWN.purgeHubSticky
          }
          suppressScopeWhenMode
          modeLabel={
            hubProjectionOptions.find((o) => o.id === projectionMode)?.label ??
            "Hub"
          }
          crumbs={hubOrientationCrumbs}
          pills={[]}
          searchHint={
            search.trim() || projectionSearch.trim()
              ? [search.trim(), projectionSearch.trim()].filter(Boolean).join(" · ")
              : undefined
          }
          maxPills={0}
          data-testid="pipeline-hub-orientation"
        />
        ) : null}
        {effectiveView === "table" && (
          <div
            ref={hubListRef}
            className="min-w-0 w-full max-w-full"
            data-testid="pipeline-hub-hierarchy-shell"
            data-pipeline-hub-list="hierarchy"
            data-scroll-owner="pipeline-hub-list"
            data-clipping-parent="pipeline-hub-list"
          >
            {listLoading && (
              <div data-pipeline-hub-loading>
                <OperationalSkeletonList rows={8} className="py-4" />
              </div>
            )}
            {empty && (
              <OperationalEmptyState
                title="No loan files yet"
                description="Start with a client, then add a project and loan file. Everything stays linked in one graph."
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => openCreate({ mode: "full", stayOnHub: true })}
                  >
                    New client
                  </Button>
                }
                data-testid="pipeline-hub-empty"
              />
            )}
            {noMatches && (
              <OperationalEmptyState
                title="No matches"
                description="Try clearing filters or including archived and snoozed files."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      clearHubSearchAndStageFilters();
                      setFilterClientKey(null);
                      setFilterProjectKey(null);
                      setShowArchived(true);
                      setShowSnoozed(true);
                    }}
                  >
                    Reset filters
                  </Button>
                }
                data-testid="pipeline-hub-no-matches"
              />
            )}
            {!listLoading && !empty && !noMatches && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <SearchField
                    containerClassName="min-w-0 flex-1"
                    compact
                    value={projectionSearch}
                    onChange={(e) => setProjectionSearch(e.target.value)}
                    onClear={() => setProjectionSearch("")}
                    placeholder={projectionTopLevelSearchPlaceholder(
                      projectionMode,
                    )}
                    aria-label="Search projection view"
                    data-testid="pipeline-projection-search"
                  />
                </div>
                {projectionSearchNoMatches ? (
                  <p
                    className="py-8 text-center text-sm text-muted-foreground"
                    data-testid="pipeline-projection-search-empty"
                  >
                    No{" "}
                    {projectionMode === "file"
                      ? "loan files"
                      : `${projectionMode}s`}{" "}
                    match &ldquo;{projectionSearch.trim()}&rdquo;.
                  </p>
                ) : (
                  <PipelineHubProjectionView
                    mode={projectionMode}
                    stageIndex={stageIndex}
                    clientTree={clientFocusTree}
                    projectTree={projectFocusTree}
                    fileFlatGrouped={fileFlatGrouped}
                    lenderTree={lenderFocusTree}
                    referralTree={referralFocusTree}
                    teamTree={teamFocusTree}
                    taskTree={taskFocusTree}
                    expansion={hubExpansion}
                    onExpansionChange={setHubExpansion}
                    bulkIds={bulkIds}
                    toggleBulkOne={toggleBulkOne}
                    selectFile={selectFile}
                    selectFileNotes={selectFileNotes}
                    statusOptions={statusOptions}
                    onChangeRowStatus={onChangeRowStage}
                    onSetClientMomentum={runSetClientMomentum}
                    hubFocusFileId={hubFocusFileId}
                    organizationId={activeOrganizationId ?? undefined}
                    memberUserKey={memberUserKey}
                    onAddProject={onAddProjectFromClient}
                    onAddLoanFile={onAddLoanFromProject}
                    onFileDuplicated={selectFile}
                  />
                )}
              </>
            )}
          </div>
        )}

        {effectiveView === "board" && (
          <div
            className="relative z-0 min-w-0 max-w-full overflow-x-auto touch-pan-x"
            data-testid="pipeline-board-scroll"
          >
            <PipelineBoardView
              rows={filtered}
              stageTree={stageIndex.tree}
              stageIndex={stageIndex}
              hubFocusFileId={hubFocusFileId}
              selectFile={selectFile}
              runPatchPipeline={runPatchPipeline}
              runSetClientMomentum={runSetClientMomentum}
            />
          </div>
        )}
        </OperationalContentReveal>
      </div>
      <OperationalBatchBar
        open={effectiveView === "table" && bulkIds.size > 0}
        count={bulkIds.size}
        itemNoun="file"
        busy={bulkBusy}
        onClear={clearBulkSelection}
        data-testid="pipeline-hub-batch-bar"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs max-md:min-h-10"
          disabled={bulkBusy || !bulkArchiveEligible}
          onClick={() => void runBulkArchive()}
        >
          <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Archive
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs max-md:min-h-10"
          disabled={bulkBusy || !bulkUnarchiveEligible}
          onClick={() => void runBulkUnarchive()}
        >
          <ArchiveRestore className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Restore
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs max-md:min-h-10"
          disabled={bulkBusy}
          onClick={() => void runBulkDelete()}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Delete
        </Button>
      </OperationalBatchBar>
    </div>
    </>
  );
}
