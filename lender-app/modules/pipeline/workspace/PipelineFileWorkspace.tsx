"use client";

import { useRouter, useSearchParams } from "next/navigation";
import nextDynamic from "next/dynamic";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import {
  FileText,
  Building2,
  Coins,
  ScrollText,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BellOff,
  Plus,
  ListChecks,
  Paperclip,
  Printer,
  Users,
  Star,
  Eraser,
  Gavel,
  StickyNote,
  Settings2,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import {
  endOfLocalCalendarDayMs,
  isCurrentlySnoozed,
  snoozedUntilToMs,
  startOfLocalDayOffsetMs,
} from "@/lib/pipelineSnooze";
import { lastPipelineActivityAt } from "@/lib/pipelineAutoArchive";
import { PipelineFileAutoArchiveControl } from "@/components/pipeline/PipelineFileAutoArchiveControl";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  normalizeFileSharedStateFromPipeline,
  type PipelineFileSharedSource,
} from "@/lib/fileSharedFields";
import { revenueTotalsFromPipelineRow } from "@/lib/fileRevenue";
import {
  isTermOptionsOnlyPipelinePatch,
  patchWithConflictRetry,
} from "@/lib/pipeline/patchWithConflictRetry";
import { useUserSettings } from "@/lib/userSettingsContext";
import { useUserPreferences } from "@/lib/userPreferencesContext";
import { useLiveConnection } from "@/lib/useLiveConnection";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useOfflineSync } from "@/lib/offline/OfflineSyncContext";
import { isPatchDealConflictResult } from "@/lib/pipeline/patchDealResult";
import {
  collapseBehaviorFromDeviceFileSectionMode,
  drawerExpandedMapForCollapseBehavior,
  fileSectionDefaultModeFromCollapseBehavior,
  headerSectionsExpandedForCollapseBehavior,
} from "@/lib/pipelineDrawerCollapseBehavior";
import {
  applyPipelineFileExpandUxToExpanded,
  buildPipelineFileExpandActionHints,
  readPipelineFileExpandUxRules,
} from "@/lib/pipelineFileExpandUx";
import {
  readAiAssistEnabled,
  type UserPreferencesCollapseBehavior,
} from "@/lib/userPreferencesModel";
import type { UserSimpleWorkflowRule } from "@/lib/userWorkflowsModel";
import { parseUiDisplayColors } from "@/lib/uiDisplaySettings";
import { parseBlockSyncBehavior } from "@/lib/blockSyncBehaviorSettings";
import { usePipelineFileWorkspaceData } from "@/hooks/usePipelineFileWorkspaceData";
import { isPipelineFileQueryId } from "@/lib/pipeline/workspaceFileQuery";
import {
  contactRoleDisplayName,
  effectiveContactRoleIdFromDoc,
} from "@/lib/contact/contactRoles";
import { usePresence } from "@/hooks/usePresence";
import { traceConvexMutation, getWriteStormGovernance } from "@/lib/convexWriteStormGovernance";
import { contactMethodsCreateArgs } from "@/lib/contact/contactMethods";
import { drawerLayoutConvexPersistKey } from "@/lib/pipelineDrawerLayoutPersist";
import {
  buildLicenseDisplay,
  buildDealSheetForMetrics,
  buildProjectSiblingFileRows,
} from "@/lib/pipeline/workspaceDataDerivations";
import { buildDocumentCreatorTokenContext } from "@/lib/pipeline/buildDocumentCreatorTokenContext";
import { Button } from "@/components/ui/Button";
import { ActionSuiteModal } from "@/components/ui/ActionSuite";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import {
  HeaderDisclosurePanel,
} from "@/components/ui/HeaderDisclosure";
import { Input, Textarea } from "@/components/ui/Input";
import { SearchField } from "@/components/ui/SearchField";
import { cn } from "@/lib/cn";
import { OperationalSkeletonList } from "@/components/ui/OperationalSkeleton";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { convexClientErrorMessage } from "@/lib/ui/convexErrorMessage";
import { traceDeleteExecution } from "@/lib/ui/deleteExecutionTrace";
import { withOperationalTimeout } from "@/lib/ui/operationalAsync";
import {
  showOperationalToast,
  showOperationalToastRemoved,
} from "@/lib/ui/operationalToast";
import {
  pipelineLicensesHref,
  pipelineHubHref,
  pipelineDealEditorHref,
  pipelineHubProjectionHref,
  PIPELINE_FILE_BLOCK_QUERY,
  PIPELINE_FILE_TAB_QUERY,
  PIPELINE_FILE_DOCUMENT_QUERY,
  PIPELINE_HUB_PROJECTION_QUERY,
  PIPELINE_HUB_ENTITY_QUERY,
  PIPELINE_HUB_CLIENT_QUERY,
  PIPELINE_HUB_PROJECT_QUERY,
} from "@/lib/pipeline/routes";
import { isHubProjectionMode } from "@/lib/pipeline/graphProjection";
import { PipelineHierarchyBreadcrumb } from "@/components/pipeline/PipelineHierarchyBreadcrumb";
import { useWorkspaceHierarchyCrumbs } from "@/components/pipeline/WorkspaceHierarchyCrumbs";
import { ChangeFileProjectControl } from "@/components/pipeline/ChangeFileProjectControl";
import { LinkedClientsEditor } from "@/components/pipeline/LinkedClientsEditor";
import {
  formatTermOptionsBulletTermSheet,
  formatTermOptionsEmail,
} from "@/lib/termOptionsFormat";
import { ClientMomentumStars } from "@/components/pipeline/ClientMomentumStars";
import {
  InlineTextarea,
  InlineNumber,
  InlineSelect,
  InlineDate,
} from "@/components/inline";
import {
  getPipelineStatusSelectOptions,
  getPipelineStatusInfo,
} from "@/lib/pipelineStatus";
import { TaskDrawer } from "@/components/TaskDrawer";
import { PipelineFileSharingSection } from "./PipelineFileSharingSection";
import { ResourceAccessBanner } from "@/components/ResourceAccessBanner";
import { ResourceAccessProvider } from "@/components/ResourceAccessProvider";
import { resourceAccessFromViewerAccess } from "@/lib/resourceAccessUx";
import { ResourceAccessDetails } from "@/components/ownership/ResourceAccessDetails";
import {
  PipelineFileWorkspaceShell,
} from "./PipelineFileWorkspaceShell";
import { PresenceIndicators } from "@/components/collaboration/PresenceIndicators";
import { OccupancyConflictCallout } from "@/components/collaboration/OccupancyConflictCallout";
import { useNarrowViewport } from "@/lib/useNarrowViewport";
import { PipelineScrollDebugMount } from "@/components/debug/PipelineScrollDebugMount";
import { PipelineLayoutDebugMount } from "@/components/debug/PipelineLayoutDebugMount";
import { WorkspaceContentContainer } from "@/components/WorkspaceContentContainer";
import { PipelineWorkspaceSection } from "./PipelineWorkspaceSection";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { PipelineDrawerLayoutSettings } from "./PipelineDrawerLayoutSettings";
import {
  defaultPipelineDrawerLayout,
  loadPipelineDrawerLayoutForFile,
  normalizePipelineDrawerLayout,
  unhideDrawerBlockInLayout,
  resolveDrawerLayoutForHydration,
  savePipelineDrawerLayoutForFile,
  buildPipelineFileSectionsState,
  isPipelineDrawerBlockSectionId,
  type PipelineDrawerSectionId,
  type PipelineFileSectionId,
} from "@/lib/pipelineDrawerLayoutStorage";
import { pipelineDrawerSectionDomId } from "@/lib/pipelineDrawerSectionDom";
import { getActivePipelineBlockIdsForFile } from "@/lib/pipelineActiveBlocks";
import {
  getPipelineBlock,
  PIPELINE_BLOCK_IDS,
  type PipelineBlockId,
} from "@/lib/pipelineBlockRegistry";
import { FileFavoritesBar } from "@/components/pipeline/FileFavoritesBar";
import { PipelineOptionalBlocksAddBar } from "@/components/pipeline/PipelineOptionalBlocksAddBar";
import { ADVANCED_PIPELINE_BLOCK_IDS } from "@/lib/orgPlanFeatures";
import {
  extractDrawerVisibilitySignals,
  type DrawerVisibilitySignals,
} from "@/lib/pipelineBlockVisibility";
import { resolveDrawerBlockSettings } from "@/lib/pipelineDrawerBlockSettings";
import {
  applyPipelineGlobalBlockPolicy,
  getEffectiveMandatoryPipelineBlockIds,
} from "@/lib/pipelineGlobalBlockPolicy";
import {
  DEFAULT_DEAL_ANALYSIS_ORDER,
  parseDealAnalysisLayoutFromUnknown,
  type DealAnalysisLayoutV1,
} from "@/lib/file/dealAnalysisLayoutStorage";
import {
  DEFAULT_DEAL_WORKSPACE_TAB_ORDER,
  parseDealWorkspaceLayoutFromUnknown,
  type DealWorkspaceLayoutV1,
} from "@/lib/file/dealWorkspaceLayout";
import { buildPipelineDrawerMetricsContext } from "@/lib/file/fileSectionExpandPolicy";
import {
  pipelineDrawerSectionFieldCount,
  type TermOptionRowLite,
} from "@/lib/file/fileSectionMetrics";
import { DrawerBlockHeaderExtras } from "@/components/pipeline/PipelineBlockDrawerSettings";
import { PipelineDrawerBlockSuggestions } from "@/components/PipelineDrawerBlockSuggestions";
import { recordPipelineDrawerSectionExpanded } from "@/lib/pipelineDrawerBehaviorSignals";
import {
  FieldSyncIndicator,
  type FieldSyncSource,
} from "@/components/FieldSyncIndicator";
import { useBlockData } from "@/hooks/useBlockData";
import { embeddedDealPayloadIsSubstantive } from "@/lib/file/embeddedDealPresence";
import { deriveIntake } from "@/lib/intake/derivations";
import { toNumber } from "@/lib/intake/finance";
import { IntelligentAlertsCallout } from "@/components/IntelligentAlertsCallout";
import {
  buildCoverScenarioFundingAlerts,
  buildPipelineFundingMirrorAlerts,
  type IntelligentAlert,
} from "@/lib/intelligentAlerts";
import { getTopExpandedPipelineDrawerBlocks } from "@/lib/pipelineDrawerBehaviorSignals";
import { buildPipelineFileInsights } from "@/lib/pipelineFileInsights";
import { PipelineFileActivityPanel } from "@/components/PipelineFileActivityPanel";
import { isDealBackedPipelineRow } from "@/lib/pipeline/dealBackedRow";
import { resolvePipelineTableFundingAmount } from "@/lib/pipeline/resolvePipelineTableFundingAmount";
import {
  buildDealCommitRow,
  commitPipelineFileName,
  commitPipelineFundingAmount,
  commitPipelineSubjectAddress,
  subjectAddressEditorValue,
} from "@/lib/pipeline/pipelineTableCommits";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import {
  FileNotesBlock,
} from "@/components/pipeline/blocks/FileNotesBlock";
import { FileTasksBlock } from "@/components/pipeline/blocks/FileTasksBlock";
import { DealCommandCenterHeader } from "@/components/pipeline/deal/DealCommandCenterHeader";
import { DealFinancialsTab } from "@/components/pipeline/deal/DealFinancialsTab";
import { DealInfoCommandCenterTab } from "@/components/pipeline/deal/DealInfoCommandCenterTab";
import { PortalsAndProgressTab } from "@/components/pipeline/deal/PortalsAndProgressTab";
import { REALLOCATED_DEAL_WORKSPACE_SECTION_IDS } from "@/components/pipeline/tabs/DealWorkspaceTab";
import {
  FILE_WORKSPACE_TAB_LABELS,
  FileWorkspaceTabNav,
  FileWorkspaceTabShell,
  navHighlightTabFor,
  normalizeFileWorkspaceTab,
  type FileWorkspaceTabId,
} from "@/components/pipeline/FileWorkspaceTabShell";
import type { OverviewTabProps } from "@/components/pipeline/tabs/OverviewTab";
import { DocumentVaultTab } from "@/components/pipeline/tabs/DocumentVaultTab";
import { FormsApplicationsTab } from "@/components/pipeline/tabs/FormsApplicationsTab";
import { SettingsTab } from "@/components/pipeline/tabs/SettingsTab";
import {
  FeesSplitsBlock,
  type SplitRow,
} from "@/components/pipeline/blocks/FeesSplitsBlock";
import type { FileTaskCreatePayload } from "@/lib/inFileTaskTriageUi";
import { resolvePrimaryBorrowerContactId } from "@/lib/library/documentVaultHydration";
import {
  resolveEntityDisplayNameForClientTitle,
  resolveFileHeaderPrimaryBorrowerLabel,
} from "@/lib/pipeline/resolveFileHeaderPrimaryBorrowerLabel";
import { DealWorkspaceEditorProvider } from "@/lib/file/useDealWorkspaceEditor";
import {
  FloatingBlockWindowProvider,
  useFloatingBlockWindow,
} from "@/components/ui/FloatingBlockWindowProvider";
import { ClientBlockAssignProvider } from "@/lib/clientBlockAssignContext";
import { DocumentVaultStateProvider } from "@/lib/library/documentVaultState";
import {
  isLegacyDealWorkspaceMigratedDrawerBlockHidden,
  isLegacyFileAdminDrawerBlockHidden,
  isLegacyFileAdminHeaderOverflowHidden,
  isLegacyFileAdminLayoutStripHidden,
  isLegacyFileDetailsDrawerBlockHidden,
  isLegacyFeesSplitsDrawerBlockHidden,
  isLegacyLicensingDrawerBlockHidden,
  isLegacyOverviewDrawerBlockHidden,
} from "@/lib/pipeline/fileWorkspaceLegacyVisibility";
import {
  DEAL_INFO_TAB_SECTION_IDS,
  DOCUMENTS_TAB_SECTION_IDS,
  floatingBlockKeyForPipelineBlock,
  scrollTargetForDrawerBlock,
  scrollToPipelineWorkspaceAnchor,
  dealInfoAnchorForDrawerBlock,
  dealWorkspaceAnchorForDrawerBlock,
  overviewAnchorForDrawerBlock,
  settingsAnchorForDrawerBlock,
  tabForDrawerBlock,
} from "@/lib/pipeline/fileWorkspaceTabRouting";
import {
  createDocumentVaultNavigationFocus,
  type DocumentVaultNavigationFocus,
} from "@/lib/pipeline/documentVaultNavigation";

type TermOptionRow = {
  key: string;
  rate: string;
  term: string;
  prepaymentPenalty: string;
  notes: string;
  appraisalRequired: boolean;
  newLoanAmount: string;
  fundingTimeframe: string;
  qualifyingIncomeType: string;
  includeQualifyingIncomeAmount: boolean;
  qualifyingIncomeAmount: string;
};

function newRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newTermRow(): TermOptionRow {
  return {
    key: newRowKey(),
    rate: "",
    term: "",
    prepaymentPenalty: "",
    notes: "",
    appraisalRequired: true,
    newLoanAmount: "",
    fundingTimeframe: "",
    qualifyingIncomeType: "",
    includeQualifyingIncomeAmount: true,
    qualifyingIncomeAmount: "",
  };
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtRate(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
}

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString();
}

function termsEqual(
  a: ReadonlyArray<Omit<TermOptionRow, "key">>,
  b: ReadonlyArray<Omit<TermOptionRow, "key">>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.rate !== y.rate ||
      x.term !== y.term ||
      x.prepaymentPenalty !== y.prepaymentPenalty ||
      x.notes !== y.notes ||
      x.appraisalRequired !== y.appraisalRequired ||
      x.newLoanAmount !== y.newLoanAmount ||
      x.fundingTimeframe !== y.fundingTimeframe ||
      x.qualifyingIncomeType !== y.qualifyingIncomeType ||
      x.includeQualifyingIncomeAmount !== y.includeQualifyingIncomeAmount ||
      x.qualifyingIncomeAmount !== y.qualifyingIncomeAmount
    ) {
      return false;
    }
  }
  return true;
}

const IntakeEditorLazy = nextDynamic(
  () =>
    import("@/components/intake/IntakeEditor").then((m) => ({
      default: m.IntakeEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[12rem] items-center justify-center py-8 text-sm text-muted-foreground">
        Loading deal workspace…
      </div>
    ),
  }
);

const PipelineScenarioMatchLazy = nextDynamic(
  () =>
    import("./PipelineScenarioMatch").then((m) => ({
      default: m.PipelineScenarioMatch,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[8rem] items-center justify-center py-6 text-sm text-muted-foreground">
        Loading scenario match…
      </div>
    ),
  }
);

const FileContactsBlockLazy = nextDynamic(
  () =>
    import("@/components/pipeline/blocks/FileContactsBlock").then((m) => ({
      default: m.FileContactsBlock,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Loading contacts…
      </div>
    ),
  }
);

/* Phase Modular-C — opt-in blocks (hidden by default; enabled per file/template). */
const ConstructionBudgetBlockLazy = nextDynamic(
  () =>
    import("@/components/pipeline/blocks/ConstructionBudgetBlock").then(
      (m) => ({ default: m.ConstructionBudgetBlock }),
    ),
  { ssr: false },
);

const InvestorExperienceBlockLazy = nextDynamic(
  () =>
    import("@/components/pipeline/blocks/InvestorExperienceBlock").then(
      (m) => ({ default: m.InvestorExperienceBlock }),
    ),
  { ssr: false },
);

const PfsBlockLazy = nextDynamic(
  () =>
    import("@/components/pipeline/blocks/PfsBlock").then((m) => ({
      default: m.PfsBlock,
    })),
  { ssr: false },
);

const TrackRecordBlockLazy = nextDynamic(
  () =>
    import("@/components/pipeline/blocks/TrackRecordBlock").then((m) => ({
      default: m.TrackRecordBlock,
    })),
  { ssr: false },
);

const SimplePlBlockLazy = nextDynamic(
  () =>
    import("@/components/pipeline/blocks/SimplePlBlock").then((m) => ({
      default: m.SimplePlBlock,
    })),
  { ssr: false },
);

/**
 * Favorites bar — open pinned blocks in window-in-window (FloatingBlockWindow
 * host, same as CollapsibleBlock “Open in window”). Seed-capable blocks use a
 * dedicated `favorite-float:` key with standalone content (avoids nested
 * detachable stubs). Other blocks with a layout CollapsibleBlock key request
 * detach after the parent tab mounts. Fallback: deep-link to section.
 */
const FAVORITE_FLOATING_CAPABLE_BLOCKS = new Set<PipelineBlockId>([
  "fileNotes",
  "tasks",
  "contacts",
  "constructionBudget",
  "investorExperience",
  "pfs",
  "trackRecord",
  "simplePl",
]);

/** Blocks offered in the favorites manage popover (destructive admin excluded). */
const FAVORITE_PINNABLE_BLOCK_IDS: readonly PipelineBlockId[] =
  PIPELINE_BLOCK_IDS.filter((id) => id !== "dangerZone");

/**
 * Pins FileFavoritesBar inside FloatingBlockWindowProvider so chip clicks call
 * the same detach host as CollapsibleBlock “Open in window”.
 */
function FileFavoritesFloatingLauncher({
  favorites,
  pinnableBlockIds,
  disabled = false,
  onToggleFavorite,
  onPrepareBlock,
  onEnsureMounted,
  onJumpToSection,
  renderContent,
}: {
  favorites: readonly PipelineBlockId[];
  pinnableBlockIds: readonly PipelineBlockId[];
  disabled?: boolean;
  onToggleFavorite: (blockId: PipelineBlockId) => void;
  onPrepareBlock: (blockId: PipelineBlockId) => void;
  /** Switch parent tab so an in-layout CollapsibleBlock can mount / fulfill detach. */
  onEnsureMounted: (blockId: PipelineBlockId) => void;
  onJumpToSection: (blockId: PipelineBlockId) => void;
  renderContent: (blockId: PipelineBlockId) => ReactNode;
}) {
  const floating = useFloatingBlockWindow();

  const openFavoriteBlock = useCallback(
    (blockId: PipelineBlockId) => {
      onPrepareBlock(blockId);
      if (!floating) {
        onJumpToSection(blockId);
        return;
      }

      if (FAVORITE_FLOATING_CAPABLE_BLOCKS.has(blockId)) {
        const def = getPipelineBlock(blockId);
        // Dedicated key — favorites render a standalone content instance (same as the
        // former slide-over). Do not reuse CollapsibleBlock section ids or nested
        // detachable wrappers (PFS / construction budget) would stub inside the WiW.
        const blockKey = `favorite-float:${blockId}`;
        if (floating.isDetached(blockKey)) {
          return;
        }
        floating.detach({
          blockKey,
          title: def.label,
          description: def.description,
          persistKey: `favorite-float:${blockId}`,
          content: renderContent(blockId),
          onGoToSection: () => {
            onJumpToSection(blockId);
          },
          testId: `pipeline-favorite-${blockId}-floating-window`,
        });
        return;
      }

      const layoutKey = floatingBlockKeyForPipelineBlock(blockId);
      if (!layoutKey) {
        onJumpToSection(blockId);
        return;
      }
      if (floating.isDetached(layoutKey)) {
        return;
      }
      floating.requestDetach(layoutKey);
      onEnsureMounted(blockId);
    },
    [
      floating,
      onPrepareBlock,
      onEnsureMounted,
      onJumpToSection,
      renderContent,
    ],
  );

  return (
    <FileFavoritesBar
      favorites={favorites}
      pinnableBlockIds={pinnableBlockIds}
      onOpenBlock={openFavoriteBlock}
      onToggleFavorite={onToggleFavorite}
      disabled={disabled}
    />
  );
}

/** Stable empty reference for lender rows while `detail` is loading. */
const EMPTY_PIPELINE_LENDER_ROWS: Doc<"lenders">[] = [];

type PipelineDrawerTaskPatchFields = Omit<
  Parameters<ReturnType<typeof useMutation<typeof api.tasks.patch>>>[0],
  "id" | "expectedUpdatedAt" | "organizationId" | "memberUserKey"
>;

export function PipelineFileWorkspace({
  fileId,
  embedded = false,
}: {
  fileId: Id<"pipeline">;
  /** Nested in client workspace file card — omits unified header and page scroll assumptions. */
  embedded?: boolean;
}) {
  if (!isPipelineFileQueryId(fileId)) {
    return null;
  }
  return <PipelineFileWorkspaceLoaded fileId={fileId} embedded={embedded} />;
}

function PipelineFileWorkspaceLoaded({
  fileId,
  embedded = false,
}: {
  fileId: Id<"pipeline">;
  embedded?: boolean;
}) {
  /**
   * Layering (modernization split):
   * - **Subscriptions:** `usePipelineFileWorkspaceData` — single module for file-scoped Convex queries.
   * - **Derivations:** `lib/pipeline/workspaceDataDerivations` — pure helpers (switcher sort, license, deal sheet).
   * - **Orchestration:** layout state, mutations, expand/collapse policy, and block map (below).
   * - **Presentation:** `PipelineFileWorkspaceShell` + per-block regions (virtualization-ready `key={sid}` list).
   */
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm } = useOperationalConfirm();
  const id = fileId;
  useLayoutEffect(() => {
    if (embedded) return;
    const workspaceScroller = document.querySelector<HTMLElement>(
      "[data-pipeline-workspace-scroll]",
    );
    const main = document.querySelector<HTMLElement>(
      '[data-testid="app-main-scroll"]',
    );
    const scroller = workspaceScroller ?? main;
    if (!scroller) return;
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
  }, [id, embedded]);
  const goToPipelineHub = useCallback((): string => {
    const rawMode = searchParams.get(PIPELINE_HUB_PROJECTION_QUERY);
    const hubMode =
      rawMode && isHubProjectionMode(rawMode) ? rawMode : undefined;
    const hubEntity = searchParams.get(PIPELINE_HUB_ENTITY_QUERY) ?? undefined;
    const hubClient = searchParams.get(PIPELINE_HUB_CLIENT_QUERY) ?? undefined;
    const hubProject =
      searchParams.get(PIPELINE_HUB_PROJECT_QUERY) ?? undefined;
    const href = pipelineHubHref(undefined, {
      hubMode,
      hubEntity,
      hubClient,
      hubProject,
    });
    router.replace(href);
    return href;
  }, [router, searchParams]);
  const { settings, update: updateUserSettings } = useUserSettings();
  const { accountId, preferences, updatePreferences, ready: prefsServerReady } =
    useUserPreferences();
  const preferencesAccountId = accountId.trim() || undefined;
  const actorKeyRaw = useActorUserKey();
  const convexMemberKey = actorKeyRaw.trim() || undefined;
  const { activeOrganizationId } = useOrgPermissions();
  const [headerDetailsExpanded, setHeaderDetailsExpanded] = useState(false);
  const [headerDetailsMounted, setHeaderDetailsMounted] = useState(false);
  useEffect(() => {
    if (headerDetailsExpanded) setHeaderDetailsMounted(true);
  }, [headerDetailsExpanded]);
  const {
    orgConvexArgs,
    detail,
    pipelineSwitcherPreview,
    pipelineSwitcherRows,
    orgPlanEntitlements,
    intakeForLicense,
    simpleWorkflowsDoc,
    linkedTasks,
    standaloneContacts,
    associatedContactLinks,
    fileTaskAttachmentCounts,
    lenderOrgArgs,
    revenueOrgAgg,
    revenueUserAgg,
    pipelineOrgId,
  } = usePipelineFileWorkspaceData({
    fileId: id,
    convexMemberKey,
    preferencesAccountId,
    activeOrganizationId,
    accountId,
    embedded,
  });

  const workspaceContactRoles =
    useQuery(
      api.organizationSettings.getContactRoles,
      detail?.pipeline?.organizationId &&
        (convexMemberKey ?? preferencesAccountId)
        ? {
            organizationId: detail.pipeline.organizationId,
            memberUserKey: convexMemberKey ?? preferencesAccountId,
          }
        : "skip",
    ) ?? [];

  const fileLenderLinks = useQuery(
    api.fileLenders.listByFile,
    detail?.pipeline?._id && (convexMemberKey ?? preferencesAccountId)
      ? {
          fileId: detail.pipeline._id,
          memberUserKey: convexMemberKey ?? preferencesAccountId,
        }
      : "skip",
  );

  const vaultPendingReview = useQuery(
    api.documentVaultFileTasks.countPendingReviewByPipeline,
    detail?.pipeline?._id && (convexMemberKey ?? preferencesAccountId)
      ? {
          pipelineFileId: detail.pipeline._id,
          memberUserKey: convexMemberKey ?? preferencesAccountId,
        }
      : "skip",
  );

  const workspaceTabIndicators = useMemo((): Partial<
    Record<FileWorkspaceTabId, { showDot?: boolean; count?: number }>
  > => {
    const count = vaultPendingReview?.count ?? 0;
    if (count <= 0) return {};
    return {
      documents: { showDot: true, count },
    };
  }, [vaultPendingReview?.count]);

  const fileLenderLinkById = useMemo(() => {
    const m = new Map<
      string,
      {
        relationshipType: string;
        rejectionReason?: string;
        selectedProgramName?: string;
        contactRepId?: Id<"contacts">;
        contactRepName?: string;
      }
    >();
    for (const link of fileLenderLinks ?? []) {
      m.set(String(link.lenderId), link);
    }
    return m;
  }, [fileLenderLinks]);

  // Phase Modular-B — multi-lender roles, per-file programs, lender playbooks.
  const setLenderLinkRole = useMutation(api.fileLenders.setLenderLinkRole);
  const setLenderLinkProgram = useMutation(
    api.fileLenders.setLenderLinkProgram,
  );
  const setLenderLinkRep = useMutation(api.fileLenders.setLenderLinkRep);
  const applyTemplateGroupToFile = useMutation(
    api.taskTemplateLibrary.applyTemplateGroupToFile,
  );
  const workspaceTemplateGroups = useQuery(
    api.taskTemplateLibrary.listTemplateGroups,
    detail?.pipeline?.organizationId &&
      (convexMemberKey ?? preferencesAccountId)
      ? {
          organizationId: detail.pipeline.organizationId,
          memberUserKey: (convexMemberKey ?? preferencesAccountId)!,
        }
      : "skip",
  );
  const lenderPlaybookByLenderId = useMemo(() => {
    const m = new Map<
      string,
      { groupId: Id<"taskTemplateGroups">; name: string }
    >();
    for (const group of workspaceTemplateGroups ?? []) {
      if (group.lenderId) {
        m.set(String(group.lenderId), { groupId: group._id, name: group.name });
      }
    }
    return m;
  }, [workspaceTemplateGroups]);
  const lenderPlaybookNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const [lenderId, entry] of lenderPlaybookByLenderId) {
      m.set(lenderId, entry.name);
    }
    return m;
  }, [lenderPlaybookByLenderId]);

  const workspaceContactById = useMemo(() => {
    const m = new Map<Id<"contacts">, Doc<"contacts">>();
    for (const c of standaloneContacts ?? []) {
      m.set(c._id, c);
    }
    return m;
  }, [standaloneContacts]);

  const { canUseHub } = useLiveConnection();
  const offline = useOfflineSync();
  const workflowRulesForIntelligence = useMemo(
    (): readonly UserSimpleWorkflowRule[] => {
      const r = simpleWorkflowsDoc?.rules;
      if (!Array.isArray(r)) return [];
      return r as UserSimpleWorkflowRule[];
    },
    [simpleWorkflowsDoc?.rules],
  );

  const drawerAiAssistEnabled = useMemo(
    () =>
      Boolean(process.env.NEXT_PUBLIC_CONVEX_URL) &&
      readAiAssistEnabled(preferences.behaviorSettings),
    [preferences.behaviorSettings],
  );

  const [attachError, setAttachError] = useState<string | null>(null);
  const [optimisticConsideringIds, setOptimisticConsideringIds] = useState<
    Set<Id<"lenders">>
  >(() => new Set());

  /** Stable subscription — must run before any early return (Rules of Hooks). */
  const pipelineLenderRows = detail?.lenders ?? EMPTY_PIPELINE_LENDER_ROWS;

  const [optimisticLenderDocs, setOptimisticLenderDocs] = useState<
    Map<Id<"lenders">, Doc<"lenders">>
  >(() => new Map());

  useEffect(() => {
    if (optimisticConsideringIds.size === 0) return;
    const linkedConsidering = new Set(
      (detail?.consideringLenderIds ?? []).map(String),
    );
    setOptimisticConsideringIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (linkedConsidering.has(String(id))) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [detail?.consideringLenderIds, optimisticConsideringIds.size]);

  const mergedLenderRows = useMemo(() => {
    if (optimisticLenderDocs.size === 0) return pipelineLenderRows;
    const byId = new Map(pipelineLenderRows.map((l) => [l._id, l]));
    for (const [lenderId, doc] of optimisticLenderDocs) {
      if (!byId.has(lenderId)) byId.set(lenderId, doc);
    }
    return [...byId.values()];
  }, [pipelineLenderRows, optimisticLenderDocs]);

  const withOptimisticDoc = useCallback(
    (l: Doc<"lenders">) => optimisticLenderDocs.get(l._id) ?? l,
    [optimisticLenderDocs],
  );

  const primaryLender = useMemo(() => {
    const base = detail?.primaryLender ?? null;
    return base ? withOptimisticDoc(base) : null;
  }, [detail?.primaryLender, withOptimisticDoc]);

  const secondaryLenders = useMemo(() => {
    const base =
      detail?.secondaryLenders ?? detail?.supportingLenders ?? [];
    return base.map(withOptimisticDoc);
  }, [detail?.secondaryLenders, detail?.supportingLenders, withOptimisticDoc]);

  const consideringLenders = useMemo(() => {
    const base = detail?.consideringLenders ?? [];
    const byId = new Map(base.map((l) => [l._id, withOptimisticDoc(l)]));
    for (const lenderId of optimisticConsideringIds) {
      if (!byId.has(lenderId)) {
        const doc = optimisticLenderDocs.get(lenderId);
        if (doc) byId.set(lenderId, doc);
      }
    }
    return [...byId.values()];
  }, [
    detail?.consideringLenders,
    optimisticConsideringIds,
    optimisticLenderDocs,
    withOptimisticDoc,
  ]);

  useEffect(() => {
    setOptimisticLenderDocs((prev) => {
      if (prev.size === 0) return prev;
      const linked = new Set(pipelineLenderRows.map((l) => l._id));
      let changed = false;
      const next = new Map(prev);
      for (const lenderId of prev.keys()) {
        if (linked.has(lenderId)) {
          next.delete(lenderId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pipelineLenderRows]);

  const [settingBoardRoleId, setSettingBoardRoleId] =
    useState<Id<"lenders"> | null>(null);
  const [removingFromFileId, setRemovingFromFileId] =
    useState<Id<"lenders"> | null>(null);
  const [rejectModalLenderId, setRejectModalLenderId] =
    useState<Id<"lenders"> | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState<Id<"lenders"> | null>(null);
  const [restoring, setRestoring] = useState<Id<"lenders"> | null>(null);
  // null  = no confirm in flight. "selected" / "all" = confirming that
  // mode of the bulk-clear action (matches the existing inline-confirm
  // pattern used for delete elsewhere in the drawer).
  const [confirmClear, setConfirmClear] = useState<
    "selected" | "all" | null
  >(null);
  const [clearing, setClearing] = useState(false);
  const [exportCopied, setExportCopied] = useState<"bullets" | "email" | null>(
    null
  );
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);
  /** Phase 37.3 — tab shell navigation (Overview, Borrowers, …). */
  const [workspaceActiveTab, setWorkspaceActiveTab] =
    useState<FileWorkspaceTabId>("dealInfo");
  /** Phase 37.7.UX — Tab 5 → Tab 4 vault focus (category chip + row flash). */
  const [documentsVaultFocus, setDocumentsVaultFocus] =
    useState<DocumentVaultNavigationFocus | null>(null);
  const narrow = useNarrowViewport();
  /** Legacy hallway lenders block only (rollback when overview breaker is off). */
  const [mobileLenderPanel, setMobileLenderPanel] = useState<
    "find" | "onFile"
  >("find");

  useEffect(() => {
    if (!narrow) return;
    const n = detail?.lenders?.length ?? 0;
    if (n === 0) setMobileLenderPanel("find");
  }, [narrow, detail?.lenders?.length, id]);

  const [drawerLayout, setDrawerLayout] = useState(() =>
    defaultPipelineDrawerLayout()
  );
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const [focusedDealFieldPaths, setFocusedDealFieldPaths] = useState<string[]>(
    [],
  );
  const [fileSectionBulkBusy, setFileSectionBulkBusy] = useState(false);
  useEffect(() => {
    if (id === null) return;
    const t = window.setTimeout(() => {
      savePipelineDrawerLayoutForFile(id, drawerLayout);
    }, 400);
    return () => window.clearTimeout(t);
  }, [drawerLayout, id]);

  const sectionsState = useMemo(
    () => buildPipelineFileSectionsState(drawerLayout.expanded),
    [drawerLayout.expanded],
  );

  const sectionExpanded = useCallback(
    (sid: PipelineFileSectionId) => drawerLayout.expanded[sid] === true,
    [drawerLayout.expanded],
  );

  const layoutExpandUserDirtyRef = useRef(false);

  const setSectionExpanded = useCallback(
    (sid: PipelineFileSectionId, next: boolean) => {
      layoutExpandUserDirtyRef.current = true;
      if (next && isPipelineDrawerBlockSectionId(sid)) {
        recordPipelineDrawerSectionExpanded(sid);
      }
      setDrawerLayout((prev) => ({
        ...prev,
        expanded: { ...prev.expanded, [sid]: next },
      }));
    },
    [],
  );

  const deepLinkBlock = searchParams.get(PIPELINE_FILE_BLOCK_QUERY);
  const deepLinkTab = searchParams.get(PIPELINE_FILE_TAB_QUERY);
  const deepLinkDocument = searchParams.get(PIPELINE_FILE_DOCUMENT_QUERY);
  const pipelineReadyId = detail?.pipeline?._id;

  useEffect(() => {
    if (!deepLinkTab || pipelineReadyId == null) return;
    const normalized = normalizeFileWorkspaceTab(deepLinkTab);
    if (!normalized) return;
    setWorkspaceActiveTab(normalized);
  }, [pipelineReadyId, deepLinkTab]);

  useEffect(() => {
    if (!deepLinkDocument?.trim() || pipelineReadyId == null) return;
    const docId = deepLinkDocument.trim() as Id<"libraryDocuments">;
    setDocumentsVaultFocus(
      createDocumentVaultNavigationFocus({ highlightDocumentId: docId }),
    );
    setWorkspaceActiveTab("documents");
    const anchorId = DOCUMENTS_TAB_SECTION_IDS.vault;
    const t = window.requestAnimationFrame(() => {
      scrollToPipelineWorkspaceAnchor(anchorId, "auto");
    });
    return () => window.cancelAnimationFrame(t);
  }, [pipelineReadyId, deepLinkDocument]);

  useEffect(() => {
    if (!deepLinkBlock || pipelineReadyId == null) return;
    if (
      deepLinkBlock !== "fileNotes" &&
      deepLinkBlock !== "tasks" &&
      deepLinkBlock !== "documents"
    ) {
      return;
    }
    const sid = deepLinkBlock as PipelineDrawerSectionId;
    const tab = tabForDrawerBlock(sid);
    if (tab) setWorkspaceActiveTab(tab);
    if (deepLinkBlock === "documents") {
      setWorkspaceActiveTab("documents");
    }
    setSectionExpanded(deepLinkBlock, true);
    const legacyDomId =
      deepLinkBlock === "fileNotes"
        ? "pipeline-block-fileNotes"
        : deepLinkBlock === "tasks"
          ? "pipeline-block-tasks"
          : "pipeline-block-documents";
    const anchorId = scrollTargetForDrawerBlock(sid, legacyDomId);
    const t = window.requestAnimationFrame(() => {
      scrollToPipelineWorkspaceAnchor(anchorId, "auto");
    });
    return () => window.cancelAnimationFrame(t);
  }, [pipelineReadyId, deepLinkBlock, setSectionExpanded]);

  /** Phase 24.7 — surface file notes if layout-hidden; default open only when expand state unset. */
  const fileNotesDefaultsForIdRef = useRef<Id<"pipeline"> | null>(null);

  useEffect(() => {
    layoutExpandUserDirtyRef.current = false;
    fileNotesDefaultsForIdRef.current = null;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setDrawerLayout((prev) => {
      if (!prev.hidden.includes("fileNotes")) return prev;
      return unhideDrawerBlockInLayout(prev, "fileNotes");
    });
  }, [id]);

  useEffect(() => {
    if (!detail?.pipeline || detail.pipeline._id !== id || !id) return;
    if (fileNotesDefaultsForIdRef.current === id) return;
    fileNotesDefaultsForIdRef.current = id;
    setDrawerLayout((prev) => {
      const cur = prev.expanded.fileNotes;
      if (cur === true || cur === false) return prev;
      return { ...prev, expanded: { ...prev.expanded, fileNotes: true } };
    });
  }, [detail?.pipeline?._id, id]);

  /** Deal-type / funding-type signals for conditional block visibility (does not change saved layout). */
  const drawerVisibilitySignals = useMemo(():
    | DrawerVisibilitySignals
    | undefined => {
    const pipe = detail?.pipeline;
    if (!pipe) return undefined;
    if (
      !isDealBackedPipelineRow({
        dealData: pipe.dealData,
        intakeSheetId: pipe.intakeSheetId,
      }) &&
      !embeddedDealPayloadIsSubstantive(pipe.dealData)
    ) {
      return undefined;
    }
    return extractDrawerVisibilitySignals(pipe.dealData);
  }, [detail?.pipeline]);

  const drawerVisibilitySignalsRef = useRef<
    DrawerVisibilitySignals | undefined
  >(undefined);
  useEffect(() => {
    drawerVisibilitySignalsRef.current = drawerVisibilitySignals;
  }, [drawerVisibilitySignals]);

  const fileNotesResolvedSettings = useMemo(
    () => resolveDrawerBlockSettings("fileNotes", drawerLayout),
    [drawerLayout],
  );

  /** Registry mandatory only — admin “required” pins apply to new files, not live drawer locks. */
  const layoutNonHideableIds = useMemo(
    () => getEffectiveMandatoryPipelineBlockIds(undefined),
    []
  );

  // Local term-options buffer hydrated from server, debounced back via patch.
  const [termOptions, setTermOptions] = useState<TermOptionRow[]>([]);
  const lastSyncedTerms = useRef<Array<Omit<TermOptionRow, "key">>>([]);

  const patchPipeline = useMutation(api.pipeline.patch);
  const patchDeal = useMutation(api.pipeline.patchDeal);
  const setClientMomentumMut = useMutation(api.pipeline.setClientMomentum);
  const accessReadOnly = detail?.viewerAccess?.bannerMode === "view";

  const runPatchPipeline = useCallback(
    async (args: Parameters<typeof patchPipeline>[0]) => {
      if (accessReadOnly) return;
      const pipe = detail?.pipeline;
      // Online File Details edits (TERM, scenario, commission, …) must not send
      // expectedUpdatedAt: background writers (Generate Terms, patchDeal, layout)
      // bump updatedAt constantly, and production redacts CONFLICT_DATA_CHANGED
      // to a bare "Server Error" (requests 7bfb56523352ca45 / 0e56365204c62ef1).
      // Offline queue still carries the guard; patchWithConflictRetry remains a
      // safety net when a guard is present.
      const termOptionsOnly = isTermOptionsOnlyPipelinePatch(
        args as Record<string, unknown>,
      );
      const expectedUpdatedAt =
        !canUseHub &&
        !termOptionsOnly &&
        pipe?._id === args.id
          ? pipe.updatedAt
          : undefined;
      const payload = {
        ...args,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      } as Parameters<typeof patchPipeline>[0];
      if (canUseHub) {
        traceConvexMutation("PipelineFileWorkspace", "pipeline.patch");
        return patchWithConflictRetry(payload, (next) => patchPipeline(next));
      }
      await offline.enqueue({
        kind: "pipeline.patch",
        queueKey: `pipeline.patch::${args.id}`,
        args: { ...(payload as Record<string, unknown>) },
      });
    },
    [
      accessReadOnly,
      canUseHub,
      detail?.pipeline,
      offline,
      patchPipeline,
      preferencesAccountId,
    ],
  );
  const runPatchPipelineRef = useRef(runPatchPipeline);
  runPatchPipelineRef.current = runPatchPipeline;
  const runPatchDeal = useCallback(
    async (args: Parameters<typeof patchDeal>[0]) => {
      if (accessReadOnly) return;
      const pipe = detail?.pipeline;
      const expectedUpdatedAt =
        pipe?._id === args.fileId ? pipe.updatedAt : undefined;
      const payload = {
        ...args,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      } as Parameters<typeof patchDeal>[0];
      if (canUseHub) {
        traceConvexMutation("PipelineFileWorkspace", "pipeline.patchDeal");
        const res = await patchDeal(payload);
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
    [
      accessReadOnly,
      canUseHub,
      detail?.pipeline,
      offline,
      patchDeal,
      preferencesAccountId,
    ],
  );
  const patchFileDrawerLayout = useMutation(api.pipeline.patchFileDrawerLayout);
  const resetFileDrawerLayoutToTemplate = useMutation(
    api.pipeline.resetFileDrawerLayoutToTemplate
  );
  const createContact = useMutation(api.contacts.create);
  const upsertContactFileLink = useMutation(api.contactFileLinks.upsert);
  const removeContactFileLink = useMutation(api.contactFileLinks.remove);
  const assignContactToBorrowerSlot = useMutation(
    api.pipelineContacts.assignContactToBorrowerSlot,
  );

  const drawerHydratedForIdRef = useRef<Id<"pipeline"> | null>(null);
  const skipDrawerLayoutPersistRef = useRef(false);
  const layoutReadyForPersistRef = useRef(false);
  const lastConvexDrawerPersistKeyRef = useRef<string | null>(null);
  const [drawerLayoutResetting, setDrawerLayoutResetting] = useState(false);

  useEffect(() => {
    getWriteStormGovernance().setFileRouteActive(true);
    return () => getWriteStormGovernance().setFileRouteActive(false);
  }, [id]);

  useEffect(() => {
    if (id === null) {
      drawerHydratedForIdRef.current = null;
      layoutReadyForPersistRef.current = false;
      return;
    }
    const pipe = detail?.pipeline;
    if (!pipe || pipe._id !== id) {
      layoutReadyForPersistRef.current = false;
      return;
    }
    if (drawerHydratedForIdRef.current === id) {
      layoutReadyForPersistRef.current = true;
      return;
    }
    drawerHydratedForIdRef.current = id;
    const next = resolveDrawerLayoutForHydration(
      pipe.fileDrawerLayout,
      loadPipelineDrawerLayoutForFile(pipe._id),
    );
    lastConvexDrawerPersistKeyRef.current = drawerLayoutConvexPersistKey(next);
    setDrawerLayout((prev) => {
      if (!layoutExpandUserDirtyRef.current) return next;
      return { ...next, expanded: { ...next.expanded, ...prev.expanded } };
    });
    layoutExpandUserDirtyRef.current = false;
    skipDrawerLayoutPersistRef.current = true;
    layoutReadyForPersistRef.current = true;
  }, [id, pipelineReadyId]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_CONVEX_URL) return;
    if (id === null) return;
    if (pipelineReadyId !== id) return;
    if (!layoutReadyForPersistRef.current) return;

    if (skipDrawerLayoutPersistRef.current) {
      skipDrawerLayoutPersistRef.current = false;
      return;
    }

    const persistKey = drawerLayoutConvexPersistKey(drawerLayout);
    if (persistKey === lastConvexDrawerPersistKeyRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastConvexDrawerPersistKeyRef.current = persistKey;
      traceConvexMutation("PipelineFileWorkspace", "pipeline.patchFileDrawerLayout");
      void patchFileDrawerLayout({
        id,
        layout: {
          v: 1,
          order: drawerLayout.order,
          hidden: drawerLayout.hidden,
          expanded: drawerLayout.expanded,
          settings: drawerLayout.settings,
        },
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    drawerLayout,
    id,
    pipelineReadyId,
    patchFileDrawerLayout,
    preferencesAccountId,
  ]);

  useEffect(() => {
    setFocusedDealFieldPaths([]);
  }, [id]);

  useEffect(() => {
    const root = drawerBodyRef.current;
    if (!root) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const el = t.closest("[data-pipeline-deal-path]");
      if (!el) return;
      const path = el.getAttribute("data-pipeline-deal-path");
      const trimmed = path?.trim();
      if (trimmed) {
        setFocusedDealFieldPaths([trimmed]);
      }
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, [id, detail?.pipeline?._id]);

  const resetDrawerToTemplate = useCallback(async () => {
    if (id === null || !detail?.pipeline || detail.pipeline._id !== id) return;
    setDrawerLayoutResetting(true);
    try {
      const tpl = settings.pipelineDrawerTemplate;
      const res = await resetFileDrawerLayoutToTemplate({
        id,
        templateOrder: tpl?.order,
        templateHidden: tpl?.hidden,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
      if (res.fileDrawerLayout) {
        setDrawerLayout(normalizePipelineDrawerLayout(res.fileDrawerLayout));
      } else {
        const normalized = normalizePipelineDrawerLayout({
          v: 1,
          order: tpl?.order ?? [],
          hidden: tpl?.hidden ?? [],
          expanded: {},
        });
        const nonHideable = new Set(
          getEffectiveMandatoryPipelineBlockIds(undefined)
        );
        setDrawerLayout(
          applyPipelineGlobalBlockPolicy(normalized, {
            disabled: new Set(),
            nonHideable,
          })
        );
      }
      skipDrawerLayoutPersistRef.current = true;
    } finally {
      setDrawerLayoutResetting(false);
    }
  }, [
    id,
    detail?.pipeline,
    settings.pipelineDrawerTemplate,
    resetFileDrawerLayoutToTemplate,
    preferencesAccountId,
  ]);

  const applyFileCollapseExpand = useCallback(
    async (mode: "collapse" | "expand") => {
      const pipe = detail?.pipeline;
      if (!pipe) return;

      startTransition(() => {
        setDrawerLayout((prev) => {
          const visible = getActivePipelineBlockIdsForFile({
            layout: prev,
            visibilitySignals: drawerVisibilitySignalsRef.current,
          });
          if (mode === "collapse") {
            const collapseDrawer = Object.fromEntries(
              visible.map((sid) => [sid, false] as const),
            ) as Partial<Record<PipelineDrawerSectionId, boolean>>;
            return {
              ...prev,
              expanded: {
                ...prev.expanded,
                ...collapseDrawer,
                dealMessages: false,
                email: false,
                documents: false,
              },
            };
          }
          const expandDrawer = Object.fromEntries(
            visible.map((sid) => [sid, true] as const),
          ) as Partial<Record<PipelineDrawerSectionId, boolean>>;
          return {
            ...prev,
            expanded: {
              ...prev.expanded,
              ...expandDrawer,
              dealMessages: true,
              email: true,
              documents: true,
            },
          };
        });
      });

      if (!process.env.NEXT_PUBLIC_CONVEX_URL) return;

      const dealBacked = isDealBackedPipelineRow({
        dealData: pipe.dealData,
        intakeSheetId: pipe.intakeSheetId,
      });
      const sheet = (
        embeddedDealPayloadIsSubstantive(pipe.dealData)
          ? pipe.dealData
          : intakeForLicense
      ) as Record<string, unknown> | null | undefined;

      if (!sheet || typeof sheet !== "object") return;

      const ws = parseDealWorkspaceLayoutFromUnknown(sheet.dealWorkspaceLayout);
      const an = parseDealAnalysisLayoutFromUnknown(sheet.dealAnalysisLayout);

      const wsNext: DealWorkspaceLayoutV1 =
        mode === "collapse"
          ? {
              ...ws,
              expanded: Object.fromEntries(
                DEFAULT_DEAL_WORKSPACE_TAB_ORDER.map((id) => [id, false] as const)
              ) as DealWorkspaceLayoutV1["expanded"],
            }
          : {
              ...ws,
              expanded: Object.fromEntries(
                DEFAULT_DEAL_WORKSPACE_TAB_ORDER.map((id) => [id, true] as const)
              ) as DealWorkspaceLayoutV1["expanded"],
            };

      const anNext: DealAnalysisLayoutV1 =
        mode === "collapse"
          ? {
              ...an,
              expanded: Object.fromEntries(
                DEFAULT_DEAL_ANALYSIS_ORDER.map((id) => [id, false] as const)
              ) as DealAnalysisLayoutV1["expanded"],
            }
          : {
              ...an,
              expanded: Object.fromEntries(
                DEFAULT_DEAL_ANALYSIS_ORDER.map((id) => [id, true] as const)
              ) as DealAnalysisLayoutV1["expanded"],
            };

      setFileSectionBulkBusy(true);
      try {
        if (dealBacked) {
          await runPatchDeal({
            fileId: pipe._id,
            changes: {
              dealWorkspaceLayout: wsNext as never,
              dealAnalysisLayout: anNext as never,
            },
          });
        }
      } finally {
        setFileSectionBulkBusy(false);
      }
    },
    [detail, intakeForLicense, runPatchDeal]
  );
  const addLenderToConsiderationMut = useMutation(
    api.pipeline.addLenderToConsideration,
  );
  const setLenderBoardRoleMut = useMutation(api.pipeline.setLenderBoardRole);
  const removeLenderFromFileMut = useMutation(api.pipeline.removeLenderFromFile);
  const rejectLenderLink = useMutation(api.fileLenders.rejectLenderLink);
  const restoreLenderLink = useMutation(api.fileLenders.restoreLenderLink);
  const clearOtherLenders = useMutation(api.pipeline.clearOtherLenders);
  const removePipeline = useMutation(api.pipeline.remove);
  const leaveShareMut = useMutation(api.pipelineFileShares.leaveShare);
  const archivePipeline = useMutation(api.pipeline.archive);
  const unarchivePipeline = useMutation(api.pipeline.unarchive);
  const snoozePipeline = useMutation(api.pipeline.snooze);
  const unsnoozePipeline = useMutation(api.pipeline.unsnooze);
  const setAutoArchiveOnInactivity = useMutation(
    api.pipeline.setAutoArchiveOnInactivity,
  );
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeError, setSnoozeError] = useState<string | null>(null);
  const [autoArchiving, setAutoArchiving] = useState(false);
  const [autoArchiveError, setAutoArchiveError] = useState<string | null>(
    null,
  );

  const intakeSheetIdForLicense = detail?.pipeline?.intakeSheetId;
  const licenseDisplay = useMemo(
    () =>
      buildLicenseDisplay({
        pipeline: detail?.pipeline ?? null,
        intakeForLicense: intakeForLicense ?? null,
        intakeLoading:
          Boolean(intakeSheetIdForLicense) && intakeForLicense === undefined,
      }),
    [detail?.pipeline, intakeForLicense, intakeSheetIdForLicense],
  );

  const dealSheetForMetrics = useMemo(
    () =>
      buildDealSheetForMetrics({
        pipeline: detail?.pipeline ?? null,
        intakeForLicense: intakeForLicense ?? null,
      }),
    [detail?.pipeline, intakeForLicense],
  );

  const metricsCtx = useMemo(() => {
    const pipe = detail?.pipeline;
    if (!pipe) return null;
    return buildPipelineDrawerMetricsContext({
      pipeline: pipe,
      termOptions: termOptions.map(
        (r): TermOptionRowLite => ({
          rate: r.rate,
          term: r.term,
          prepaymentPenalty: r.prepaymentPenalty,
          notes: r.notes,
        })
      ),
      licenseLo: licenseDisplay.lo,
      licenseBroker: licenseDisplay.broker,
      linkedTasks: linkedTasks ?? [],
      associatedContactLinkCount: associatedContactLinks?.length ?? 0,
      dealSheet: dealSheetForMetrics,
    });
  }, [
    detail?.pipeline,
    termOptions,
    licenseDisplay.lo,
    licenseDisplay.broker,
    linkedTasks,
    associatedContactLinks,
    dealSheetForMetrics,
  ]);

  const primaryBorrowerContactId = useMemo(
    () => resolvePrimaryBorrowerContactId(associatedContactLinks),
    [associatedContactLinks],
  );

  const prefsFromAccount = accountId.length > 0 && prefsServerReady;
  const effectiveCollapseBehavior = useMemo((): UserPreferencesCollapseBehavior => {
    if (!prefsFromAccount) {
      return collapseBehaviorFromDeviceFileSectionMode(
        settings.fileSectionDefaultMode,
      );
    }
    return preferences.collapseBehavior;
  }, [
    prefsFromAccount,
    preferences.collapseBehavior,
    settings.fileSectionDefaultMode,
  ]);

  const onCollapseBehaviorChange = useCallback(
    async (behavior: UserPreferencesCollapseBehavior) => {
      if (prefsFromAccount) {
        void updatePreferences({ collapseBehavior: behavior });
      } else {
        updateUserSettings({
          fileSectionDefaultMode:
            fileSectionDefaultModeFromCollapseBehavior(behavior),
        });
      }
      if (!metricsCtx) return;
      const expandUx = readPipelineFileExpandUxRules(
        prefsFromAccount ? preferences.behaviorSettings : undefined,
      );
      const actionHints = buildPipelineFileExpandActionHints(metricsCtx);
      setDrawerLayout((prev) => {
        const visible = getActivePipelineBlockIdsForFile({
          layout: prev,
          visibilitySignals: drawerVisibilitySignalsRef.current,
        });
        const next = drawerExpandedMapForCollapseBehavior(
          behavior,
          visible,
          metricsCtx,
        );
        const headers = headerSectionsExpandedForCollapseBehavior(behavior);
        let expanded: Partial<Record<PipelineFileSectionId, boolean>> = {
          ...prev.expanded,
          ...next,
          ...headers,
        };
        expanded = applyPipelineFileExpandUxToExpanded(expanded, expandUx, {
          visibleBlockIds: visible,
          metricsCtx,
          actionHints,
        });
        return {
          ...prev,
          expanded,
        };
      });
    },
    [
      prefsFromAccount,
      updatePreferences,
      updateUserSettings,
      metricsCtx,
      preferences.behaviorSettings,
    ],
  );

  const drawerSectionBadge = useCallback(
    (sid: PipelineDrawerSectionId) => {
      if (!metricsCtx) return 0;
      return pipelineDrawerSectionFieldCount(sid, metricsCtx);
    },
    [metricsCtx]
  );

  const commitLoNmls = useCallback(
    async (next: string) => {
      const pipe = detail?.pipeline;
      if (!pipe) return;
      const trimmed = next.trim();
      if (
        isDealBackedPipelineRow({
          dealData: pipe.dealData,
          intakeSheetId: pipe.intakeSheetId,
        })
      ) {
        await runPatchDeal({
          fileId: pipe._id,
          changes: { cover: { loNmls: trimmed || undefined } },
        });
      } else {
        await runPatchPipeline({
          id: pipe._id,
          loNmls: trimmed === "" ? null : trimmed,
        });
      }
    },
    [detail?.pipeline, runPatchDeal, runPatchPipeline]
  );

  const commitBrokerNmls = useCallback(
    async (next: string) => {
      const pipe = detail?.pipeline;
      if (!pipe) return;
      const trimmed = next.trim();
      if (
        isDealBackedPipelineRow({
          dealData: pipe.dealData,
          intakeSheetId: pipe.intakeSheetId,
        })
      ) {
        await runPatchDeal({
          fileId: pipe._id,
          changes: { cover: { brokerNmls: trimmed || undefined } },
        });
      } else {
        await runPatchPipeline({
          id: pipe._id,
          brokerNmls: trimmed === "" ? null : trimmed,
        });
      }
    },
    [detail?.pipeline, runPatchDeal, runPatchPipeline]
  );
  const createTask = useMutation(api.tasks.create);
  const patchTask = useMutation(api.tasks.patch);
  const runPatchTask = useCallback(
    async (
      taskRow: { _id: Id<"tasks">; updatedAt: number },
      patch: PipelineDrawerTaskPatchFields,
    ) => {
      if (!orgConvexArgs) return;
      const payload = {
        ...patch,
        id: taskRow._id,
        expectedUpdatedAt: taskRow.updatedAt,
        ...orgConvexArgs,
        ...(convexMemberKey ? { actorUserKey: convexMemberKey } : {}),
      } as Parameters<typeof patchTask>[0];
      if (canUseHub) {
        return patchTask(payload);
      }
      await offline.enqueue({
        kind: "tasks.patch",
        queueKey: `tasks.patch::${taskRow._id}`,
        args: { ...(payload as Record<string, unknown>) },
      });
    },
    [canUseHub, offline, patchTask, orgConvexArgs, convexMemberKey],
  );
  const completeTask = useMutation(api.tasks.complete);
  const removeTask = useMutation(api.tasks.remove);

  // Reset transient state when switching files.
  useEffect(() => {
    setAttachError(null);
    setExportCopied(null);
    setOpenTaskId(null);
    setConfirmClear(null);
    setArchiveError(null);
    setSnoozeError(null);
  }, [id]);

  // Hydrate Generate Terms only when termOptions payload changes — not on every
  // unrelated `updatedAt` bump (File Details edits), which caused write storms.
  const termOptionsHydrateKey = useMemo(
    () => JSON.stringify(detail?.pipeline?.termOptions ?? null),
    [detail?.pipeline?.termOptions],
  );
  useEffect(() => {
    if (!detail?.pipeline) return;
    const next = (detail.pipeline.termOptions ?? []).map((o) => ({
      key: newRowKey(),
      rate: o.rate,
      term: o.term,
      prepaymentPenalty: o.prepaymentPenalty,
      notes: o.notes,
      appraisalRequired: o.appraisalRequired ?? true,
      newLoanAmount: o.newLoanAmount ?? "",
      fundingTimeframe: o.fundingTimeframe ?? "",
      qualifyingIncomeType: o.qualifyingIncomeType ?? "",
      includeQualifyingIncomeAmount: o.includeQualifyingIncomeAmount ?? true,
      qualifyingIncomeAmount: o.qualifyingIncomeAmount ?? "",
    }));
    setTermOptions(next);
    lastSyncedTerms.current = next.map((r) => ({
      rate: r.rate,
      term: r.term,
      prepaymentPenalty: r.prepaymentPenalty,
      notes: r.notes,
      appraisalRequired: r.appraisalRequired,
      newLoanAmount: r.newLoanAmount,
      fundingTimeframe: r.fundingTimeframe,
      qualifyingIncomeType: r.qualifyingIncomeType,
      includeQualifyingIncomeAmount: r.includeQualifyingIncomeAmount,
      qualifyingIncomeAmount: r.qualifyingIncomeAmount,
    }));
  }, [detail?.pipeline?._id, termOptionsHydrateKey]); // eslint-disable-line react-hooks/exhaustive-deps -- hydrate from key, not object identity

  // Debounced persist for term options.
  useEffect(() => {
    if (!detail?.pipeline) return;
    const stripped = termOptions.map((r) => ({
      rate: r.rate,
      term: r.term,
      prepaymentPenalty: r.prepaymentPenalty,
      notes: r.notes,
      appraisalRequired: r.appraisalRequired,
      newLoanAmount: r.newLoanAmount,
      fundingTimeframe: r.fundingTimeframe,
      qualifyingIncomeType: r.qualifyingIncomeType,
      includeQualifyingIncomeAmount: r.includeQualifyingIncomeAmount,
      qualifyingIncomeAmount: r.includeQualifyingIncomeAmount
        ? r.qualifyingIncomeAmount
        : "",
    }));
    if (termsEqual(stripped, lastSyncedTerms.current)) return;
    const fileId = detail.pipeline._id;
    const handle = window.setTimeout(() => {
      runPatchPipelineRef
        .current({ id: fileId, termOptions: stripped })
        .then(() => {
          lastSyncedTerms.current = stripped;
        })
        .catch(() => {
          /* errors are surfaced when the user retries an explicit edit */
        });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [termOptions, detail?.pipeline?._id]); // eslint-disable-line react-hooks/exhaustive-deps -- ref for patch; avoid callback-identity loops

  const dealCommitRow = useMemo(
    () =>
      detail?.pipeline != null
        ? buildDealCommitRow(detail.pipeline, intakeForLicense)
        : null,
    [detail?.pipeline, intakeForLicense],
  );

  const fileDetailsLoanAmount = useMemo(() => {
    const pipe = detail?.pipeline;
    if (!pipe) return 0;
    return resolvePipelineTableFundingAmount(dealSheetForMetrics ?? null, pipe);
  }, [detail?.pipeline, dealSheetForMetrics]);

  const dealBackedForBus = useMemo(
    () =>
      Boolean(
        detail?.pipeline &&
          isDealBackedPipelineRow({
            dealData: detail.pipeline.dealData,
            intakeSheetId: detail.pipeline.intakeSheetId,
          })
      ),
    [detail?.pipeline]
  );

  const blockSyncBehavior = useMemo(
    () => parseBlockSyncBehavior(preferences.behaviorSettings),
    [preferences.behaviorSettings],
  );

  const blockBus = useBlockData(id, "fileDetails", {
    dealBacked: dealBackedForBus,
    tableFundingAmount: fileDetailsLoanAmount,
    blockSyncBehavior,
    preferencesAccountId,
  });
  const fileDetailsBusFund = blockBus.resolved?.fields.fundingAmount;
  const fileDetailsBusRate = blockBus.resolved?.fields.interestRate;

  const fundingFieldSync = blockBus.getFieldSync("fundingAmount");
  const rateFieldSync = blockBus.getFieldSync("interestRate");

  const fileDetailsIntelligentAlerts = useMemo((): IntelligentAlert[] => {
    const pipe = detail?.pipeline;
    if (!pipe) return [];
    const pipelineFunding =
      typeof pipe.fundingAmount === "number" && Number.isFinite(pipe.fundingAmount)
        ? pipe.fundingAmount
        : 0;
    const mirror = buildPipelineFundingMirrorAlerts({
      dealBacked: dealBackedForBus,
      pipelineFunding,
      resolvedFromDeal: fileDetailsLoanAmount,
    });
    const sheet = dealSheetForMetrics;
    let consistency: IntelligentAlert[] = [];
    if (sheet) {
      const cover = sheet.cover ?? {};
      consistency = buildCoverScenarioFundingAlerts({
        coverFunding: toNumber(
          (cover as Record<string, unknown>).fundingAmount as
            | string
            | number
            | null
            | undefined,
        ),
        scenarioProposed: toNumber(
          sheet.scenario?.proposedLoanAmount as
            | string
            | number
            | null
            | undefined,
        ),
      });
    }
    const seen = new Set<string>();
    const out: IntelligentAlert[] = [];
    for (const a of [...mirror, ...consistency]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [
    detail?.pipeline,
    dealBackedForBus,
    fileDetailsLoanAmount,
    dealSheetForMetrics,
  ]);

  const fundingSyncSource: FieldSyncSource = !fileDetailsBusFund
    ? "shared"
    : blockBus.localMask.fundingAmount
      ? "local"
      : fileDetailsBusFund.source;
  const rateSyncSource: FieldSyncSource = !fileDetailsBusRate
    ? "shared"
    : blockBus.localMask.interestRate
      ? "local"
      : fileDetailsBusRate.source;

  const globalUiIndicator = useMemo(
    () => parseUiDisplayColors(preferences.displaySettings).indicatorColor ?? null,
    [preferences.displaySettings],
  );

  const statusOptions = useMemo(
    () =>
      getPipelineStatusSelectOptions(
        settings.pipelineStageStyles,
        globalUiIndicator,
      ),
    [settings.pipelineStageStyles, globalUiIndicator],
  );

  const jumpToDrawerSection = useCallback((sid: PipelineDrawerSectionId) => {
    const tab = tabForDrawerBlock(sid);
    if (tab) {
      setWorkspaceActiveTab(tab);
    }
    // Unhide first so anchor-routed modular blocks (construction budget,
    // investor experience, PFS) mount before we scroll to them.
    startTransition(() => {
      setDrawerLayout((prev) =>
        prev.hidden.includes(sid)
          ? {
              ...prev,
              hidden: prev.hidden.filter((x) => x !== sid),
              expanded: { ...prev.expanded, [sid]: true },
            }
          : prev,
      );
    });
    if (isLegacyFileAdminDrawerBlockHidden(sid as PipelineBlockId)) {
      const settingsAnchor = settingsAnchorForDrawerBlock(sid);
      if (settingsAnchor) {
        const scrollToSettings = (behavior: ScrollBehavior) => {
          scrollToPipelineWorkspaceAnchor(settingsAnchor, behavior);
        };
        requestAnimationFrame(() => {
          requestAnimationFrame(() => scrollToSettings("auto"));
        });
        window.setTimeout(() => scrollToSettings("auto"), 320);
      }
      return;
    }
    const dealInfoAnchor = dealInfoAnchorForDrawerBlock(sid);
    if (dealInfoAnchor) {
      const scrollToDealInfo = (behavior: ScrollBehavior) => {
        scrollToPipelineWorkspaceAnchor(dealInfoAnchor, behavior);
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToDealInfo("auto"));
      });
      window.setTimeout(() => scrollToDealInfo("auto"), 320);
      return;
    }
    const dealWorkspaceAnchor = dealWorkspaceAnchorForDrawerBlock(sid);
    if (dealWorkspaceAnchor) {
      const scrollToDealWorkspace = (behavior: ScrollBehavior) => {
        scrollToPipelineWorkspaceAnchor(dealWorkspaceAnchor, behavior);
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToDealWorkspace("auto"));
      });
      window.setTimeout(() => scrollToDealWorkspace("auto"), 320);
      return;
    }
    const overviewAnchor = overviewAnchorForDrawerBlock(sid);
    if (
      overviewAnchor &&
      isLegacyOverviewDrawerBlockHidden(sid as PipelineBlockId)
    ) {
      const scrollToOverview = (behavior: ScrollBehavior) => {
        scrollToPipelineWorkspaceAnchor(overviewAnchor, behavior);
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToOverview("auto"));
      });
      window.setTimeout(() => scrollToOverview("auto"), 320);
      return;
    }
    startTransition(() => {
      setDrawerLayout((prev) => ({
        ...prev,
        hidden: prev.hidden.filter((x) => x !== sid),
        expanded: { ...prev.expanded, [sid]: true },
      }));
    });
    const elId = pipelineDrawerSectionDomId(sid);
    const anchorId = scrollTargetForDrawerBlock(sid, elId);
    const scrollToSection = (behavior: ScrollBehavior) => {
      scrollToPipelineWorkspaceAnchor(anchorId, behavior);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToSection("auto"));
    });
    window.setTimeout(() => scrollToSection("auto"), 320);
  }, []);

  const openDealInfoSection = useCallback((anchorId: string) => {
    setWorkspaceActiveTab("dealInfo");
    const scrollToSection = () =>
      scrollToPipelineWorkspaceAnchor(anchorId, "auto");
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToSection);
    });
    window.setTimeout(scrollToSection, 320);
  }, []);

  /**
   * Favorites quick-access — standalone-capable blocks open in window-in-window
   * (same FloatingBlockWindow host as CollapsibleBlock detach). Others request
   * detach on their layout CollapsibleBlock after the parent tab mounts, or
   * deep-link via `jumpToDrawerSection`. Overlays never steal workspace scroll.
   */
  const prepareFavoriteBlock = useCallback((blockId: PipelineBlockId) => {
    // Always unhide so older files gain the block in-layout when opened from favorites.
    startTransition(() => {
      setDrawerLayout((prev) => unhideDrawerBlockInLayout(prev, blockId));
    });
  }, []);

  const ensureFavoriteBlockMounted = useCallback((blockId: PipelineBlockId) => {
    const tab = tabForDrawerBlock(blockId);
    if (tab) {
      setWorkspaceActiveTab(tab);
    }
    startTransition(() => {
      setDrawerLayout((prev) => ({
        ...prev,
        hidden: prev.hidden.filter((x) => x !== blockId),
        expanded: { ...prev.expanded, [blockId]: true },
      }));
    });
  }, []);

  const toggleFavoriteBlock = useCallback(
    (blockId: PipelineBlockId) => {
      const current = preferences.favoriteFileBlocks;
      const next = current.includes(blockId)
        ? current.filter((x) => x !== blockId)
        : [...current, blockId];
      void updatePreferences({ favoriteFileBlocks: next });
    },
    [preferences.favoriteFileBlocks, updatePreferences],
  );

  const openDocumentsVault = useCallback(
    (focus?: Omit<DocumentVaultNavigationFocus, "nonce">) => {
      if (focus) {
        setDocumentsVaultFocus(createDocumentVaultNavigationFocus(focus));
      }
      setWorkspaceActiveTab("documents");
      const anchorId = DOCUMENTS_TAB_SECTION_IDS.vault;
      const scrollToSection = () =>
        scrollToPipelineWorkspaceAnchor(anchorId, "auto");
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToSection);
      });
      window.setTimeout(scrollToSection, 320);
    },
    [],
  );

  const clearDocumentsVaultFocus = useCallback(() => {
    setDocumentsVaultFocus(null);
  }, []);

  const fileInsightsSnapshot = useMemo(() => {
    const pipe = detail?.pipeline;
    if (!pipe) return null;
    const st = getPipelineStatusInfo(pipe.status);
    const chosen = pipe.selectedLenderId
      ? (detail?.lenders ?? []).find((l) => l._id === pipe.selectedLenderId)
          ?.company ?? "—"
      : "None chosen";
    return buildPipelineFileInsights({
      pipeline: pipe,
      dealSheet: dealSheetForMetrics,
      resolvedFunding: fileDetailsLoanAmount,
      associatedContactLinkCount: associatedContactLinks?.length ?? 0,
      drawerLayout,
      visibilitySignals: drawerVisibilitySignals,
      focusedFieldPaths: focusedDealFieldPaths,
      topExpandedBlocks: getTopExpandedPipelineDrawerBlocks(),
      stageLabel: st.label,
      chosenLenderLabel: chosen,
      workflowRules: workflowRulesForIntelligence,
    });
  }, [detail?.pipeline, detail?.lenders, dealSheetForMetrics, fileDetailsLoanAmount, associatedContactLinks?.length, drawerLayout, drawerVisibilitySignals, focusedDealFieldPaths, workflowRulesForIntelligence]);

  const documentCreatorTokenContext = useMemo(() => {
    const pipe = detail?.pipeline;
    const chosen =
      pipe?.selectedLenderId != null
        ? (detail?.lenders ?? []).find((l) => l._id === pipe.selectedLenderId)
            ?.company ?? "—"
        : "None chosen";
    const rateDisplay = (() => {
      const busRaw = fileDetailsBusRate?.display;
      const busNum =
        typeof busRaw === "number"
          ? busRaw
          : busRaw == null
            ? NaN
            : Number(String(busRaw).replace(/[%\s,]/g, ""));
      if (Number.isFinite(busNum) && busNum > 0) return fmtRate(busNum);
      if (pipe) {
        const shared = normalizeFileSharedStateFromPipeline(
          pipe as unknown as PipelineFileSharedSource,
        );
        if (shared.interestRate > 0) return fmtRate(shared.interestRate);
      }
      const first = termOptions[0]?.rate?.trim();
      return first ? (first.includes("%") ? first : `${first}%`) : "";
    })();
    return buildDocumentCreatorTokenContext({
      pipeline: pipe ?? null,
      dealSheet: dealSheetForMetrics,
      dealPackageLabel: pipe?.fileName?.trim() || "Deal Package",
      resolvedFunding: fileDetailsLoanAmount,
      interestRateDisplay: rateDisplay,
      stageLabel: pipe ? getPipelineStatusInfo(pipe.status).label : undefined,
      chosenLenderLabel: chosen,
    });
  }, [
    detail?.pipeline,
    detail?.lenders,
    dealSheetForMetrics,
    fileDetailsLoanAmount,
    fileDetailsBusRate?.display,
    termOptions,
  ]);

  const fileRevenueTotals = useMemo(() => {
    const pipe = detail?.pipeline;
    if (!pipe) return null;
    return revenueTotalsFromPipelineRow(
      pipe as unknown as PipelineFileSharedSource,
    );
  }, [detail?.pipeline]);

  /** Workspace sheet: full-page scroll on file route; embedded blocks grow with AppChrome main. */
  const workspaceRootClass = embedded
    ? "flex w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background text-[color:var(--ui-body-text)]"
    : "flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-background text-[color:var(--ui-body-text)]";
  const workspaceBodyClass = embedded
    ? "flex w-full min-w-0 flex-col overflow-x-clip pb-2"
    /* File route: no outer bottom safe-area — that left a dead white band under the
       fixed bottom nav. Clearance lives in `[data-pipeline-workspace-scroll]` spacer. */
    : "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip pb-0";
  const presenceModel = useMemo(() => {
    const fieldEditing = focusedDealFieldPaths.length > 0;
    if (openTaskId) {
      return {
        status: fieldEditing
          ? ("editing_file" as const)
          : ("viewing_file" as const),
        workspaceSurface: "tasks_panel" as const,
        surfaceKey: String(openTaskId),
        observationOnly: false as const,
      };
    }
    return {
      status: fieldEditing ? ("editing_file" as const) : ("viewing_file" as const),
      workspaceSurface: "pipeline_drawer" as const,
      surfaceKey: fieldEditing ? focusedDealFieldPaths[0] : undefined,
      observationOnly: !fieldEditing,
    };
  }, [focusedDealFieldPaths.length, focusedDealFieldPaths[0], openTaskId]);

  usePresence({
    organizationId: activeOrganizationId ?? undefined,
    memberUserKey: convexMemberKey,
    status: detail != null ? presenceModel.status : "online",
    pipelineFileId: detail != null ? id : undefined,
    workspaceSurface: detail != null ? presenceModel.workspaceSurface : undefined,
    surfaceKey: detail != null ? presenceModel.surfaceKey : undefined,
    observationOnly: detail != null ? presenceModel.observationOnly : undefined,
  });

  const globalBannerSwitchRow = useMemo(
    () => pipelineSwitcherRows.find((r) => r._id === id),
    [pipelineSwitcherRows, id],
  );

  const {
    crumbs: workspaceHierarchyCrumbs,
    hubBackHref: workspaceHubBackHref,
    hubBackLabel: workspaceHubBackLabel,
    clientHubHref: workspaceClientHubHref,
    projectHref: workspaceProjectHref,
    projectLabel: workspaceProjectLabel,
    hasProject: workspaceHasProject,
  } = useWorkspaceHierarchyCrumbs({
    fileId: detail?.pipeline?._id,
    row: globalBannerSwitchRow,
    searchParams,
    organizationId: activeOrganizationId ?? undefined,
    memberUserKey: convexMemberKey,
    focusFileId: id,
  });

  const projectSiblingFiles = useMemo(() => {
    const projectId =
      detail?.pipeline?.projectId != null
        ? String(detail.pipeline.projectId)
        : globalBannerSwitchRow?.projectId != null
          ? String(globalBannerSwitchRow.projectId)
          : null;
    return buildProjectSiblingFileRows(pipelineSwitcherRows, projectId);
  }, [
    detail?.pipeline?.projectId,
    globalBannerSwitchRow?.projectId,
    pipelineSwitcherRows,
  ]);

  /** Hierarchy trail terminates at the active tab: … > [File] > [Active Tab]. */
  const workspaceCrumbsWithTab = useMemo(() => {
    if (workspaceHierarchyCrumbs.length === 0) return workspaceHierarchyCrumbs;
    const tabLabel =
      workspaceActiveTab === "settings"
        ? "Settings"
        : FILE_WORKSPACE_TAB_LABELS[navHighlightTabFor(workspaceActiveTab)];
    return [...workspaceHierarchyCrumbs, { label: tabLabel }];
  }, [workspaceHierarchyCrumbs, workspaceActiveTab]);

  const globalBannerPipelineData = useMemo(() => {
    const pipelineRow = detail?.pipeline;
    if (!pipelineRow) return null;
    const accessUx = resourceAccessFromViewerAccess(detail.viewerAccess);
    const canMutate =
      detail.viewerAccess?.canMutate ?? detail.canMutateFile === true;
    const fallbackClientDisplayName =
      globalBannerSwitchRow?.clientDisplayName?.trim() || "";
    const entityDisplayName = resolveEntityDisplayNameForClientTitle({
      linkedClients: globalBannerSwitchRow?.linkedClients,
      clientRecordLabel: fallbackClientDisplayName,
      clientRecordEntityType: null,
      dealBusiness: dealSheetForMetrics?.business,
    });
    const { label: clientDisplayName } = resolveFileHeaderPrimaryBorrowerLabel({
      links: associatedContactLinks,
      contactsById: workspaceContactById,
      dealBorrowers: dealSheetForMetrics?.borrowers,
      entityDisplayName,
      fallbackClientDisplayName,
    });
    const primaryContactHref = primaryBorrowerContactId
      ? `/contacts/${primaryBorrowerContactId}`
      : null;
    return {
      fileName: pipelineRow.fileName ?? "",
      clientDisplayName,
      clientHref: primaryContactHref ?? workspaceClientHubHref,
      fundingAmount: fileDetailsLoanAmount,
      fundingDisplay: fileDetailsBusFund?.display,
      stageId: pipelineRow.stageId,
      subStageId: pipelineRow.subStageId,
      status: pipelineRow.status,
      archivedAt: pipelineRow.archivedAt,
      dealCommitRow,
      dealBacked: dealBackedForBus,
      readOnly: accessUx.readOnly,
      canMutate,
    };
  }, [
    detail,
    globalBannerSwitchRow,
    workspaceClientHubHref,
    fileDetailsLoanAmount,
    fileDetailsBusFund?.display,
    dealCommitRow,
    dealBackedForBus,
    associatedContactLinks,
    workspaceContactById,
    dealSheetForMetrics?.business,
    dealSheetForMetrics?.borrowers,
    primaryBorrowerContactId,
  ]);

  if (detail === undefined) {
    return (
      <PipelineWorkspaceSection
        htmlId="pipeline-ws-file-root"
        sectionId="pipeline-file-workspace"
        sectionType="workspace-root"
        sectionLabel="Pipeline file workspace"
        className={workspaceRootClass}
        contentClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div data-testid="pipeline-drawer-scroll" className={workspaceBodyClass}>
          <PipelineWorkspaceSection
            htmlId="pipeline-ws-file-loading"
            sectionId="pipeline-file-loading"
            sectionType="status"
            sectionLabel="Loading pipeline file"
          >
            <WorkspaceContentContainer className="py-6">
              <div
                className="min-h-[min(55dvh,24rem)] space-y-4"
                aria-busy="true"
              >
                <div className="h-9 w-2/3 max-w-sm animate-pulse rounded-lg bg-muted/55" />
                <div className="space-y-3 rounded-xl border border-border/50 bg-muted/15 p-4">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted/45" />
                  <div className="h-28 animate-pulse rounded-lg bg-muted/35" />
                  <div className="h-28 animate-pulse rounded-lg bg-muted/35" />
                </div>
                <span className="sr-only" role="status">
                  Loading pipeline file
                </span>
              </div>
            </WorkspaceContentContainer>
          </PipelineWorkspaceSection>
        </div>
      </PipelineWorkspaceSection>
    );
  }

  if (detail === null) {
    return (
      <PipelineWorkspaceSection
        htmlId="pipeline-ws-file-root"
        sectionId="pipeline-file-workspace"
        sectionType="workspace-root"
        sectionLabel="Pipeline file workspace"
        className={workspaceRootClass}
        contentClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div data-testid="pipeline-drawer-scroll" className={workspaceBodyClass}>
          <PipelineWorkspaceSection
            htmlId="pipeline-ws-file-not-found"
            sectionId="pipeline-file-not-found"
            sectionType="status"
            sectionLabel="Pipeline file not found"
          >
            <WorkspaceContentContainer className="py-10">
              <p className="text-sm text-destructive">Pipeline file not found.</p>
              <Button variant="ghost" className="mt-2" onClick={goToPipelineHub}>
                Close
              </Button>
            </WorkspaceContentContainer>
          </PipelineWorkspaceSection>
        </div>
      </PipelineWorkspaceSection>
    );
  }

  const p = detail.pipeline;
  const resourceAccessUx = resourceAccessFromViewerAccess(detail.viewerAccess);
  const readOnly = resourceAccessUx.readOnly;
  const canMutateWorkspaceFile =
    detail.viewerAccess?.canMutate ?? detail.canMutateFile === true;

  const commitClientMomentum = async (next: number | null) => {
    if (readOnly) return;
    const expectedUpdatedAt = p.updatedAt;
    const payload = {
      id: p._id,
      clientMomentum: next,
      ...(preferencesAccountId ? { preferencesAccountId } : {}),
      ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    };
    if (canUseHub) {
      await setClientMomentumMut(payload);
      return;
    }
    await offline.enqueue({
      kind: "pipeline.setClientMomentum",
      queueKey: `pipeline.setClientMomentum::${p._id}`,
      args: { ...(payload as Record<string, unknown>) },
    });
  };
  const isSnoozed = isCurrentlySnoozed(p.snoozedUntil);
  const snoozeUntilMs = snoozedUntilToMs(p.snoozedUntil);
  /** Calendar value for the date picker: only when snooze is still active. */
  const snoozePickerValue =
    isSnoozed && snoozeUntilMs != null ? snoozeUntilMs : null;
  const hasSnoozeStored = p.snoozedUntil != null;

  // Surface primary lender first in legacy flat lists (insights, suggestions).
  const sortedLenderRows = [
    ...(primaryLender ? [primaryLender] : []),
    ...secondaryLenders,
    ...consideringLenders,
  ];
  const statusInfo = getPipelineStatusInfo(p.status);
  const sharedNorm = normalizeFileSharedStateFromPipeline(
    p as unknown as PipelineFileSharedSource,
  );
  const dealCommandCenterRateDisplay = (() => {
    const busRaw = fileDetailsBusRate?.display;
    const busNum =
      typeof busRaw === "number"
        ? busRaw
        : busRaw == null
          ? NaN
          : Number(String(busRaw).replace(/[%\s,]/g, ""));
    const fromBus =
      Number.isFinite(busNum) && busNum > 0 ? busNum : null;
    const fromShared =
      sharedNorm.interestRate > 0 ? sharedNorm.interestRate : null;
    const n = fromBus ?? fromShared;
    if (n != null) return fmtRate(n);
    const first = termOptions[0]?.rate?.trim();
    return first ? (first.includes("%") ? first : `${first}%`) : "";
  })();
  const dealCommandCenterTermDisplay =
    sharedNorm.term.trim() ||
    (typeof p.term === "string" ? p.term.trim() : "") ||
    termOptions[0]?.term?.trim() ||
    "";
  const termSheetBullets = formatTermOptionsBulletTermSheet(termOptions);
  const termSheetEmail = formatTermOptionsEmail(termOptions, p.fileName);

  const patchField = async (
    fields: Parameters<typeof runPatchPipeline>[0]
  ): Promise<void> => {
    if (readOnly) return;
    await runPatchPipeline(fields);
  };

  async function copyTermExport(text: string, kind: "bullets" | "email") {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setExportCopied(kind);
      window.setTimeout(
        () => setExportCopied((c) => (c === kind ? null : c)),
        2000
      );
    } catch {
      setExportCopied(null);
    }
  }

  async function onAddToConsideration(payload: {
    lenderId: Id<"lenders">;
    hit: Doc<"lenders">;
  }) {
    if (readOnly) return;
    setAttachError(null);
    setOptimisticConsideringIds((prev) => {
      const next = new Set(prev);
      next.add(payload.lenderId);
      return next;
    });
    setOptimisticLenderDocs((prev) => {
      const next = new Map(prev);
      next.set(payload.lenderId, payload.hit);
      return next;
    });
    try {
      await addLenderToConsiderationMut({
        fileId: p._id,
        lenderId: payload.lenderId,
        preferencesAccountId: accountId || undefined,
      });
    } catch (e) {
      setOptimisticConsideringIds((prev) => {
        if (!prev.has(payload.lenderId)) return prev;
        const next = new Set(prev);
        next.delete(payload.lenderId);
        return next;
      });
      setOptimisticLenderDocs((prev) => {
        const next = new Map(prev);
        next.delete(payload.lenderId);
        return next.size === prev.size ? prev : next;
      });
      const message = e instanceof Error ? e.message : String(e);
      setAttachError(message);
      throw e;
    }
  }

  async function onSetBoardRole(
    lenderId: Id<"lenders">,
    role: "primary" | "secondary" | "considering",
  ) {
    if (readOnly) return;
    setAttachError(null);
    setSettingBoardRoleId(lenderId);
    try {
      await setLenderBoardRoleMut({
        fileId: p._id,
        lenderId,
        role,
        preferencesAccountId: accountId || undefined,
      });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingBoardRoleId(null);
    }
  }

  async function onRemoveFromFile(lenderId: Id<"lenders">) {
    if (readOnly) return;
    setAttachError(null);
    setRemovingFromFileId(lenderId);
    try {
      await removeLenderFromFileMut({
        fileId: p._id,
        lenderId,
        preferencesAccountId: accountId || undefined,
      });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingFromFileId(null);
    }
  }

  async function onConfirmLenderRejection() {
    if (readOnly || !rejectModalLenderId) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    setAttachError(null);
    setRejecting(rejectModalLenderId);
    try {
      await rejectLenderLink({
        fileId: p._id,
        lenderId: rejectModalLenderId,
        reason,
        preferencesAccountId: preferencesAccountId,
        memberUserKey: convexMemberKey ?? preferencesAccountId,
      });
      setRejectModalLenderId(null);
      setRejectReason("");
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setRejecting(null);
    }
  }

  async function onRestoreLender(lenderId: Id<"lenders">) {
    if (readOnly) return;
    setAttachError(null);
    setRestoring(lenderId);
    try {
      await restoreLenderLink({
        fileId: p._id,
        lenderId,
        preferencesAccountId: preferencesAccountId,
        memberUserKey: convexMemberKey ?? preferencesAccountId,
      });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(null);
    }
  }

  async function onClearLenders(keep: "selected" | "none") {
    if (readOnly) return;
    setAttachError(null);
    setClearing(true);
    try {
      await clearOtherLenders({
        fileId: p._id,
        keep,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
      setConfirmClear(null);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  async function commitSplits(next: SplitRow[]) {
    await runPatchPipeline({ id: p._id, splits: next });
  }

  const openFileDeleteConfirm = () => {
    if (readOnly) return;
    const addr = dealCommitRow
      ? subjectAddressEditorValue(dealCommitRow)?.trim()
      : "";

    void confirm({
      variant: "delete",
      title: "Delete loan file",
      entityName: p.fileName,
      impact:
        "This permanently removes the file and its workspace configuration from active pipeline work.",
      preview: {
        rows: addr ? [{ label: "Subject address", value: addr }] : undefined,
      },
      cascade: [
        { text: "Exports you already downloaded are unchanged." },
        {
          text: "In-product tasks scoped to this file and active portal access may stop.",
          tone: "attention",
        },
        {
          text: "Ledger and history references may remain for audit purposes.",
        },
      ],
      testId: "pipeline-file-delete-dialog",
      onConfirm: async () => {
        traceDeleteExecution("pipeline_file_delete", "mutation_start", {
          fileId: String(p._id),
        });
        traceDeleteExecution("pipeline_file_delete", "mutation_dispatched");
        const result = await withOperationalTimeout(
          removePipeline({
            id: p._id,
            ...(preferencesAccountId ? { preferencesAccountId } : {}),
          }),
          {
            timeoutMs: 25_000,
            message:
              "Delete is taking longer than expected. Your connection may be slow — please try again.",
          },
        );

        if (!result.ok) {
          traceDeleteExecution("pipeline_file_delete", "timeout_triggered", {
            message: result.message,
          });
          throw new Error(result.message);
        }

        traceDeleteExecution("pipeline_file_delete", "mutation_resolved");
        traceDeleteExecution("pipeline_file_delete", "mutation_success");
        traceDeleteExecution("pipeline_file_delete", "overlay_dismissed");
        showOperationalToastRemoved("Loan file", p.fileName);
        traceDeleteExecution("pipeline_file_delete", "redirect_start");
        const href = goToPipelineHub();
        traceDeleteExecution("pipeline_file_delete", "redirect_completed", { href });
        window.setTimeout(() => {
          try {
            if (
              window.location.pathname.startsWith("/pipeline/") &&
              window.location.pathname.includes(encodeURIComponent(String(p._id)))
            ) {
              window.location.assign(href);
            }
          } catch {
            /* ignore */
          }
        }, 800);
      },
    });
  };

  const isSharedRecipient =
    detail?.ownership != null &&
    detail.ownership.isOwner !== true &&
    (detail.ownership.isSharedViewer === true ||
      detail.ownership.badge === "shared_view" ||
      detail.ownership.badge === "shared_edit" ||
      detail.ownership.hierarchyAccessLabel === "Explicit Loan Share");

  const openLeaveShareConfirm = () => {
    void confirm({
      variant: "delete",
      title: "Leave shared loan file",
      entityName: p.fileName,
      impact:
        "You will lose access to this file. The owner and other collaborators keep their access.",
      confirmLabel: "Leave share",
      cascade: [
        { text: "This does not delete the owner’s loan file." },
      ],
      testId: "pipeline-file-leave-share-dialog",
      onConfirm: async () => {
        const result = await withOperationalTimeout(
          leaveShareMut({
            fileId: p._id,
            ...(preferencesAccountId || convexMemberKey
              ? { memberUserKey: (convexMemberKey ?? preferencesAccountId)! }
              : {}),
          }),
          {
            timeoutMs: 25_000,
            message:
              "Leave is taking longer than expected. Your connection may be slow — please try again.",
          },
        );
        if (!result.ok) {
          throw new Error(result.message);
        }
        showOperationalToast({
          title: "Left share",
          description: `“${p.fileName}” was removed from your pipeline.`,
          variant: "success",
        });
        const href = goToPipelineHub();
        window.setTimeout(() => {
          try {
            window.location.assign(href);
          } catch {
            /* ignore */
          }
        }, 400);
      },
    });
  };

  async function toggleArchive() {
    if (readOnly) return;
    setArchiveError(null);
    setArchiving(true);
    try {
      if (p.archivedAt != null) {
        await unarchivePipeline({
          id: p._id,
          ...(preferencesAccountId ? { preferencesAccountId } : {}),
        });
      } else {
        await archivePipeline({
          id: p._id,
          ...(preferencesAccountId ? { preferencesAccountId } : {}),
        });
      }
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setArchiving(false);
    }
  }

  async function commitSnoozeEndOfLocalDay(startOfDayMs: number | null) {
    if (readOnly) return;
    setSnoozeError(null);
    if (startOfDayMs === null) {
      setSnoozing(true);
      try {
        await unsnoozePipeline({
          id: p._id,
          ...(preferencesAccountId ? { preferencesAccountId } : {}),
        });
      } catch (e) {
        setSnoozeError(e instanceof Error ? e.message : String(e));
      } finally {
        setSnoozing(false);
      }
      return;
    }
    const endMs = endOfLocalCalendarDayMs(startOfDayMs);
    if (endMs <= Date.now()) {
      setSnoozeError("Choose a future date to snooze, or clear the field.");
      return;
    }
    setSnoozing(true);
    try {
      await snoozePipeline({
        id: p._id,
        snoozedUntil: endMs,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
    } catch (e) {
      setSnoozeError(e instanceof Error ? e.message : String(e));
    } finally {
      setSnoozing(false);
    }
  }

  async function applySnoozePreset(dayOffset: number) {
    if (readOnly) return;
    setSnoozeError(null);
    const start = startOfLocalDayOffsetMs(dayOffset);
    const endMs = endOfLocalCalendarDayMs(start);
    if (endMs <= Date.now()) {
      setSnoozeError("That date is not in the future.");
      return;
    }
    setSnoozing(true);
    try {
      await snoozePipeline({
        id: p._id,
        snoozedUntil: endMs,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
    } catch (e) {
      setSnoozeError(e instanceof Error ? e.message : String(e));
    } finally {
      setSnoozing(false);
    }
  }

  async function clearSnooze() {
    setSnoozeError(null);
    setSnoozing(true);
    try {
      await unsnoozePipeline({
        id: p._id,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
    } catch (e) {
      setSnoozeError(e instanceof Error ? e.message : String(e));
    } finally {
      setSnoozing(false);
    }
  }

  async function commitAutoArchiveDays(days: number) {
    if (readOnly) return;
    setAutoArchiveError(null);
    setAutoArchiving(true);
    try {
      await setAutoArchiveOnInactivity({
        id: p._id,
        inactivityDays: days,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
    } catch (e) {
      setAutoArchiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoArchiving(false);
    }
  }

  async function clearAutoArchive() {
    if (readOnly) return;
    setAutoArchiveError(null);
    setAutoArchiving(true);
    try {
      await setAutoArchiveOnInactivity({
        id: p._id,
        inactivityDays: null,
        ...(preferencesAccountId ? { preferencesAccountId } : {}),
      });
    } catch (e) {
      setAutoArchiveError(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoArchiving(false);
    }
  }

  const legacyContactCount = p.contacts?.length ?? 0;
  const splits: SplitRow[] = p.splits ?? [];

  const overviewOrganizationId = (p.organizationId ?? activeOrganizationId) as
    | Id<"organizations">
    | undefined;

  const overviewContactsBlock = (
    <FileContactsBlockLazy
      contacts={standaloneContacts ?? []}
      links={associatedContactLinks ?? []}
      contactRoles={workspaceContactRoles}
      onLink={async (contactId, { contactRoleId, notes }) => {
        const roleLabel =
          contactRoleDisplayName(workspaceContactRoles, contactRoleId) ??
          contactRoleId;
        await upsertContactFileLink({
          contactId,
          fileId: p._id,
          role: roleLabel,
          notes,
          contactRoleId,
          ...(preferencesAccountId
            ? { memberUserKey: preferencesAccountId }
            : {}),
        });
      }}
      onCreateAndLink={async ({
        name,
        email,
        phone,
        notes,
        contactRoleId,
      }) => {
        const roleLabel =
          contactRoleDisplayName(workspaceContactRoles, contactRoleId) ??
          contactRoleId;
        const contactId = await createContact({
          name,
          ...contactMethodsCreateArgs({ email, phone }),
          notes,
          contactRoleId,
          contactRoleIds: [contactRoleId],
          ...(p.organizationId
            ? {
                organizationId: p.organizationId,
                memberUserKey: preferencesAccountId,
              }
            : {}),
        });
        await upsertContactFileLink({
          contactId,
          fileId: p._id,
          role: roleLabel,
          notes: undefined,
          contactRoleId,
          ...(preferencesAccountId
            ? { memberUserKey: preferencesAccountId }
            : {}),
        });
      }}
      onUpdateLink={async (link) => {
        const contactRoleId =
          link.contactRoleId?.trim() ??
          (() => {
            const contact = workspaceContactById.get(link.contactId);
            return contact
              ? effectiveContactRoleIdFromDoc(contact)
              : undefined;
          })();
        await upsertContactFileLink({
          contactId: link.contactId,
          fileId: p._id,
          role: link.role,
          notes: link.notes,
          contactRoleId,
          ...(preferencesAccountId
            ? { memberUserKey: preferencesAccountId }
            : {}),
        });
      }}
      onRemoveLink={async (linkId) => {
        await removeContactFileLink({
          id: linkId,
          ...(preferencesAccountId
            ? { memberUserKey: preferencesAccountId }
            : {}),
        });
      }}
      onAssignToBorrowerSlot={async (contactId, slot) => {
        await assignContactToBorrowerSlot({
          fileId: p._id,
          contactId,
          slot,
          ...(preferencesAccountId
            ? { preferencesAccountId }
            : {}),
        });
      }}
      legacyContactCount={legacyContactCount}
    />
  );

  const overviewTabProps = {
    notes: {
      organizationId: overviewOrganizationId ?? null,
      memberUserKey: convexMemberKey,
      pipelineFileId: p._id,
      blockSettings: fileNotesResolvedSettings,
    },
    contacts: { contactsBlock: overviewContactsBlock },
    tasks: {
      tasks: linkedTasks ?? [],
      loading: linkedTasks === undefined,
      attachmentCounts: fileTaskAttachmentCounts ?? undefined,
      organizationId: orgConvexArgs?.organizationId,
      memberUserKey: convexMemberKey ?? orgConvexArgs?.memberUserKey,
      pipelineFileId: p._id,
      actorUserKey: convexMemberKey ?? undefined,
      disabled: !canUseHub || !orgConvexArgs,
      onAdd: async (payload: FileTaskCreatePayload) => {
          if (!canUseHub) {
            const msg = "Reconnect to the server to add tasks to this file.";
            showOperationalToast({
              title: "Offline",
              description: msg,
              variant: "destructive",
            });
            throw new Error(msg);
          }
          if (!orgConvexArgs) {
            const msg = "Select an organization to add tasks to this file.";
            showOperationalToast({
              title: "No organization",
              description: msg,
              variant: "destructive",
            });
            throw new Error(msg);
          }
          await createTask({
            title: payload.title,
            type: "work",
            status: "todo",
            quadrant: 2,
            category: "admin",
            priority: 0,
            relatedFileId: p._id,
            ...(payload.triageLabelId
              ? { triageLabelId: payload.triageLabelId }
              : {}),
            ...(payload.scheduledTriggerTime != null
              ? { scheduledTriggerTime: payload.scheduledTriggerTime }
              : {}),
            organizationId: orgConvexArgs.organizationId,
            memberUserKey: orgConvexArgs.memberUserKey,
            ...(convexMemberKey ? { actorUserKey: convexMemberKey } : {}),
          });
        },
        onToggleDone: async (t) => {
          if (!orgConvexArgs) return;
          if (t.status === "done") {
            await runPatchTask(t, { status: "todo" });
            return;
          }
          if (!canUseHub) {
            window.alert("Reconnect to the server to mark a task as done.");
            return;
          }
          await completeTask({
            id: t._id,
            ...orgConvexArgs,
            ...(convexMemberKey ? { actorUserKey: convexMemberKey } : {}),
          });
        },
        onDelete: async (t) => {
          if (!orgConvexArgs) return;
          await removeTask({
            id: t._id,
            ...orgConvexArgs,
            ...(convexMemberKey ? { actorUserKey: convexMemberKey } : {}),
          });
        },
        onPatchTask: async (t, patch) => {
          await runPatchTask(t, patch);
        },
        onOpen: (taskId) => setOpenTaskId(taskId),
      },
    lenders: {
      fileId: p._id,
      primaryLender,
      secondaryLenders,
      consideringLenders,
      linkByLenderId: fileLenderLinkById,
      readOnly,
      lenderOrgArgs,
      attachError,
      onAttachErrorClear: () => setAttachError(null),
      onAddToConsideration: (payload) => onAddToConsideration(payload),
      settingBoardRoleId,
      removingFromFileId,
      rejecting,
      restoring,
      clearing,
      confirmClear,
      onConfirmClearChange: setConfirmClear,
      onSetBoardRole: (lenderId, role) => void onSetBoardRole(lenderId, role),
      onRemoveFromFile: (lenderId) => void onRemoveFromFile(lenderId),
      onRestoreLender: (lenderId) => void onRestoreLender(lenderId),
      onClearLenders: (keep) => void onClearLenders(keep),
      onOpenRejectModal: (lenderId) => {
        setRejectReason("");
        setRejectModalLenderId(lenderId);
      },
      onSetLenderRole: (lenderId, role) => {
        void setLenderLinkRole({
          fileId: p._id,
          lenderId,
          relationshipType: role,
          ...(preferencesAccountId ? { preferencesAccountId } : {}),
          ...(convexMemberKey ? { memberUserKey: convexMemberKey } : {}),
        });
      },
      onSetLenderProgram: (lenderId, programName) => {
        void setLenderLinkProgram({
          fileId: p._id,
          lenderId,
          programName: programName ?? undefined,
          ...(preferencesAccountId ? { preferencesAccountId } : {}),
          ...(convexMemberKey ? { memberUserKey: convexMemberKey } : {}),
        });
      },
      lenderPlaybookNameById,
      onApplyLenderPlaybook: (lenderId) => {
        const playbook = lenderPlaybookByLenderId.get(String(lenderId));
        if (!playbook || !orgConvexArgs) return;
        void applyTemplateGroupToFile({
          ...orgConvexArgs,
          templateGroupId: playbook.groupId,
          pipelineFileId: p._id,
          ...(convexMemberKey ? { actorUserKey: convexMemberKey } : {}),
        });
      },
      onSetLenderRep: (lenderId, contactRepId) => {
        void setLenderLinkRep({
          fileId: p._id,
          lenderId,
          contactRepId,
          ...(preferencesAccountId ? { preferencesAccountId } : {}),
          ...(convexMemberKey ? { memberUserKey: convexMemberKey } : {}),
        });
      },
    },
    fileInsights: {
      snapshot: fileInsightsSnapshot,
      onGoToSection: jumpToDrawerSection,
    },
  } satisfies OverviewTabProps;
  const dealInfoTabSharedProps = {
    fileInsightsSnapshot: fileInsightsSnapshot,
    fileDetails: {
      pipeline: p,
      dealCommitRow,
      patchField,
      runPatchDeal,
      fileDetailsIntelligentAlerts,
      fileDetailsLoanAmount,
      fileDetailsBusFund,
      fileDetailsBusRate,
      fundingFieldSync,
      rateFieldSync,
      fundingSyncSource,
      rateSyncSource,
      dealBackedForBus,
      blockSyncBehavior,
      blockBus,
      fileRevenueTotals,
      revenueOrgAgg,
      revenueUserAgg,
      preferencesAccountId,
      subjectAddressValue: dealCommitRow
        ? subjectAddressEditorValue(dealCommitRow)
        : (p.propertyAddress ?? ""),
    },
    licensing: {
      licenseDisplay,
      dealBacked: isDealBackedPipelineRow({
        dealData: p.dealData,
        intakeSheetId: p.intakeSheetId,
      }),
      onCommitLoNmls: commitLoNmls,
      onCommitBrokerNmls: commitBrokerNmls,
    },
    organizationId: p.organizationId ?? undefined,
    memberUserKey: convexMemberKey ?? preferencesAccountId,
    contactFileLinks: associatedContactLinks,
    clientId: globalBannerSwitchRow?.clientId,
  };

  const dealInfoFeesSplitsProps =
    isLegacyFeesSplitsDrawerBlockHidden("feesSplits")
      ? {
          file: p,
          loanBaseAmount: fileDetailsLoanAmount,
          patch: patchField,
          splits,
          onCommitSplits: commitSplits,
        }
      : undefined;

  /**
   * Phase Modular-C — opt-in blocks render only when active in the drawer
   * layout. Uses the canonical active-block resolver so template-driven
   * visibility (`hidden`), global disables, and registry `visibilityWhen`
   * conditions all apply at render time.
   */
  const activeDrawerBlockIds = new Set(
    getActivePipelineBlockIdsForFile({
      layout: drawerLayout,
      visibilitySignals: drawerVisibilitySignalsRef.current,
    }),
  );

  const dealInfoTabPanel = (
    <DealInfoCommandCenterTab
      dealInfo={dealInfoTabSharedProps}
      overview={overviewTabProps}
      feesSplits={dealInfoFeesSplitsProps}
      modularBlocks={
        activeDrawerBlockIds.has("investorExperience") ? (
          <InvestorExperienceBlockLazy
            contactId={primaryBorrowerContactId ?? null}
            memberUserKey={preferencesAccountId || undefined}
            readOnly={readOnly}
          />
        ) : undefined
      }
    />
  );

  const financialsTabPanel = (
    <DealFinancialsTab
      dealInfo={dealInfoTabSharedProps}
      dealWorkspace={{
        onOpenDealInfoSection: openDealInfoSection,
        workspaceSectionExcludeFilter: REALLOCATED_DEAL_WORKSPACE_SECTION_IDS,
      }}
      optionalBlocksBar={
        <PipelineOptionalBlocksAddBar
          layout={drawerLayout}
          onLayoutChange={(next) => setDrawerLayout(next)}
          parentTab="financials"
          blockIds={["pfs", "constructionBudget", "trackRecord", "simplePl"]}
        />
      }
      modularBlocks={
        activeDrawerBlockIds.has("constructionBudget") ||
        activeDrawerBlockIds.has("pfs") ||
        activeDrawerBlockIds.has("trackRecord") ||
        activeDrawerBlockIds.has("simplePl") ? (
          <>
            {activeDrawerBlockIds.has("constructionBudget") ? (
              <ConstructionBudgetBlockLazy
                fileId={p._id}
                memberUserKey={preferencesAccountId || undefined}
                readOnly={readOnly}
              />
            ) : null}
            {activeDrawerBlockIds.has("pfs") ? (
              <PfsBlockLazy
                contactId={primaryBorrowerContactId ?? null}
                memberUserKey={preferencesAccountId || undefined}
                readOnly={readOnly}
              />
            ) : null}
            {activeDrawerBlockIds.has("trackRecord") ? (
              <TrackRecordBlockLazy
                contactId={primaryBorrowerContactId ?? null}
                memberUserKey={preferencesAccountId || undefined}
                readOnly={readOnly}
              />
            ) : null}
            {activeDrawerBlockIds.has("simplePl") ? (
              <SimplePlBlockLazy
                contactId={primaryBorrowerContactId ?? null}
                memberUserKey={preferencesAccountId || undefined}
                readOnly={readOnly}
              />
            ) : null}
          </>
        ) : undefined
      }
    />
  );

  const documentsTabPanel = (
    <DocumentVaultTab
      fileId={p._id}
      primaryBorrowerContactId={primaryBorrowerContactId}
      memberUserKey={convexMemberKey ?? preferencesAccountId}
      canUseHub={canUseHub}
      organizationId={p.organizationId ?? undefined}
      dealPackageLabel={p.fileName?.trim() || "Deal Package"}
      documentCreatorTokenContext={documentCreatorTokenContext}
      navigationFocus={documentsVaultFocus}
      onNavigationFocusConsumed={clearDocumentsVaultFocus}
    />
  );
  const portalsProgressTabPanel = (
    <PortalsAndProgressTab
      underwriting={{
        fileId: p._id,
        memberUserKey: preferencesAccountId,
      }}
      clientPortal={{
        fileId: p._id,
        memberUserKey: preferencesAccountId,
        organizationId: overviewOrganizationId ?? null,
        onNavigateToDocuments: openDocumentsVault,
      }}
    />
  );
  const formsApplicationsTabPanel =
    p.organizationId && preferencesAccountId ? (
      <FormsApplicationsTab
        fileId={p._id}
        organizationId={p.organizationId}
        memberUserKey={preferencesAccountId}
        readOnly={readOnly}
      />
    ) : (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-800">
        Organization context is required to manage intake forms.
      </div>
    );
  const settingsTabPanel = (
    <SettingsTab
      fileId={p._id}
      organizationId={p.organizationId ?? null}
      memberUserKey={preferencesAccountId}
      readOnly={readOnly}
      isSharedRecipient={isSharedRecipient}
      archivedAt={p.archivedAt}
      archiving={archiving}
      archiveError={archiveError}
      onToggleArchive={() => void toggleArchive()}
      onDelete={openFileDeleteConfirm}
      onLeaveShare={openLeaveShareConfirm}
      drawerLayout={drawerLayout}
      onDrawerLayoutChange={setDrawerLayout}
      layoutNonHideableIds={layoutNonHideableIds}
      planGatedBlockIds={
        pipelineOrgId &&
        orgPlanEntitlements &&
        !orgPlanEntitlements.advanced_blocks
          ? [...ADVANCED_PIPELINE_BLOCK_IDS]
          : undefined
      }
      effectiveCollapseBehavior={effectiveCollapseBehavior}
      onCollapseBehaviorChange={onCollapseBehaviorChange}
      fileSectionBulkBusy={fileSectionBulkBusy}
      onApplyFileCollapseExpand={(mode) => void applyFileCollapseExpand(mode)}
      onResetDrawerToTemplate={() => void resetDrawerToTemplate()}
      drawerLayoutResetting={drawerLayoutResetting}
      canResetTemplate={
        Boolean(detail?.pipeline) &&
        detail.pipeline._id === id &&
        Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
      }
      drawerBlockSuggestions={
        <PipelineDrawerBlockSuggestions
          fileId={p._id}
          dealData={p.dealData}
          pipelineScenarioLine={
            typeof p.scenario === "string" ? p.scenario : undefined
          }
          lenderCount={sortedLenderRows.length}
          legacyContactCount={p.contacts?.length ?? 0}
          drawerLayout={drawerLayout}
          visibilitySignals={drawerVisibilitySignals}
          focusedFieldPaths={focusedDealFieldPaths}
          setDrawerLayout={setDrawerLayout}
          accountId={accountId}
          workflowRules={workflowRulesForIntelligence}
          hasSelectedLender={primaryLender != null}
          enableAi={drawerAiAssistEnabled}
        />
      }
    />
  );

  // Plain function (not useCallback): must stay after the detail early returns
  // above — a hook here caused React #310 (more hooks after load than on skeleton).
  function renderFavoriteFloatingContent(
    blockId: PipelineBlockId,
  ): ReactNode {
    switch (blockId) {
      case "fileNotes":
        return p.organizationId ? (
          <FileNotesBlock
            blockSettings={fileNotesResolvedSettings}
            pipelineFileId={p._id}
            organizationId={p.organizationId}
            memberUserKey={convexMemberKey}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Notes require this file to belong to an organization.
          </p>
        );
      case "tasks":
        return <FileTasksBlock {...overviewTabProps.tasks} />;
      case "contacts":
        return overviewContactsBlock;
      case "constructionBudget":
        return (
          <ConstructionBudgetBlockLazy
            fileId={p._id}
            memberUserKey={preferencesAccountId || undefined}
            readOnly={readOnly}
          />
        );
      case "investorExperience":
        return (
          <InvestorExperienceBlockLazy
            contactId={primaryBorrowerContactId ?? null}
            memberUserKey={preferencesAccountId || undefined}
            readOnly={readOnly}
          />
        );
      case "pfs":
        return (
          <PfsBlockLazy
            contactId={primaryBorrowerContactId ?? null}
            memberUserKey={preferencesAccountId || undefined}
            readOnly={readOnly}
          />
        );
      case "trackRecord":
        return (
          <TrackRecordBlockLazy
            contactId={primaryBorrowerContactId ?? null}
            memberUserKey={preferencesAccountId || undefined}
            readOnly={readOnly}
          />
        );
      case "simplePl":
        return (
          <SimplePlBlockLazy
            contactId={primaryBorrowerContactId ?? null}
            memberUserKey={preferencesAccountId || undefined}
            readOnly={readOnly}
          />
        );
      default:
        return null;
    }
  }

  return (
    <>
      <PipelineScrollDebugMount />
      <PipelineLayoutDebugMount />
    <ResourceAccessProvider value={resourceAccessUx}>
    <PipelineWorkspaceSection
      htmlId="pipeline-ws-file-root"
      sectionId="pipeline-file-workspace"
      sectionType="workspace-root"
      sectionLabel="Pipeline file workspace"
      className={workspaceRootClass}
      contentClassName={cn(
        "relative flex min-w-0 flex-col",
        !embedded && "min-h-0 flex-1",
      )}
      data-resource-read-only={readOnly ? "true" : undefined}
    >
      <div
        ref={drawerBodyRef}
        data-testid="pipeline-drawer-scroll"
        className={cn(workspaceBodyClass, readOnly && "max-md:[&_button]:cursor-not-allowed")}
        title={readOnly ? resourceAccessUx.viewOnlyTooltip : undefined}
      >
        <DealWorkspaceEditorProvider fileId={p._id}>
        <ClientBlockAssignProvider
          value={{
            pipelineFileId: p._id,
            memberUserKey: convexMemberKey ?? preferencesAccountId,
            assignedContactId: primaryBorrowerContactId ?? null,
            readOnly,
          }}
        >
        {/*
          DocumentVaultStateProvider must wrap FloatingBlockWindowProvider so
          detached Document Vault content (host sibling of tab panels) keeps the
          same vault nav state — not a tab-local provider that WiW leaves behind.
        */}
        <DocumentVaultStateProvider>
        <FloatingBlockWindowProvider scopeKey={String(p._id)}>
        <PipelineFileWorkspaceShell
          embedded={embedded}
          isSnoozed={isSnoozed}
          accessBanner={
            embedded ? null : (
              <ResourceAccessBanner
                mode={resourceAccessUx.bannerMode}
                ownerDisplayUsername={resourceAccessUx.ownerDisplayUsername}
                resourceKind="pipeline"
              />
            )
          }
          bannerAriaLabel={
            p.fileName?.trim()
              ? `${p.fileName} — file header`
              : "Pipeline file header"
          }
          chrome={
            embedded || !globalBannerPipelineData ? null : (
              <DealCommandCenterHeader
                fileId={id}
                hubBackHref={workspaceHubBackHref}
                hubBackLabel={workspaceHubBackLabel}
                pipelineData={globalBannerPipelineData}
                statusLabel={statusInfo.label}
                rateDisplay={dealCommandCenterRateDisplay}
                termDisplay={dealCommandCenterTermDisplay}
                crumbs={workspaceCrumbsWithTab}
                projectName={
                  workspaceHasProject ? workspaceProjectLabel : null
                }
                projectHref={
                  workspaceHasProject ? workspaceProjectHref : null
                }
                projectSiblingFiles={projectSiblingFiles}
                accessHint={
                  !canMutateWorkspaceFile ? "View-only access" : undefined
                }
                ownerDisplayUsername={detail.ownership?.ownerDisplayUsername}
                detailsExpanded={headerDetailsExpanded}
                onDetailsToggle={() =>
                  setHeaderDetailsExpanded((open) => !open)
                }
                onPatchField={patchField}
                runPatchDeal={runPatchDeal}
                onCommitFundingFallback={async (n) => {
                  const fund = fileDetailsBusFund;
                  if (!fund) return;
                  await blockBus.commitSharedNumeric("fundingAmount", n, fund);
                }}
                overflowMenu={
                  <DropdownMenu
                    aria-label="File workspace actions"
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 shrink-0 p-0 max-md:h-10 max-md:w-10 max-md:min-h-10 max-md:min-w-10",
                        )}
                        data-testid="pipeline-workspace-header-overflow"
                      >
                        <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                      </Button>
                    }
                  >
                    <DropdownMenuItem
                      onClick={() => setWorkspaceActiveTab("settings")}
                    >
                      <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
                      File settings
                    </DropdownMenuItem>
                    {!isLegacyFileAdminHeaderOverflowHidden() ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => jumpToDrawerSection("people")}
                        >
                          <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                          Manage sharing
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={archiving}
                          onClick={() => void toggleArchive()}
                        >
                          {p.archivedAt != null ? (
                            <ArchiveRestore
                              className="h-4 w-4 shrink-0"
                              aria-hidden
                            />
                          ) : (
                            <Archive className="h-4 w-4 shrink-0" aria-hidden />
                          )}
                          {p.archivedAt != null
                            ? "Restore from archive"
                            : "Archive file"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          destructive
                          onClick={() => openFileDeleteConfirm()}
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                          Delete file…
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenu>
                }
              >
                {headerDetailsMounted ? (
                <HeaderDisclosurePanel
                  open={headerDetailsExpanded}
                  testId="pipeline-workspace-header-details"
                  className="w-full min-w-0"
                >
                  <div className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
                    <div className="min-w-0 w-full space-y-2">
                      {p.organizationId && convexMemberKey ? (
                        <>
                          <ChangeFileProjectControl
                            organizationId={p.organizationId}
                            memberUserKey={convexMemberKey}
                            fileId={id}
                            projectId={p.projectId}
                            readOnly={!canMutateWorkspaceFile}
                          />
                          <LinkedClientsEditor
                            scope="loan"
                            organizationId={p.organizationId}
                            memberUserKey={convexMemberKey}
                            fileId={id}
                            readOnly={!canMutateWorkspaceFile}
                            showSyncFromProject={Boolean(p.projectId)}
                          />
                        </>
                      ) : null}
                    </div>
                    {pipelineSwitcherPreview !== undefined &&
                    (projectSiblingFiles.length > 1 ||
                      (!workspaceHasProject &&
                        pipelineSwitcherRows.length > 1)) ? (
                        <label className="flex min-w-0 w-full flex-col gap-0.5">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {workspaceHasProject
                              ? "Switch file in project"
                              : "Switch file"}
                          </span>
                          <select
                            className={cn(
                              "h-9 w-full min-w-0 rounded-dlc-md border border-border bg-background px-2 text-base shadow-dlc-1 md:text-sm",
                              "focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              "max-md:min-h-11",
                            )}
                            value={id}
                            aria-label={
                              workspaceHasProject
                                ? "Switch to another file in this project"
                                : "Switch to another pipeline file"
                            }
                            onChange={(e) => {
                              const next = e.target.value as Id<"pipeline">;
                              if (next === id) return;
                              startTransition(() => {
                                router.push(pipelineDealEditorHref(next));
                              });
                            }}
                          >
                            {(workspaceHasProject
                              ? projectSiblingFiles
                              : pipelineSwitcherRows
                            ).map((r) => (
                              <option key={r._id} value={r._id}>
                                {r.fileName?.trim()
                                  ? r.fileName
                                  : "Untitled file"}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                  </div>
                  {detail.ownership ? (
                    <ResourceAccessDetails
                      resourceType="pipeline"
                      resourceId={String(p._id)}
                      organizationId={p.organizationId ?? undefined}
                      memberUserKey={convexMemberKey}
                      ownerDisplayUsername={detail.ownership.ownerDisplayUsername}
                      ownershipLine={detail.ownership.ownershipLine}
                      badge={detail.ownership.badge}
                      viewerAccessLevel={detail.ownership.viewerAccessLevel}
                      isOwner={detail.ownership.isOwner}
                      collaboratorCount={detail.ownership.collaboratorCount}
                      className="px-0.5"
                    />
                  ) : null}
                  {p.scenario ? (
                    <p className="text-xs text-muted-foreground">{p.scenario}</p>
                  ) : null}
                  <div
                    className="flex shrink-0 items-center"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ClientMomentumStars
                      variant="header"
                      size="sm"
                      className="shrink-0"
                      value={p.clientMomentum}
                      readOnly={p.archivedAt != null || !canMutateWorkspaceFile}
                      disabled={p.archivedAt != null}
                      onCommit={
                        p.archivedAt == null && canMutateWorkspaceFile
                          ? (n) => commitClientMomentum(n)
                          : undefined
                      }
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <PresenceIndicators
                      organizationId={activeOrganizationId ?? undefined}
                      memberUserKey={convexMemberKey}
                      pipelineFileId={id}
                    />
                    <OccupancyConflictCallout
                      organizationId={activeOrganizationId ?? undefined}
                      memberUserKey={convexMemberKey}
                      pipelineFileId={id}
                      surfaceKey={presenceModel.surfaceKey}
                      selfEditing={presenceModel.status === "editing_file"}
                    />
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-2">
                    <div className="flex min-w-0 w-full flex-col gap-1 md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-1">
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        Target close
                      </span>
                      <div className="min-w-0 w-full sm:w-auto sm:min-w-[10rem]">
                        <InlineDate
                          value={p.targetCloseDate}
                          onCommit={(next) =>
                            patchField({
                              id: p._id,
                              targetCloseDate: next === null ? null : next,
                            })
                          }
                          ariaLabel="Target close date"
                          placeholder="No date"
                          showRelative
                          displayClassName="text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-x-2 md:gap-y-1">
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
                        <BellOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Snooze until
                      </span>
                      <div className="flex min-w-0 w-full flex-col flex-wrap gap-2 md:w-auto md:flex-row md:items-center md:gap-1">
                        <div className="min-w-0 w-full sm:w-auto sm:min-w-[10rem]">
                          <InlineDate
                            value={snoozePickerValue}
                            onCommit={(next) =>
                              void commitSnoozeEndOfLocalDay(next)
                            }
                            ariaLabel="Snooze until date (hidden from pipeline until end of this day)"
                            placeholder="Not snoozed"
                            showRelative
                            displayClassName="text-xs"
                            disabled={snoozing}
                          />
                        </div>
                        {hasSnoozeStored ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs"
                            disabled={snoozing}
                            onClick={() => void clearSnooze()}
                          >
                            Clear snooze
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                          disabled={snoozing}
                          onClick={() => void applySnoozePreset(1)}
                        >
                          Tomorrow
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                          disabled={snoozing}
                          onClick={() => void applySnoozePreset(7)}
                        >
                          Next week
                        </Button>
                      </div>
                    </div>
                    <PipelineFileAutoArchiveControl
                      inactivityDays={p.autoArchiveInactivityDays}
                      autoArchiveAfterAt={p.autoArchiveAfterAt}
                      lastActivityAt={lastPipelineActivityAt(p)}
                      archived={p.archivedAt != null}
                      disabled={
                        p.archivedAt != null || !canMutateWorkspaceFile
                      }
                      busy={autoArchiving}
                      error={autoArchiveError}
                      onEnable={(days) => void commitAutoArchiveDays(days)}
                      onDisable={() => void clearAutoArchive()}
                    />
                  </div>
                  {snoozeError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {snoozeError}
                    </p>
                  ) : null}
                </HeaderDisclosurePanel>
              ) : null}
              </DealCommandCenterHeader>
            )
          }
          pinnedLead={
            embedded ? null : (
              <>
                <FileWorkspaceTabNav
                  activeTab={workspaceActiveTab}
                  onActiveTabChange={setWorkspaceActiveTab}
                  placement="pinned"
                  tabIndicators={workspaceTabIndicators}
                />
                <FileFavoritesFloatingLauncher
                  favorites={preferences.favoriteFileBlocks}
                  pinnableBlockIds={FAVORITE_PINNABLE_BLOCK_IDS}
                  onPrepareBlock={prepareFavoriteBlock}
                  onEnsureMounted={ensureFavoriteBlockMounted}
                  onJumpToSection={jumpToDrawerSection}
                  onToggleFavorite={toggleFavoriteBlock}
                  renderContent={renderFavoriteFloatingContent}
                  disabled={!prefsServerReady}
                />
              </>
            )
          }
          scrollLead={
            <FileWorkspaceTabShell
              activeTab={workspaceActiveTab}
              onActiveTabChange={setWorkspaceActiveTab}
              navPlacement={embedded ? "inline" : "pinned"}
              dealInfoPanel={dealInfoTabPanel}
              financialsPanel={financialsTabPanel}
              portalsProgressPanel={portalsProgressTabPanel}
              documentsPanel={documentsTabPanel}
              formsApplicationsPanel={formsApplicationsTabPanel}
              settingsPanel={settingsTabPanel}
            />
          }
        />
        </FloatingBlockWindowProvider>
        </DocumentVaultStateProvider>
        </ClientBlockAssignProvider>
        </DealWorkspaceEditorProvider>
      </div>
      <PipelineWorkspaceSection
        htmlId="pipeline-ws-task-drawer-overlay"
        sectionId="task-drawer-overlay"
        sectionType="overlay"
        sectionLabel="Task detail drawer"
        className="contents"
      >
        <TaskDrawer
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onOpenTask={(taskId) => setOpenTaskId(taskId)}
        />
      </PipelineWorkspaceSection>
    </PipelineWorkspaceSection>

      {rejectModalLenderId ? (
        <ActionSuiteModal
          testId="pipeline-lender-reject-modal"
          title="Reject lender for this file"
          onClose={() => {
            if (rejecting) return;
            setRejectModalLenderId(null);
            setRejectReason("");
          }}
        >
          <p className="mb-3 text-sm text-muted-foreground">
            The lender stays on this file for duplicate-guard visibility, but
            the deal is removed from their column on the Pipeline Hub lender
            view.
          </p>
          <label className="block text-xs font-medium text-muted-foreground">
            Enter rejection reason
            <Textarea
              className="mt-1 min-h-[88px] resize-y"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. declined — credit box mismatch"
              disabled={rejecting != null}
              autoFocus
            />
          </label>
          {attachError && rejectModalLenderId ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {attachError}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[40px] sm:min-h-0"
              disabled={rejecting != null}
              onClick={() => {
                setRejectModalLenderId(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="min-h-[40px] sm:min-h-0"
              disabled={rejecting != null || !rejectReason.trim()}
              onClick={() => void onConfirmLenderRejection()}
            >
              {rejecting ? "Saving…" : "Confirm rejection"}
            </Button>
          </div>
        </ActionSuiteModal>
      ) : null}
    </ResourceAccessProvider>
    </>
  );
}

