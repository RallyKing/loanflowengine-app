"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Settings2 } from "lucide-react";
import type { OverviewTabProps } from "@/components/pipeline/tabs/OverviewTab";
import { OverviewTab } from "@/components/pipeline/tabs/OverviewTab";
import {
  DealInfoTab,
  type DealInfoTabProps,
} from "@/components/pipeline/tabs/DealInfoTab";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/cn";
import {
  commitSectionRegistrySlice,
  refreshSectionRegistrySlice,
  registeredCommandCenterSectionIds,
  resolveCommandCenterSectionRenderer,
  type RegisterCommandCenterSections,
  type SectionRegistrySlice,
} from "@/lib/file/commandCenterSectionRegistry";
import type { DealInfoSectionId } from "@/lib/file/dealInfoTabLayout";
import { parseDealInfoLayoutFromUnknown } from "@/lib/file/dealInfoTabLayout";
import type { OverviewSectionId } from "@/lib/file/overviewTabLayout";
import { parseOverviewTabLayoutFromUnknown } from "@/lib/file/overviewTabLayout";
import {
  type DealInfoCommandCenterSectionId,
  DEAL_INFO_COMMAND_CENTER_SECTION_IDS,
  DEAL_INFO_COMMAND_CENTER_SECTION_LABELS,
  isCommandCenterSectionVisible,
  normalizeCommandCenterSectionOrder,
  parseDealInfoCommandCenterLayoutFromUnknown,
  resetDealInfoCommandCenterLayout,
  syncDealInfoLayoutFromCommandCenter,
  syncOverviewLayoutFromCommandCenter,
  toggleCommandCenterSectionHidden,
} from "@/lib/file/dealInfoCommandCenterLayout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import {
  DealInfoFeesSections,
} from "@/components/pipeline/deal/DealInfoFeesSections";
import type { FeesSplitsBlockProps } from "@/components/pipeline/blocks/FeesSplitsBlock";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import {
  premiumSectionStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

/** Deal Info identity sections (legacy export). */
export const DEAL_INFO_COMMAND_CENTER_SECTION_IDS_LEGACY: readonly DealInfoSectionId[] =
  ["fileDetails", "borrowers", "guarantors"] as const;

/** Overview sections on Deal Info (legacy export). */
export const DEAL_INFO_OVERVIEW_SECTION_IDS: readonly OverviewSectionId[] = [
  "contacts",
  "notes",
  "tasks",
  "lenders",
] as const;

export type DealInfoCommandCenterTabProps = {
  className?: string;
  dealInfo: DealInfoTabProps;
  overview: OverviewTabProps;
  feesSplits?: FeesSplitsBlockProps;
  /** Phase Modular-C — opt-in blocks (investor experience) when active. */
  modularBlocks?: ReactNode;
};

function LayoutToggle({
  testId,
  label,
  visible,
  onToggle,
}: {
  testId: string;
  label: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={visible}
      data-testid={testId}
      className={cn(
        "flex w-full min-h-10 items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground",
        "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
      )}
      onClick={onToggle}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-dlc-sm border border-border",
          visible && "border-primary bg-primary text-primary-foreground",
        )}
        aria-hidden
      >
        {visible ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6l3 3 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

function useSectionRegistryRegistrar(
  ref: React.MutableRefObject<SectionRegistrySlice>,
  sigRef: React.MutableRefObject<string>,
  bumpGeneration: () => void,
  onDataRefresh?: () => void,
): RegisterCommandCenterSections {
  return useCallback(
    (sections, contentSig = "") => {
      if (
        commitSectionRegistrySlice(ref, sigRef, sections, contentSig)
      ) {
        bumpGeneration();
      } else {
        refreshSectionRegistrySlice(ref, sections);
        onDataRefresh?.();
      }
    },
    [bumpGeneration, onDataRefresh, ref, sigRef],
  );
}

/** Deal Info — single DnD canvas for all blocks (identity, ops, fees, modular). */
export function DealInfoCommandCenterTab({
  className,
  dealInfo,
  overview,
  feesSplits,
  modularBlocks,
}: DealInfoCommandCenterTabProps) {
  const {
    draft,
    saving,
    savedAt,
    isDirty,
    patchDealInfoCommandCenterLayout,
    patchDealInfoTabLayout,
    patchOverviewTabLayout,
  } = useDealWorkspaceEditor();

  const dealInfoLayout = useMemo(
    () => parseDealInfoLayoutFromUnknown(draft?.dealInfoTabLayout),
    [draft?.dealInfoTabLayout],
  );
  const overviewLayout = useMemo(
    () => parseOverviewTabLayoutFromUnknown(draft?.overviewTabLayout),
    [draft?.overviewTabLayout],
  );

  /** Read-only derivation — never persisted on mount (user drag/toggle only). */
  const commandCenterLayout = useMemo(
    () =>
      parseDealInfoCommandCenterLayoutFromUnknown(
        draft?.dealInfoCommandCenterLayout,
        {
          dealInfoOrder: dealInfoLayout.order,
          overviewOrder: overviewLayout.order,
          dealInfoHidden: dealInfoLayout.hidden,
          overviewHidden: overviewLayout.hidden,
        },
      ),
    [
      draft?.dealInfoCommandCenterLayout,
      dealInfoLayout.hidden,
      dealInfoLayout.order,
      overviewLayout.hidden,
      overviewLayout.order,
    ],
  );

  const dealInfoSectionsRef = useRef<SectionRegistrySlice>({});
  const overviewSectionsRef = useRef<SectionRegistrySlice>({});
  const feesSectionsRef = useRef<SectionRegistrySlice>({});
  const dealInfoSigRef = useRef("");
  const overviewSigRef = useRef("");
  const feesSigRef = useRef("");
  const [registryGeneration, setRegistryGeneration] = useState(0);
  const [overviewDataRevision, setOverviewDataRevision] = useState(0);

  const bumpRegistryGeneration = useCallback(() => {
    setRegistryGeneration((g) => g + 1);
  }, []);

  const bumpOverviewDataRevision = useCallback(() => {
    setOverviewDataRevision((n) => n + 1);
  }, []);

  const registerDealInfoSections = useSectionRegistryRegistrar(
    dealInfoSectionsRef,
    dealInfoSigRef,
    bumpRegistryGeneration,
  );
  const registerOverviewSections = useSectionRegistryRegistrar(
    overviewSectionsRef,
    overviewSigRef,
    bumpRegistryGeneration,
    bumpOverviewDataRevision,
  );
  const registerFeesSections = useSectionRegistryRegistrar(
    feesSectionsRef,
    feesSigRef,
    bumpRegistryGeneration,
  );

  const registeredSectionIds = useMemo(() => {
    void registryGeneration;
    return registeredCommandCenterSectionIds(
      [
        dealInfoSectionsRef.current,
        overviewSectionsRef.current,
        feesSectionsRef.current,
      ],
      modularBlocks ? ["investorExperience"] : [],
    );
  }, [modularBlocks, registryGeneration]);

  const availableSectionIds = useMemo(() => {
    if (modularBlocks) return DEAL_INFO_COMMAND_CENTER_SECTION_IDS;
    return DEAL_INFO_COMMAND_CENTER_SECTION_IDS.filter(
      (id) => id !== "investorExperience",
    );
  }, [modularBlocks]);

  const visibleSectionIds = useMemo(
    () =>
      commandCenterLayout.order.filter(
        (id) =>
          availableSectionIds.includes(id) &&
          isCommandCenterSectionVisible(commandCenterLayout, id) &&
          registeredSectionIds.has(id),
      ),
    [availableSectionIds, commandCenterLayout, registeredSectionIds],
  );

  const onCommandCenterDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as DealInfoCommandCenterSectionId;
      const overId = String(over.id) as DealInfoCommandCenterSectionId;
      if (
        !availableSectionIds.includes(activeId) ||
        !availableSectionIds.includes(overId)
      ) {
        return;
      }

      const oldIndex = commandCenterLayout.order.indexOf(activeId);
      const newIndex = commandCenterLayout.order.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;

      const next = {
        ...commandCenterLayout,
        order: normalizeCommandCenterSectionOrder(
          arrayMove(commandCenterLayout.order, oldIndex, newIndex),
        ),
      };
      patchDealInfoCommandCenterLayout(() => next);
      patchDealInfoTabLayout((prev) =>
        syncDealInfoLayoutFromCommandCenter(prev, next),
      );
      patchOverviewTabLayout((prev) =>
        syncOverviewLayoutFromCommandCenter(prev, next),
      );
    },
    [
      availableSectionIds,
      commandCenterLayout,
      patchDealInfoCommandCenterLayout,
      patchDealInfoTabLayout,
      patchOverviewTabLayout,
    ],
  );

  const onToggleSectionVisibility = useCallback(
    (sectionId: DealInfoCommandCenterSectionId) => {
      const next = toggleCommandCenterSectionHidden(
        commandCenterLayout,
        sectionId,
      );
      patchDealInfoCommandCenterLayout(() => next);
      patchDealInfoTabLayout((prev) =>
        syncDealInfoLayoutFromCommandCenter(prev, next),
      );
      patchOverviewTabLayout((prev) =>
        syncOverviewLayoutFromCommandCenter(prev, next),
      );
    },
    [
      commandCenterLayout,
      patchDealInfoCommandCenterLayout,
      patchDealInfoTabLayout,
      patchOverviewTabLayout,
    ],
  );

  const onResetLayout = useCallback(() => {
    const next = resetDealInfoCommandCenterLayout();
    patchDealInfoCommandCenterLayout(() => next);
    patchDealInfoTabLayout((prev) =>
      syncDealInfoLayoutFromCommandCenter(prev, next),
    );
    patchOverviewTabLayout((prev) =>
      syncOverviewLayoutFromCommandCenter(prev, next),
    );
  }, [
    patchDealInfoCommandCenterLayout,
    patchDealInfoTabLayout,
    patchOverviewTabLayout,
  ]);

  const renderRegisteredSection = useCallback(
    (sectionId: DealInfoCommandCenterSectionId, dragHandle: ReactNode) => {
      void registryGeneration;
      void overviewDataRevision;
      if (sectionId === "investorExperience" && modularBlocks) {
        return (
          <div className="flex min-w-0 items-start gap-1">
            <div className="shrink-0 pt-3">{dragHandle}</div>
            <div className="min-w-0 flex-1">{modularBlocks}</div>
          </div>
        );
      }
      const renderer = resolveCommandCenterSectionRenderer(sectionId, [
        dealInfoSectionsRef.current,
        overviewSectionsRef.current,
        feesSectionsRef.current,
      ]);
      return renderer ? renderer(dragHandle) : null;
    },
    [modularBlocks, overviewDataRevision, registryGeneration],
  );

  return (
    <div
      className={cn(
        premiumWorkspaceCanvasClass,
        "flex min-w-0 flex-col",
        premiumSectionStackClass,
        className,
      )}
      data-testid="pipeline-deal-info-command-center-tab"
    >
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-0.5"
        data-testid="pipeline-deal-info-command-center-toolbar"
      >
        <DropdownMenu
          aria-label="Deal Info block visibility and layout"
          align="start"
          className="min-w-[14rem]"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
              data-testid="pipeline-deal-info-layout-control"
              aria-label="Deal Info block visibility and layout"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </Button>
          }
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Block visibility
          </div>
          <DropdownMenuSeparator />
          {availableSectionIds.map((sectionId) => (
            <LayoutToggle
              key={sectionId}
              testId={`pipeline-deal-info-layout-toggle-${sectionId}`}
              label={DEAL_INFO_COMMAND_CENTER_SECTION_LABELS[sectionId]}
              visible={isCommandCenterSectionVisible(
                commandCenterLayout,
                sectionId,
              )}
              onToggle={() => onToggleSectionVisibility(sectionId)}
            />
          ))}
          <DropdownMenuSeparator />
          <button
            type="button"
            role="menuitem"
            data-testid="pipeline-deal-info-layout-reset"
            className={cn(
              "flex w-full min-h-10 items-center px-3 py-2 text-left text-sm text-foreground",
              "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
            )}
            onClick={onResetLayout}
          >
            Reset to defaults
          </button>
        </DropdownMenu>
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      {/* Section providers — register renderers; no competing DnD contexts. */}
      <div className="sr-only" aria-hidden>
        <DealInfoTab
          {...dealInfo}
          embedded
          suppressInternalDnd
          onRegisterSections={registerDealInfoSections}
          sectionGroup="identity"
          sectionIncludeFilter={DEAL_INFO_COMMAND_CENTER_SECTION_IDS_LEGACY}
          combineBorrowersGuarantors
          fileInsightsSnapshot={
            dealInfo.fileInsightsSnapshot ?? overview.fileInsights.snapshot
          }
        />
        <OverviewTab
          {...overview}
          embedded
          suppressInternalDnd
          onRegisterSections={registerOverviewSections}
          sectionIncludeFilter={DEAL_INFO_OVERVIEW_SECTION_IDS}
        />
        <DealInfoFeesSections
          feesSplits={feesSplits}
          suppressInternalDnd
          onRegisterSections={registerFeesSections}
        />
      </div>

      <SortableSectionList
        itemIds={visibleSectionIds}
        onDragEnd={onCommandCenterDragEnd}
      >
        <div
          className={premiumSectionStackClass}
          data-testid="pipeline-deal-info-unified-sections"
          aria-label="Deal info blocks"
        >
          {visibleSectionIds.map((sectionId) => (
            <SortableSectionItem key={sectionId} id={sectionId}>
              {(dragHandle) => renderRegisteredSection(sectionId, dragHandle)}
            </SortableSectionItem>
          ))}
        </div>
      </SortableSectionList>
    </div>
  );
}
