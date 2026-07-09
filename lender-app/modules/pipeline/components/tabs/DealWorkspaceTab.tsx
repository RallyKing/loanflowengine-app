"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Settings2, Building2, Calculator, DollarSign, Hammer, Scale, Sparkles } from "lucide-react";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { DealWorkspaceAiProvider } from "@/components/intake/DealWorkspaceAiContext";
import {
  ComparisonSection,
  DayCounterSection,
  DtiSection,
  PayoffSection,
  ScenarioSection,
  WeightedInterestSection,
} from "@/components/intake/IntakeSections2";
import {
  CommercialSection,
  FeesSection as IntakeFeesClosingSection,
  HardMoneySection,
} from "@/components/intake/IntakeSectionsBiz";
import {
  FeesSplitsBlock,
  type FeesSplitsBlockProps,
} from "@/components/pipeline/blocks/FeesSplitsBlock";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import { PipelineScenarioMatch } from "@/components/PipelineScenarioMatch";
import { Button as UiButton } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { cn } from "@/lib/cn";
import {
  DEAL_ANALYSIS_SECTION_LABELS,
  DEFAULT_DEAL_ANALYSIS_ORDER,
  isDealAnalysisSectionVisible,
  parseDealAnalysisLayoutFromUnknown,
  resetDealAnalysisLayout,
  toggleDealAnalysisSectionHidden,
  type DealAnalysisLayoutV1,
  type DealAnalysisSectionId,
} from "@/lib/file/dealAnalysisLayoutStorage";
import { DEAL_TAB_LABELS } from "@/lib/file/dealWorkspaceLayout";
import {
  DEAL_WORKSPACE_TAB3_SECTION_LABELS,
  DEFAULT_DEAL_WORKSPACE_TAB3_SECTION_ORDER,
  isDealWorkspaceTab3SectionVisible,
  parseDealWorkspaceTab3LayoutFromUnknown,
  resetDealWorkspaceTab3Layout,
  toggleDealWorkspaceTab3SectionHidden,
  type DealWorkspaceTab3LayoutV1,
  type DealWorkspaceTab3SectionId,
} from "@/lib/file/dealWorkspaceTab3Layout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import { resolvePipelineTableFundingAmount } from "@/lib/pipeline/resolvePipelineTableFundingAmount";
import {
  DEAL_INFO_TAB_SECTION_IDS,
  DEAL_WORKSPACE_CALCULATOR_ANCHOR_EVENT,
  DEAL_WORKSPACE_CALCULATOR_SECTION_IDS,
  DEAL_WORKSPACE_SUB_TAB_LABELS,
  DEAL_WORKSPACE_WORKSPACE_ANCHOR_EVENT,
  DEAL_WORKSPACE_WORKSPACE_SECTION_IDS,
  dealWorkspaceCalculatorAnchorFromHash,
  isDealWorkspaceCalculatorAnchor,
  isDealWorkspaceWorkspaceAnchor,
  type DealWorkspaceSubTabId,
} from "@/lib/pipeline/fileWorkspaceTabRouting";
import {
  commercialMetricsMeta,
  dtiBlockMeta,
  type CollapsibleBlockBadgeVariant,
} from "@/lib/pipeline/collapsibleBlockMetadata";
import {
  premiumSectionStackClass,
  premiumTabStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

function resolveInitialDealWorkspaceSubTab(): DealWorkspaceSubTabId {
  if (typeof window === "undefined") return "workspace";
  return dealWorkspaceCalculatorAnchorFromHash() ? "calculators" : "workspace";
}

function resolveInitialPendingCalculatorAnchor(): string | null {
  if (typeof window === "undefined") return null;
  return dealWorkspaceCalculatorAnchorFromHash();
}

function scrollBehaviorForAnchorNavigation(): ScrollBehavior {
  if (typeof document === "undefined") return "auto";
  return document.documentElement.getAttribute("data-reduce-motion") === "true"
    ? "auto"
    : "smooth";
}

/** Sections relocated to Deal Info or Portals command-center tabs. */
export const REALLOCATED_DEAL_WORKSPACE_SECTION_IDS = [
  "fees",
  "feesSplits",
  "scenariomatch",
] as const satisfies readonly DealWorkspaceTab3SectionId[];

export type DealWorkspaceTabProps = {
  className?: string;
  /** Jump to a Deal Info tab section (e.g. business debt schedule). */
  onOpenDealInfoSection?: (anchorId: string) => void;
  /** Pipeline lender/broker/net fees + splits (Phase 37.13.E). */
  feesSplits?: FeesSplitsBlockProps;
  /** Hide sections shown on other command-center tabs. */
  workspaceSectionExcludeFilter?: readonly DealWorkspaceTab3SectionId[];
};

/** Gear menu display order — Sub-Tab A (Phase 37.3.F.5 spec). */
const TAB3_LAYOUT_MENU_ORDER: DealWorkspaceTab3SectionId[] = [
  "commercial",
  "fees",
  "feesSplits",
  "hardmoney",
  "scenariomatch",
];

/** Live calculators first (F.8), then pending placeholders in registry order. */
const CALCULATOR_FRAME_ORDER: DealAnalysisSectionId[] = [
  "dti",
  "daycounter",
  "comparison",
  "weighted",
  "payoff",
];

const CALCULATOR_SECTION_DESCRIPTIONS: Record<DealAnalysisSectionId, string> = {
  dti: "Front / back ratios from income, housing, and consumer debts.",
  comparison: "Current vs proposed loan side-by-side.",
  weighted: "Blended rate sandbox — separate from the Tab 2 business debt schedule.",
  payoff: "Amortization with optional extra payments.",
  daycounter: "Business-day and calendar math between key dates.",
};

function WeightedInterestSandboxCallout({
  onOpenBusinessDebt,
}: {
  onOpenBusinessDebt?: () => void;
}) {
  return (
    <div
      className="rounded-dlc-md border border-border/70 bg-dlc-surface-high/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
      role="note"
      data-testid="pipeline-deal-workspace-weighted-sandbox-callout"
    >
      <span aria-hidden>💡 </span>
      This tool is an analysis sandbox for calculating blended interest rates. To
      update the file&apos;s underwriting liabilities, use the authoritative{" "}
      {onOpenBusinessDebt ? (
        <button
          type="button"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={onOpenBusinessDebt}
        >
          Schedule of Business Debt
        </button>
      ) : (
        "Schedule of Business Debt"
      )}{" "}
      inside Tab 2 (Deal Info).
    </div>
  );
}

function DealWorkspaceCollapsibleSection({
  id,
  title,
  status,
  summary,
  description,
  icon,
  indicatorCount,
  badgeVariant,
  headerRight,
  children,
}: {
  id: string;
  title: string;
  status: string;
  summary: string;
  description?: string;
  icon?: ReactNode;
  indicatorCount?: number;
  badgeVariant?: CollapsibleBlockBadgeVariant;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CollapsibleBlock
      id={id}
      title={title}
      status={status}
      summary={summary}
      icon={icon}
      indicatorCount={indicatorCount}
      badgeVariant={badgeVariant}
      headerRight={headerRight}
      lazyMount
      animated
      description={description}
      contentClassName="space-y-4"
    >
      {children}
    </CollapsibleBlock>
  );
}

function DealWorkspaceLayoutMenuItem({
  sectionId,
  label,
  visible,
  onToggle,
  testIdPrefix,
}: {
  sectionId: string;
  label: string;
  visible: boolean;
  onToggle: (sectionId: string) => void;
  testIdPrefix: "tab3" | "calc";
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={visible}
      data-testid={`pipeline-deal-workspace-layout-toggle-${testIdPrefix}-${sectionId}`}
      className={cn(
        "flex w-full min-h-10 items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground",
        "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
      )}
      onClick={() => onToggle(sectionId)}
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

function DealWorkspaceSubNav({
  activeSubTab,
  onActiveSubTabChange,
  tab3Layout,
  onToggleTab3Section,
  analysisLayout,
  onToggleAnalysisSection,
  onResetLayout,
}: {
  activeSubTab: DealWorkspaceSubTabId;
  onActiveSubTabChange: (tab: DealWorkspaceSubTabId) => void;
  tab3Layout: DealWorkspaceTab3LayoutV1;
  onToggleTab3Section: (sectionId: DealWorkspaceTab3SectionId) => void;
  analysisLayout: DealAnalysisLayoutV1;
  onToggleAnalysisSection: (sectionId: DealAnalysisSectionId) => void;
  onResetLayout: () => void;
}) {
  const subTabs: DealWorkspaceSubTabId[] = ["workspace", "calculators"];
  const calculatorsActive = activeSubTab === "calculators";

  return (
    <div
      className={cn(
        "sticky top-[2.5625rem] z-30 -mx-1 border-b border-border/70 bg-background/95 px-1 backdrop-blur-sm",
        "supports-[backdrop-filter]:bg-background/80",
      )}
      data-testid="pipeline-deal-workspace-subnav"
    >
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          className="flex min-w-0 shrink-0 items-center gap-0.5"
          role="tablist"
          aria-label="Deal workspace views"
        >
          {subTabs.map((subTabId) => {
            const selected = activeSubTab === subTabId;
            return (
              <button
                key={subTabId}
                type="button"
                role="tab"
                id={`pipeline-deal-workspace-subtab-${subTabId}`}
                aria-selected={selected}
                aria-controls={`pipeline-deal-workspace-subpanel-${subTabId}`}
                data-testid={`pipeline-deal-workspace-subtab-${subTabId}`}
                onClick={() => onActiveSubTabChange(subTabId)}
                className={cn(
                  "shrink-0 rounded-t-dlc-sm px-2.5 py-1.5 text-xs font-semibold transition-colors duration-dlc-short ease-dlc-standard sm:px-3 sm:py-2 sm:text-sm",
                  "min-h-[2.25rem] touch-manipulation",
                  selected
                    ? "border-b-2 border-primary bg-dlc-surface-high text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {DEAL_WORKSPACE_SUB_TAB_LABELS[subTabId]}
              </button>
            );
          })}
        </div>

        <DropdownMenu
          aria-label="Inline layout defaults"
          align="start"
          className="min-w-[14rem]"
          trigger={
            <UiButton
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
              data-testid="pipeline-deal-workspace-layout-control"
              aria-label="Inline layout defaults"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </UiButton>
          }
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {calculatorsActive ? "Calculator visibility" : "Inline layout defaults"}
          </div>
          <DropdownMenuSeparator />
          {calculatorsActive
            ? DEFAULT_DEAL_ANALYSIS_ORDER.map((sectionId) => (
                <DealWorkspaceLayoutMenuItem
                  key={sectionId}
                  sectionId={sectionId}
                  label={DEAL_ANALYSIS_SECTION_LABELS[sectionId]}
                  visible={isDealAnalysisSectionVisible(
                    analysisLayout,
                    sectionId,
                  )}
                  onToggle={(id) =>
                    onToggleAnalysisSection(id as DealAnalysisSectionId)
                  }
                  testIdPrefix="calc"
                />
              ))
            : TAB3_LAYOUT_MENU_ORDER.map((sectionId) => (
                <DealWorkspaceLayoutMenuItem
                  key={sectionId}
                  sectionId={sectionId}
                  label={DEAL_WORKSPACE_TAB3_SECTION_LABELS[sectionId]}
                  visible={isDealWorkspaceTab3SectionVisible(
                    tab3Layout,
                    sectionId,
                  )}
                  onToggle={(id) =>
                    onToggleTab3Section(id as DealWorkspaceTab3SectionId)
                  }
                  testIdPrefix="tab3"
                />
              ))}
          <DropdownMenuSeparator />
          <button
            type="button"
            role="menuitem"
            data-testid="pipeline-deal-workspace-layout-reset"
            className={cn(
              "flex w-full min-h-10 items-center px-3 py-2 text-left text-sm text-foreground",
              "transition-colors duration-dlc-short ease-dlc-standard hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
            )}
            onClick={onResetLayout}
          >
            Reset to defaults
          </button>
        </DropdownMenu>
      </div>
    </div>
  );
}

function DealWorkspaceScenariosLenderMatchSection() {
  const { fileId, draft, update, dealBundle } = useDealWorkspaceEditor();
  const pipeline = dealBundle?.pipeline;

  const fundingAmount = useMemo(
    () =>
      draft && pipeline
        ? resolvePipelineTableFundingAmount(draft, pipeline)
        : 0,
    [draft, pipeline],
  );

  const attachedLenderIds = useMemo(
    () => new Set(pipeline?.lenders ?? []),
    [pipeline?.lenders],
  );

  if (!draft || !pipeline) {
    return (
      <div className="rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Loading scenario workspace…
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col", premiumTabStackClass)}>
      <ScenarioSection draft={draft} update={update} />
      <PipelineScenarioMatch
        embedded
        fileId={fileId}
        fileUpdatedAt={pipeline.updatedAt}
        fundingAmount={fundingAmount}
        scenarioText={pipeline.scenario}
        criteria={pipeline.scenarioCriteria}
        attachedLenderIds={attachedLenderIds}
      />
    </div>
  );
}

function DealWorkspaceWorkspaceFrame({
  feesSplits,
  workspaceSectionExcludeFilter,
}: {
  feesSplits?: FeesSplitsBlockProps;
  workspaceSectionExcludeFilter?: readonly DealWorkspaceTab3SectionId[];
}) {
  const { draft, update, saving, savedAt, isDirty, patchDealWorkspaceTab3Layout } =
    useDealWorkspaceEditor();

  const tab3Layout = useMemo(
    () => parseDealWorkspaceTab3LayoutFromUnknown(draft?.dealWorkspaceTab3Layout),
    [draft?.dealWorkspaceTab3Layout],
  );

  const isWorkspaceSectionVisible = useCallback(
    (sectionId: DealWorkspaceTab3SectionId) => {
      if (sectionId === "feesSplits" && !feesSplits) return false;
      return isDealWorkspaceTab3SectionVisible(tab3Layout, sectionId);
    },
    [feesSplits, tab3Layout],
  );

  const visibleSectionIds = useMemo(
    () =>
      tab3Layout.order.filter((id) => {
        if (workspaceSectionExcludeFilter?.includes(id)) return false;
        return isWorkspaceSectionVisible(id);
      }),
    [tab3Layout.order, isWorkspaceSectionVisible, workspaceSectionExcludeFilter],
  );

  const onWorkspaceDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as DealWorkspaceTab3SectionId;
      const overId = String(over.id) as DealWorkspaceTab3SectionId;

      patchDealWorkspaceTab3Layout((prev) => {
        const oldIndex = prev.order.indexOf(activeId);
        const newIndex = prev.order.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return {
          ...prev,
          order: arrayMove(prev.order, oldIndex, newIndex),
        };
      });
    },
    [patchDealWorkspaceTab3Layout],
  );

  if (!draft) {
    return (
      <div
        className="min-w-0 px-1 py-8 text-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        data-testid="pipeline-deal-workspace-frame-workspace-loading"
      >
        Loading deal workspace…
      </div>
    );
  }

  const allWorkspaceSectionsHidden =
    DEFAULT_DEAL_WORKSPACE_TAB3_SECTION_ORDER.every(
      (id) => !isWorkspaceSectionVisible(id),
    );

  const renderWorkspaceSection = (
    sectionId: DealWorkspaceTab3SectionId,
    dragHandle: ReactNode,
  ) => {
    switch (sectionId) {
      case "hardmoney":
        return (
          <DealWorkspaceCollapsibleSection
            id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.hardMoneyRehab}
            title={DEAL_TAB_LABELS.hardmoney}
            status="Workspace"
            summary="Bridge, fix-and-flip, and rehab budget math"
            icon={<Hammer className="h-4 w-4" aria-hidden />}
            description="Bridge, fix-and-flip, and rehab budget math with line-item scope."
            headerRight={dragHandle}
          >
            <div className="min-w-0 max-w-full">
              <HardMoneySection draft={draft} update={update} />
            </div>
          </DealWorkspaceCollapsibleSection>
        );
      case "commercial": {
        const commercialMeta = commercialMetricsMeta(draft);
        return (
          <DealWorkspaceCollapsibleSection
            id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.commercialDscr}
            title="Financial metrics"
            status={commercialMeta.status}
            summary={commercialMeta.summary}
            badgeVariant={commercialMeta.badgeVariant}
            icon={<Building2 className="h-4 w-4" aria-hidden />}
            description="Commercial underwriting, rent roll, OpEx, and DSCR / LTV math."
            headerRight={dragHandle}
          >
            <CommercialSection draft={draft} update={update} />
          </DealWorkspaceCollapsibleSection>
        );
      }
      case "scenariomatch":
        return (
          <DealWorkspaceCollapsibleSection
            id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.scenariosLenderMatch}
            title={DEAL_WORKSPACE_TAB3_SECTION_LABELS.scenariomatch}
            status="Modeling"
            summary="Scenario criteria and lender attach tooling"
            icon={<Sparkles className="h-4 w-4" aria-hidden />}
            description="Scenario modeling, saved match criteria, and lender attach tooling."
            headerRight={dragHandle}
          >
            <DealWorkspaceScenariosLenderMatchSection />
          </DealWorkspaceCollapsibleSection>
        );
      case "feesSplits":
        return feesSplits ? (
          <DealWorkspaceCollapsibleSection
            id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesSplits}
            title={DEAL_WORKSPACE_TAB3_SECTION_LABELS.feesSplits}
            status="Splits"
            summary="Percent of loan plus optional outside fee"
            icon={<DollarSign className="h-4 w-4" aria-hidden />}
            description="Percent of loan plus optional outside fee. Totals update when the loan or inputs change."
            headerRight={dragHandle}
          >
            <FeesSplitsBlock {...feesSplits} />
          </DealWorkspaceCollapsibleSection>
        ) : null;
      case "fees":
        return (
          <DealWorkspaceCollapsibleSection
            id={DEAL_WORKSPACE_WORKSPACE_SECTION_IDS.feesClosing}
            title={DEAL_TAB_LABELS.fees}
            status="Closing"
            summary="Broker, lender, third-party, prepaids, and totals"
            icon={<Scale className="h-4 w-4" aria-hidden />}
            description="Broker, lender, third-party, prepaids, and total estimated closing fees."
            headerRight={dragHandle}
          >
            <IntakeFeesClosingSection draft={draft} update={update} />
          </DealWorkspaceCollapsibleSection>
        );
      default:
        return null;
    }
  };

  return (
    <div
      id="pipeline-deal-workspace-subpanel-workspace"
      role="tabpanel"
      aria-labelledby="pipeline-deal-workspace-subtab-workspace"
      className="min-w-0"
      data-testid="pipeline-deal-workspace-frame-workspace"
    >
      <div
        className={cn(
          premiumWorkspaceCanvasClass,
          premiumSectionStackClass,
          "pt-3 sm:pt-4",
        )}
      >
      <div className="flex min-w-0 justify-end px-0.5">
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      {allWorkspaceSectionsHidden ? (
        <div
          className="rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-8 text-center"
          data-testid="pipeline-deal-workspace-all-sections-hidden"
        >
          <p className="text-sm font-medium text-foreground">
            All workspace sections are hidden
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the layout gear to show Hard Money, Commercial, Scenarios &amp;
            Lender Match, Fees &amp; splits, or Fees &amp; Closing.
          </p>
        </div>
      ) : (
        <SortableSectionList
          itemIds={visibleSectionIds}
          onDragEnd={onWorkspaceDragEnd}
        >
          <div className={premiumSectionStackClass}>
            {visibleSectionIds.map((sectionId) => (
              <SortableSectionItem key={sectionId} id={sectionId}>
                {(dragHandle) => renderWorkspaceSection(sectionId, dragHandle)}
              </SortableSectionItem>
            ))}
          </div>
        </SortableSectionList>
      )}
      </div>
    </div>
  );
}

function DealWorkspaceCalculatorsFrame({
  isAnalysisSectionVisible,
  onOpenDealInfoSection,
}: {
  isAnalysisSectionVisible: (sectionId: DealAnalysisSectionId) => boolean;
  onOpenDealInfoSection?: (anchorId: string) => void;
}) {
  const { fileId, draft, update, saving, savedAt, isDirty, patchDealAnalysisLayout } =
    useDealWorkspaceEditor();

  const analysisLayout = useMemo(
    () => parseDealAnalysisLayoutFromUnknown(draft?.dealAnalysisLayout),
    [draft?.dealAnalysisLayout],
  );

  const visibleSectionIds = useMemo(
    () => analysisLayout.order.filter((id) => isAnalysisSectionVisible(id)),
    [analysisLayout.order, isAnalysisSectionVisible],
  );

  const onCalculatorDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as DealAnalysisSectionId;
      const overId = String(over.id) as DealAnalysisSectionId;

      patchDealAnalysisLayout((prev) => {
        const oldIndex = prev.order.indexOf(activeId);
        const newIndex = prev.order.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return {
          ...prev,
          order: arrayMove(prev.order, oldIndex, newIndex),
        };
      });
    },
    [patchDealAnalysisLayout],
  );

  if (!draft) {
    return (
      <div
        className="min-w-0 px-1 py-8 text-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        data-testid="pipeline-deal-workspace-frame-calculators-loading"
      >
        Loading calculators…
      </div>
    );
  }

  const allCalculatorsHidden =
    DEFAULT_DEAL_ANALYSIS_ORDER.every((id) => !isAnalysisSectionVisible(id));

  const sectionProps = {
    draft,
    update,
    analysisWorkspaceNested: true as const,
  };

  const renderCalculatorSection = (
    sectionId: DealAnalysisSectionId,
    dragHandle: ReactNode,
  ) => {
    const anchorId = DEAL_WORKSPACE_CALCULATOR_SECTION_IDS[sectionId];
    const title = DEAL_ANALYSIS_SECTION_LABELS[sectionId];
    const description = CALCULATOR_SECTION_DESCRIPTIONS[sectionId];

    if (sectionId === "dti") {
      const dtiMeta = dtiBlockMeta(draft);
      return (
        <DealWorkspaceCollapsibleSection
          id={anchorId}
          title={title}
          status={dtiMeta.status}
          summary={dtiMeta.summary}
          badgeVariant={dtiMeta.badgeVariant}
          icon={<Calculator className="h-4 w-4" aria-hidden />}
          description={description}
          headerRight={dragHandle}
        >
          <DealWorkspaceAiProvider fileId={fileId}>
            <DtiSection {...sectionProps} />
          </DealWorkspaceAiProvider>
        </DealWorkspaceCollapsibleSection>
      );
    }

    if (sectionId === "daycounter") {
      return (
        <DealWorkspaceCollapsibleSection
          id={anchorId}
          title={title}
          status="Tool"
          summary="Business-day and calendar math between dates"
          icon={<Calculator className="h-4 w-4" aria-hidden />}
          description={description}
          headerRight={dragHandle}
        >
          <DayCounterSection {...sectionProps} />
        </DealWorkspaceCollapsibleSection>
      );
    }

    if (sectionId === "comparison") {
      return (
        <DealWorkspaceCollapsibleSection
          id={anchorId}
          title={title}
          status="Compare"
          summary="Current vs proposed loan side-by-side"
          icon={<Calculator className="h-4 w-4" aria-hidden />}
          description={description}
          headerRight={dragHandle}
        >
          <ComparisonSection {...sectionProps} />
        </DealWorkspaceCollapsibleSection>
      );
    }

    if (sectionId === "payoff") {
      return (
        <DealWorkspaceCollapsibleSection
          id={anchorId}
          title={title}
          status="Amortize"
          summary="Amortization with optional extra payments"
          icon={<Calculator className="h-4 w-4" aria-hidden />}
          description={description}
          headerRight={dragHandle}
        >
          <div className="block min-w-0 max-w-full">
            <PayoffSection {...sectionProps} />
          </div>
        </DealWorkspaceCollapsibleSection>
      );
    }

    if (sectionId === "weighted") {
      return (
        <DealWorkspaceCollapsibleSection
          id={anchorId}
          title={title}
          status="Sandbox"
          summary="Blended rate analysis — separate from business debt schedule"
          icon={<Calculator className="h-4 w-4" aria-hidden />}
          description={description}
          headerRight={dragHandle}
        >
          <WeightedInterestSandboxCallout
            onOpenBusinessDebt={
              onOpenDealInfoSection
                ? () =>
                    onOpenDealInfoSection(
                      DEAL_INFO_TAB_SECTION_IDS.businessDebt,
                    )
                : undefined
            }
          />
          <div className="block min-w-0 max-w-full">
            <WeightedInterestSection {...sectionProps} />
          </div>
        </DealWorkspaceCollapsibleSection>
      );
    }

    return null;
  };

  return (
    <div
      id="pipeline-deal-workspace-subpanel-calculators"
      role="tabpanel"
      aria-labelledby="pipeline-deal-workspace-subtab-calculators"
      className="min-w-0"
      data-testid="pipeline-deal-workspace-frame-calculators"
    >
      <div
        className={cn(
          premiumWorkspaceCanvasClass,
          premiumSectionStackClass,
          "pt-3 sm:pt-4",
        )}
      >
      <div className="flex min-w-0 justify-end px-0.5">
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      {allCalculatorsHidden ? (
        <div
          className="rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-8 text-center"
          data-testid="pipeline-deal-workspace-all-calculators-hidden"
        >
          <p className="text-sm font-medium text-foreground">
            All calculators are hidden
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the layout gear to show DTI, Day Counter, or other tools.
          </p>
        </div>
      ) : (
        <SortableSectionList
          itemIds={visibleSectionIds}
          onDragEnd={onCalculatorDragEnd}
        >
          <div className={premiumSectionStackClass}>
            {visibleSectionIds.map((sectionId) => (
              <SortableSectionItem key={sectionId} id={sectionId}>
                {(dragHandle) => renderCalculatorSection(sectionId, dragHandle)}
              </SortableSectionItem>
            ))}
          </div>
        </SortableSectionList>
      )}
      </div>
    </div>
  );
}

export function DealWorkspaceTab({
  className,
  onOpenDealInfoSection,
  feesSplits,
  workspaceSectionExcludeFilter,
}: DealWorkspaceTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<DealWorkspaceSubTabId>(
    resolveInitialDealWorkspaceSubTab,
  );
  const [pendingCalculatorAnchor, setPendingCalculatorAnchor] = useState<
    string | null
  >(resolveInitialPendingCalculatorAnchor);
  const [pendingWorkspaceAnchor, setPendingWorkspaceAnchor] = useState<
    string | null
  >(null);
  const { draft, update, patchDealWorkspaceTab3Layout } = useDealWorkspaceEditor();

  const queueWorkspaceAnchor = useCallback((anchorId: string) => {
    if (!isDealWorkspaceWorkspaceAnchor(anchorId)) return;
    setActiveSubTab("workspace");
    setPendingWorkspaceAnchor(anchorId);
  }, []);

  const queueCalculatorAnchor = useCallback((anchorId: string) => {
    if (!isDealWorkspaceCalculatorAnchor(anchorId)) return;
    setActiveSubTab("calculators");
    setPendingCalculatorAnchor(anchorId);
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const anchor = dealWorkspaceCalculatorAnchorFromHash();
      if (anchor) queueCalculatorAnchor(anchor);
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [queueCalculatorAnchor]);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const anchorId = (event as CustomEvent<{ anchorId: string }>).detail
        ?.anchorId;
      if (anchorId) queueCalculatorAnchor(anchorId);
    };
    window.addEventListener(DEAL_WORKSPACE_CALCULATOR_ANCHOR_EVENT, onNavigate);
    return () =>
      window.removeEventListener(
        DEAL_WORKSPACE_CALCULATOR_ANCHOR_EVENT,
        onNavigate,
      );
  }, [queueCalculatorAnchor]);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const anchorId = (event as CustomEvent<{ anchorId: string }>).detail
        ?.anchorId;
      if (anchorId) queueWorkspaceAnchor(anchorId);
    };
    window.addEventListener(DEAL_WORKSPACE_WORKSPACE_ANCHOR_EVENT, onNavigate);
    return () =>
      window.removeEventListener(
        DEAL_WORKSPACE_WORKSPACE_ANCHOR_EVENT,
        onNavigate,
      );
  }, [queueWorkspaceAnchor]);

  useEffect(() => {
    if (activeSubTab !== "calculators" || !pendingCalculatorAnchor || !draft) {
      return;
    }

    const anchorId = pendingCalculatorAnchor;
    const behavior = scrollBehaviorForAnchorNavigation();
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 16;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior, block: "start" });
        setPendingCalculatorAnchor(null);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.requestAnimationFrame(tryScroll);
      } else {
        setPendingCalculatorAnchor(null);
      }
    };

    const raf = window.requestAnimationFrame(tryScroll);
    const timeout = window.setTimeout(tryScroll, 320);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [activeSubTab, pendingCalculatorAnchor, draft]);

  useEffect(() => {
    if (activeSubTab !== "workspace" || !pendingWorkspaceAnchor) {
      return;
    }

    const anchorId = pendingWorkspaceAnchor;
    const behavior = scrollBehaviorForAnchorNavigation();
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 16;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior, block: "start" });
        setPendingWorkspaceAnchor(null);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.requestAnimationFrame(tryScroll);
      } else {
        setPendingWorkspaceAnchor(null);
      }
    };

    const raf = window.requestAnimationFrame(tryScroll);
    const timeout = window.setTimeout(tryScroll, 320);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [activeSubTab, pendingWorkspaceAnchor, feesSplits]);

  const tab3Layout = useMemo(
    () => parseDealWorkspaceTab3LayoutFromUnknown(draft?.dealWorkspaceTab3Layout),
    [draft?.dealWorkspaceTab3Layout],
  );

  const analysisLayout = useMemo(
    () => parseDealAnalysisLayoutFromUnknown(draft?.dealAnalysisLayout),
    [draft?.dealAnalysisLayout],
  );

  const isAnalysisSectionVisible = useCallback(
    (sectionId: DealAnalysisSectionId) =>
      isDealAnalysisSectionVisible(analysisLayout, sectionId),
    [analysisLayout],
  );

  const onToggleTab3Section = useCallback(
    (sectionId: DealWorkspaceTab3SectionId) => {
      if (!draft) return;
      patchDealWorkspaceTab3Layout((prev) =>
        toggleDealWorkspaceTab3SectionHidden(prev, sectionId),
      );
    },
    [draft, patchDealWorkspaceTab3Layout],
  );

  const onToggleAnalysisSection = useCallback(
    (sectionId: DealAnalysisSectionId) => {
      if (!draft) return;
      const next = toggleDealAnalysisSectionHidden(analysisLayout, sectionId);
      update("dealAnalysisLayout", next as never);
    },
    [analysisLayout, draft, update],
  );

  const onResetLayout = useCallback(() => {
    if (!draft) return;
    if (activeSubTab === "calculators") {
      update("dealAnalysisLayout", resetDealAnalysisLayout() as never);
    } else {
      patchDealWorkspaceTab3Layout(resetDealWorkspaceTab3Layout());
    }
  }, [activeSubTab, draft, patchDealWorkspaceTab3Layout, update]);

  return (
    <div
      className={cn("min-w-0", className)}
      data-testid="pipeline-deal-workspace-tab"
    >
      <DealWorkspaceSubNav
        activeSubTab={activeSubTab}
        onActiveSubTabChange={setActiveSubTab}
        tab3Layout={tab3Layout}
        onToggleTab3Section={onToggleTab3Section}
        analysisLayout={analysisLayout}
        onToggleAnalysisSection={onToggleAnalysisSection}
        onResetLayout={onResetLayout}
      />

      {activeSubTab === "workspace" ? (
        <DealWorkspaceWorkspaceFrame
          feesSplits={feesSplits}
          workspaceSectionExcludeFilter={workspaceSectionExcludeFilter}
        />
      ) : (
        <DealWorkspaceCalculatorsFrame
          isAnalysisSectionVisible={isAnalysisSectionVisible}
          onOpenDealInfoSection={onOpenDealInfoSection}
        />
      )}
    </div>
  );
}
