"use client";

import type { ReactNode } from "react";
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
import type { DealInfoSectionId } from "@/lib/file/dealInfoTabLayout";
import {
  DEAL_INFO_SECTION_LABELS,
  isDealInfoSectionVisible,
  parseDealInfoLayoutFromUnknown,
  resetDealInfoLayout,
  toggleDealInfoSectionHidden,
} from "@/lib/file/dealInfoTabLayout";
import type { OverviewSectionId } from "@/lib/file/overviewTabLayout";
import {
  isOverviewSectionVisible,
  OVERVIEW_SECTION_LABELS,
  resetOverviewTabLayout,
  toggleOverviewSectionHidden,
  parseOverviewTabLayoutFromUnknown,
} from "@/lib/file/overviewTabLayout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import {
  DealInfoFeesSections,
} from "@/components/pipeline/deal/DealInfoFeesSections";
import type { FeesSplitsBlockProps } from "@/components/pipeline/blocks/FeesSplitsBlock";
import {
  premiumSectionStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

/** Deal Info command center — identity sections only (no licensing). */
export const DEAL_INFO_COMMAND_CENTER_SECTION_IDS: readonly DealInfoSectionId[] =
  ["fileDetails", "borrowers", "guarantors"] as const;

/** Overview sections on Deal Info (File Insights merged into File Details). */
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

/** Deal Info — single-column stack: details, parties, contacts, notes, tasks, lenders. */
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
    patchDealInfoTabLayout,
    patchOverviewTabLayout,
  } = useDealWorkspaceEditor();

  const dealInfoLayout = parseDealInfoLayoutFromUnknown(
    draft?.dealInfoTabLayout,
  );
  const overviewLayout = parseOverviewTabLayoutFromUnknown(
    draft?.overviewTabLayout,
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
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu
            aria-label="Deal Info section visibility"
            align="start"
            className="min-w-[14rem]"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
                data-testid="pipeline-deal-info-layout-control"
                aria-label="Deal Info section visibility"
              >
                <Settings2 className="h-4 w-4" aria-hidden />
              </Button>
            }
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Section visibility
            </div>
            <DropdownMenuSeparator />
            {DEAL_INFO_COMMAND_CENTER_SECTION_IDS.map((sectionId) => {
              if (sectionId === "guarantors") return null;
              const label =
                sectionId === "borrowers"
                  ? "Borrowers & guarantors"
                  : DEAL_INFO_SECTION_LABELS[sectionId];
              const visible =
                sectionId === "borrowers"
                  ? isDealInfoSectionVisible(dealInfoLayout, "borrowers") ||
                    isDealInfoSectionVisible(dealInfoLayout, "guarantors")
                  : isDealInfoSectionVisible(dealInfoLayout, sectionId);
              return (
                <LayoutToggle
                  key={sectionId}
                  testId={`pipeline-deal-info-layout-toggle-${sectionId}`}
                  label={label}
                  visible={visible}
                  onToggle={() => {
                    if (sectionId === "borrowers") {
                      const borrowersVisible = isDealInfoSectionVisible(
                        dealInfoLayout,
                        "borrowers",
                      );
                      patchDealInfoTabLayout((prev) => {
                        let next = toggleDealInfoSectionHidden(
                          prev,
                          "borrowers",
                        );
                        if (borrowersVisible === isDealInfoSectionVisible(next, "borrowers")) {
                          next = toggleDealInfoSectionHidden(next, "guarantors");
                        }
                        return next;
                      });
                      return;
                    }
                    patchDealInfoTabLayout((prev) =>
                      toggleDealInfoSectionHidden(prev, sectionId),
                    );
                  }}
                />
              );
            })}
            <DropdownMenuSeparator />
            <button
              type="button"
              role="menuitem"
              data-testid="pipeline-deal-info-layout-reset"
              className={cn(
                "flex w-full min-h-10 items-center px-3 py-2 text-left text-sm text-foreground",
                "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
              )}
              onClick={() => patchDealInfoTabLayout(() => resetDealInfoLayout())}
            >
              Reset to defaults
            </button>
          </DropdownMenu>
          <DropdownMenu
            aria-label="Operational blocks visibility"
            align="start"
            className="min-w-[14rem]"
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 text-xs"
                data-testid="pipeline-deal-info-overview-layout-control"
              >
                Blocks
              </Button>
            }
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contacts · Notes · Tasks · Lenders · Fees
            </div>
            <DropdownMenuSeparator />
            {DEAL_INFO_OVERVIEW_SECTION_IDS.map((sectionId) => (
              <LayoutToggle
                key={sectionId}
                testId={`pipeline-overview-layout-toggle-${sectionId}`}
                label={OVERVIEW_SECTION_LABELS[sectionId]}
                visible={isOverviewSectionVisible(overviewLayout, sectionId)}
                onToggle={() =>
                  patchOverviewTabLayout((prev) =>
                    toggleOverviewSectionHidden(prev, sectionId),
                  )
                }
              />
            ))}
            <DropdownMenuSeparator />
            <button
              type="button"
              role="menuitem"
              data-testid="pipeline-overview-layout-reset"
              className={cn(
                "flex w-full min-h-10 items-center px-3 py-2 text-left text-sm text-foreground",
                "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
              )}
              onClick={() => patchOverviewTabLayout(() => resetOverviewTabLayout())}
            >
              Reset to defaults
            </button>
          </DropdownMenu>
        </div>
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      <div
        className={premiumSectionStackClass}
        data-testid="pipeline-deal-info-unified-sections"
      >
        <DealInfoTab
          {...dealInfo}
          embedded
          sectionGroup="identity"
          sectionIncludeFilter={DEAL_INFO_COMMAND_CENTER_SECTION_IDS}
          combineBorrowersGuarantors
          fileInsightsSnapshot={dealInfo.fileInsightsSnapshot ?? overview.fileInsights.snapshot}
        />
        <OverviewTab
          {...overview}
          embedded
          sectionIncludeFilter={DEAL_INFO_OVERVIEW_SECTION_IDS}
          dataTestId="pipeline-deal-info-overview-sections"
        />
        {modularBlocks}
        <DealInfoFeesSections feesSplits={feesSplits} />
      </div>
    </div>
  );
}
