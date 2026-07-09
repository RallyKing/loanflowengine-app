"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Settings2, FileText, Shield, Users, Home, DollarSign, Building2, Landmark, Briefcase } from "lucide-react";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { InlineText } from "@/components/inline";
import {
  AssetsSection,
  HouseholdSection,
  IncomeSection,
} from "@/components/intake/IntakeEditor";
import { DealBorrowersPanel } from "@/components/pipeline/deal/DealBorrowersPanel";
import { DealGuarantorsPanel } from "@/components/pipeline/deal/DealGuarantorsPanel";
import {
  ReoSection,
  BusinessDebtSection,
} from "@/components/intake/IntakeSections2";
import { FieldLabel } from "@/components/pipeline/FieldLabel";
import {
  FileDetailsBlock,
  type FileDetailsBlockProps,
} from "@/components/pipeline/blocks/FileDetailsBlock";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import { useContactFirstBorrowerUpdate } from "@/lib/contacts/borrowerTabWriteAdapter";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import {
  dealInfoSectionsForGroup,
  type DealInfoSectionGroup,
} from "@/lib/pipeline/dealInfoSectionGroups";
import {
  DEFAULT_DEAL_INFO_SECTION_ORDER,
  DEAL_INFO_SECTION_LABELS,
  isDealInfoSectionVisible,
  normalizeDealInfoSectionOrder,
  parseDealInfoLayoutFromUnknown,
  resetDealInfoLayout,
  toggleDealInfoSectionHidden,
  type DealInfoSectionId,
} from "@/lib/file/dealInfoTabLayout";
import { DEAL_TAB_LABELS } from "@/lib/file/dealWorkspaceLayout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import {
  countSectionMeta,
  fileDetailsBlockMeta,
  fileInsightsBlockMeta,
  type CollapsibleBlockBadgeVariant,
} from "@/lib/pipeline/collapsibleBlockMetadata";
import {
  premiumSectionStackClass,
  premiumTabStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";
import { pipelineLicensesHref } from "@/lib/pipeline/routes";
import {
  DEAL_INFO_BUSINESS_DEBT_LABEL,
  DEAL_INFO_TAB_SECTION_IDS,
} from "@/lib/pipeline/fileWorkspaceTabRouting";
import type { PipelineFileInsightsSnapshot } from "@/lib/pipelineFileInsights";

export type DealInfoTabLicensingProps = {
  licenseDisplay: { lo: string; broker: string; loading: boolean };
  dealBacked: boolean;
  onCommitLoNmls: (next: string) => Promise<void>;
  onCommitBrokerNmls: (next: string) => Promise<void>;
};

export type DealInfoTabProps = {
  className?: string;
  fileDetails: FileDetailsBlockProps;
  licensing: DealInfoTabLicensingProps;
  /** When set, only identity or financial sections render (command-center tabs). */
  sectionGroup?: DealInfoSectionGroup;
  /** When set, only these sections render (Deal Info command center). */
  sectionIncludeFilter?: readonly DealInfoSectionId[];
  /** Merge borrowers + guarantors into one accordion block. */
  combineBorrowersGuarantors?: boolean;
  /** Merged into File Details — replaces standalone File Insights block. */
  fileInsightsSnapshot?: PipelineFileInsightsSnapshot | null;
  /** Skip canvas + toolbar when nested in unified Deal Info tab. */
  embedded?: boolean;
  organizationId?: Id<"organizations">;
  memberUserKey?: string;
  contactFileLinks?: Doc<"contactFileLinks">[];
  clientId?: Id<"clients">;
};

const DEAL_INFO_SECTION_DESCRIPTIONS: Partial<
  Record<DealInfoSectionId, ReactNode>
> = {
  fileDetails: "Click any field to edit.",
  borrowers:
    "Contact, identity, and current employment for each borrower on this file.",
  guarantors:
    "Personal guarantors and sponsors for commercial, entity, and hard money files.",
  household: "Dependents counted for underwriting and DTI.",
  income: "Add a row per income stream per borrower (gross, before taxes).",
  assets: "Personal financial statement — assets and liabilities.",
  reo: "Row-by-row summary of every property the borrower owns.",
  businessDebt:
    "Corporate liabilities and MCAs — row-by-row schedule for stacking rules.",
};

function dealInfoAnchorForSection(sectionId: DealInfoSectionId): string {
  return DEAL_INFO_TAB_SECTION_IDS[sectionId];
}

function DealInfoLayoutMenuItem({
  sectionId,
  label,
  visible,
  onToggle,
}: {
  sectionId: DealInfoSectionId;
  label: string;
  visible: boolean;
  onToggle: (sectionId: DealInfoSectionId) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={visible}
      data-testid={`pipeline-deal-info-layout-toggle-${sectionId}`}
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

function DealInfoCollapsibleSection({
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
  description?: ReactNode;
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

export function DealInfoTab({
  className,
  fileDetails,
  licensing,
  sectionGroup = "all",
  sectionIncludeFilter,
  combineBorrowersGuarantors = false,
  fileInsightsSnapshot,
  embedded = false,
  organizationId,
  memberUserKey,
  contactFileLinks,
  clientId,
}: DealInfoTabProps) {
  const { draft, saving, savedAt, isDirty, patchDealInfoTabLayout, fileId } =
    useDealWorkspaceEditor();
  const {
    update: contactFirstUpdate,
    borrowerSaving,
    borrowerSavedAt,
    guarantorSaving,
    guarantorSavedAt,
    incomeSaving,
    incomeSavedAt,
    assetsSaving,
    assetsSavedAt,
    reoSaving,
    reoSavedAt,
    businessDebtSaving,
    businessDebtSavedAt,
    householdSaving,
    householdSavedAt,
  } = useContactFirstBorrowerUpdate();

  const dealInfoLayout = useMemo(
    () => parseDealInfoLayoutFromUnknown(draft?.dealInfoTabLayout),
    [draft?.dealInfoTabLayout],
  );

  const sectionGroupFilter = useMemo(
    () => dealInfoSectionsForGroup(sectionGroup),
    [sectionGroup],
  );

  const allowedSectionIds = sectionIncludeFilter ?? DEFAULT_DEAL_INFO_SECTION_ORDER;

  const visibleSectionIds = useMemo(() => {
    const ordered = dealInfoLayout.order.filter((id) => {
      if (!allowedSectionIds.includes(id)) return false;
      if (!isDealInfoSectionVisible(dealInfoLayout, id)) return false;
      if (sectionGroupFilter && !sectionGroupFilter.has(id)) return false;
      if (combineBorrowersGuarantors && id === "guarantors") return false;
      return true;
    });
    return ordered;
  }, [
    allowedSectionIds,
    combineBorrowersGuarantors,
    dealInfoLayout,
    sectionGroupFilter,
  ]);

  const onToggleSectionVisibility = useCallback(
    (sectionId: DealInfoSectionId) => {
      patchDealInfoTabLayout((prev) =>
        toggleDealInfoSectionHidden(prev, sectionId),
      );
    },
    [patchDealInfoTabLayout],
  );

  const onResetLayout = useCallback(() => {
    patchDealInfoTabLayout(() => resetDealInfoLayout());
  }, [patchDealInfoTabLayout]);

  const onDealInfoDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as DealInfoSectionId;
      const overId = String(over.id) as DealInfoSectionId;
      if (
        !allowedSectionIds.includes(activeId) ||
        !allowedSectionIds.includes(overId)
      ) {
        return;
      }
      if (combineBorrowersGuarantors) {
        if (activeId === "guarantors" || overId === "guarantors") return;
      }

      patchDealInfoTabLayout((prev) => {
        const oldIndex = prev.order.indexOf(activeId);
        const newIndex = prev.order.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return {
          ...prev,
          order: normalizeDealInfoSectionOrder(
            arrayMove(prev.order, oldIndex, newIndex),
          ),
        };
      });
    },
    [allowedSectionIds, combineBorrowersGuarantors, patchDealInfoTabLayout],
  );

  const combinedSaving =
    saving ||
    borrowerSaving ||
    guarantorSaving ||
    incomeSaving ||
    assetsSaving ||
    reoSaving ||
    businessDebtSaving ||
    householdSaving;
  const savedTimes = [
    borrowerSavedAt,
    guarantorSavedAt,
    incomeSavedAt,
    assetsSavedAt,
    reoSavedAt,
    businessDebtSavedAt,
    householdSavedAt,
    savedAt,
  ].filter((t): t is number => t != null);
  const combinedSavedAt = savedTimes.length ? Math.max(...savedTimes) : null;

  const fileDetailsMeta = fileDetailsBlockMeta(
    fileDetails.pipeline,
    fileDetails.fileDetailsLoanAmount,
  );
  const insightsMeta = fileInsightsBlockMeta(fileInsightsSnapshot);

  const renderBorrowersGuarantorsCombined = (headerRight?: ReactNode) => {
    const borrowerMeta = countSectionMeta(
      draft?.borrowers?.length ?? 0,
      "borrower row(s)",
      "Add borrower identity and employment",
    );
    const guarantorMeta = countSectionMeta(
      draft?.guarantors?.length ?? 0,
      "guarantor(s)",
      "Add personal guarantors or sponsors",
    );
    const totalParties =
      (draft?.borrowers?.length ?? 0) + (draft?.guarantors?.length ?? 0);
    return (
      <DealInfoCollapsibleSection
        id={dealInfoAnchorForSection("borrowers")}
        title="Borrowers & guarantors"
        status={totalParties > 0 ? "Configured" : "Draft"}
        summary={
          totalParties > 0
            ? `${borrowerMeta.summary} · ${guarantorMeta.summary}`
            : "Borrowers and personal guarantors on this file"
        }
        indicatorCount={totalParties > 0 ? totalParties : undefined}
        icon={<Users className="h-4 w-4" aria-hidden />}
        description={
          <>
            {DEAL_INFO_SECTION_DESCRIPTIONS.borrowers}{" "}
            {DEAL_INFO_SECTION_DESCRIPTIONS.guarantors}
          </>
        }
        headerRight={headerRight}
      >
        <div className="space-y-3">
          <DealBorrowersPanel
            draft={draft!}
            update={contactFirstUpdate}
            organizationId={organizationId}
            memberUserKey={memberUserKey}
            contactFileLinks={contactFileLinks}
            clientId={clientId}
            fileId={fileId}
          />
          <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
            <DealGuarantorsPanel
              draft={draft!}
              update={contactFirstUpdate}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              contactFileLinks={contactFileLinks}
              fileId={fileId}
            />
          </div>
        </div>
      </DealInfoCollapsibleSection>
    );
  };

  const renderDealInfoSection = (
    sectionId: DealInfoSectionId,
    dragHandle?: ReactNode,
  ) => {
    if (
      combineBorrowersGuarantors &&
      sectionId === "borrowers"
    ) {
      return renderBorrowersGuarantorsCombined(dragHandle);
    }

    const anchorId = dealInfoAnchorForSection(sectionId);
    const headerRight = dragHandle ?? undefined;

    switch (sectionId) {
      case "fileDetails": {
        const status = fileInsightsSnapshot
          ? insightsMeta.status
          : fileDetailsMeta.status;
        const summary = fileInsightsSnapshot
          ? insightsMeta.summary
          : fileDetailsMeta.summary;
        const badgeVariant = fileInsightsSnapshot
          ? insightsMeta.badgeVariant
          : undefined;
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title="File details"
            status={status}
            summary={summary}
            badgeVariant={badgeVariant}
            icon={<FileText className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.fileDetails}
            headerRight={headerRight}
          >
            <FileDetailsBlock
              {...fileDetails}
              fileInsightsSnapshot={fileInsightsSnapshot}
              premiumLayout
            />
          </DealInfoCollapsibleSection>
        );
      }
      case "licensing": {
        const lo = licensing.licenseDisplay.lo?.trim();
        const broker = licensing.licenseDisplay.broker?.trim();
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title="Licensing"
            status={lo || broker ? "Configured" : "Draft"}
            summary={
              lo || broker
                ? `LO: ${lo || "—"} · Broker: ${broker || "—"}`
                : "LO and company NMLS numbers"
            }
            icon={<Shield className="h-4 w-4" aria-hidden />}
            headerRight={headerRight}
            description={
              <>
                <span>
                  LO and company NMLS numbers for this file.
                  {licensing.dealBacked
                    ? " Stored on this file (deal workspace / coversheet)."
                    : " Stored on this pipeline row only."}
                </span>{" "}
                <Link
                  href={pipelineLicensesHref()}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  State license reference (by state)
                </Link>
              </>
            }
          >
            {licensing.licenseDisplay.loading ? (
              <p className="text-xs text-muted-foreground" role="status">
                Loading intake…
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel premium>LO NMLS #</FieldLabel>
                  <div className="text-sm font-semibold text-foreground">
                    <InlineText
                      value={licensing.licenseDisplay.lo}
                      allowEmpty
                      onCommit={licensing.onCommitLoNmls}
                      ariaLabel="Edit LO NMLS number"
                      placeholder="—"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel premium>Company NMLS #</FieldLabel>
                  <div className="text-sm font-semibold text-foreground">
                    <InlineText
                      value={licensing.licenseDisplay.broker}
                      allowEmpty
                      onCommit={licensing.onCommitBrokerNmls}
                      ariaLabel="Edit company NMLS number"
                      placeholder="—"
                    />
                  </div>
                </div>
              </div>
            )}
          </DealInfoCollapsibleSection>
        );
      }
      case "borrowers": {
        const meta = countSectionMeta(
          draft?.borrowers?.length ?? 0,
          "borrower row(s)",
          "Add borrower identity and employment",
        );
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_TAB_LABELS.borrowers}
            status={meta.status}
            summary={meta.summary}
            indicatorCount={meta.indicatorCount}
            badgeVariant={meta.badgeVariant}
            icon={<Users className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.borrowers}
            headerRight={headerRight}
          >
            <DealBorrowersPanel
              draft={draft!}
              update={contactFirstUpdate}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              contactFileLinks={contactFileLinks}
              clientId={clientId}
              fileId={fileId}
            />
          </DealInfoCollapsibleSection>
        );
      }
      case "guarantors": {
        const meta = countSectionMeta(
          draft?.guarantors?.length ?? 0,
          "guarantor(s)",
          "Add personal guarantors or sponsors",
        );
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_TAB_LABELS.guarantors}
            status={meta.status}
            summary={meta.summary}
            indicatorCount={meta.indicatorCount}
            badgeVariant={meta.badgeVariant}
            icon={<Briefcase className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.guarantors}
            headerRight={headerRight}
          >
            <DealGuarantorsPanel
              draft={draft!}
              update={contactFirstUpdate}
              organizationId={organizationId}
              memberUserKey={memberUserKey}
              contactFileLinks={contactFileLinks}
              fileId={fileId}
            />
          </DealInfoCollapsibleSection>
        );
      }
      case "household":
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_TAB_LABELS.household}
            status="Household"
            summary={`${draft?.dependentsCount?.trim() || "—"} dependents`}
            icon={<Home className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.household}
            headerRight={headerRight}
          >
            <HouseholdSection draft={draft!} update={contactFirstUpdate} />
          </DealInfoCollapsibleSection>
        );
      case "income": {
        const meta = countSectionMeta(
          draft?.incomeRows?.length ?? 0,
          "income stream(s)",
          "Add gross income rows per borrower",
        );
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_TAB_LABELS.income}
            status={meta.status}
            summary={meta.summary}
            indicatorCount={meta.indicatorCount}
            badgeVariant={meta.badgeVariant}
            icon={<DollarSign className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.income}
            headerRight={headerRight}
          >
            <IncomeSection draft={draft!} update={contactFirstUpdate} />
          </DealInfoCollapsibleSection>
        );
      }
      case "assets": {
        const assetRows =
          (draft?.assets as { rows?: unknown[] } | undefined)?.rows?.length ??
          0;
        const meta = countSectionMeta(
          assetRows,
          "asset line(s)",
          "Personal financial statement",
        );
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_TAB_LABELS.assets}
            status={meta.status}
            summary={meta.summary}
            indicatorCount={meta.indicatorCount}
            badgeVariant={meta.badgeVariant}
            icon={<Landmark className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.assets}
            headerRight={headerRight}
          >
            <AssetsSection draft={draft!} update={contactFirstUpdate} />
          </DealInfoCollapsibleSection>
        );
      }
      case "reo": {
        const meta = countSectionMeta(
          draft?.reo?.length ?? 0,
          "property row(s)",
          "Schedule of real estate owned",
        );
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_TAB_LABELS.reo}
            status={meta.status}
            summary={meta.summary}
            indicatorCount={meta.indicatorCount}
            badgeVariant={meta.badgeVariant}
            icon={<Building2 className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.reo}
            headerRight={headerRight}
          >
            <ReoSection draft={draft!} update={contactFirstUpdate} />
          </DealInfoCollapsibleSection>
        );
      }
      case "businessDebt": {
        const meta = countSectionMeta(
          draft?.weightedInterest?.length ?? 0,
          "liability row(s)",
          "Corporate debt and MCA schedule",
        );
        return (
          <DealInfoCollapsibleSection
            id={anchorId}
            title={DEAL_INFO_BUSINESS_DEBT_LABEL}
            status={meta.status}
            summary={meta.summary}
            indicatorCount={meta.indicatorCount}
            badgeVariant={meta.badgeVariant}
            icon={<Briefcase className="h-4 w-4" aria-hidden />}
            description={DEAL_INFO_SECTION_DESCRIPTIONS.businessDebt}
            headerRight={headerRight}
          >
            <BusinessDebtSection draft={draft!} update={contactFirstUpdate} />
          </DealInfoCollapsibleSection>
        );
      }
      default:
        return null;
    }
  };

  if (!draft) {
    return (
      <div
        className={cn(
          "flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-dlc-md border border-dashed border-border/70 bg-dlc-surface-high/40 px-4 py-10",
          className,
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="pipeline-deal-info-tab-loading"
      >
        <span
          className="inline-block h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/20 border-t-primary motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">Loading deal info…</p>
      </div>
    );
  }

  const sectionsBody =
    visibleSectionIds.length > 0 ? (
      <SortableSectionList
        itemIds={visibleSectionIds}
        onDragEnd={onDealInfoDragEnd}
      >
        <div
          className={premiumSectionStackClass}
          aria-label="Deal info sections"
        >
          {visibleSectionIds.map((sectionId) => (
            <SortableSectionItem key={sectionId} id={sectionId}>
              {(dragHandle) => renderDealInfoSection(sectionId, dragHandle)}
            </SortableSectionItem>
          ))}
        </div>
      </SortableSectionList>
    ) : null;

  if (embedded) {
    return (
      <div
        className={cn("min-w-0", className)}
        data-testid="pipeline-deal-info-tab-sections"
      >
        {sectionsBody}
      </div>
    );
  }

  return (
    <div
      className={cn(
        premiumWorkspaceCanvasClass,
        "flex min-w-0 flex-col",
        premiumTabStackClass,
        className,
      )}
      data-testid="pipeline-deal-info-tab"
    >
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-0.5 pb-1"
        data-testid="pipeline-deal-info-tab-toolbar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu
            aria-label="Deal Info layout settings"
            align="start"
            className="min-w-[14rem]"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
                data-testid="pipeline-deal-info-layout-control"
                aria-label="Deal Info layout settings"
              >
                <Settings2 className="h-4 w-4" aria-hidden />
              </Button>
            }
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Section visibility
            </div>
            <DropdownMenuSeparator />
            {allowedSectionIds.map((sectionId) => (
              <DealInfoLayoutMenuItem
                key={sectionId}
                sectionId={sectionId}
                label={DEAL_INFO_SECTION_LABELS[sectionId]}
                visible={isDealInfoSectionVisible(dealInfoLayout, sectionId)}
                onToggle={onToggleSectionVisibility}
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
        </div>
        <DealWorkspaceSaveStatus
          saving={combinedSaving}
          savedAt={combinedSavedAt}
          isDirty={isDirty}
        />
      </div>

      {sectionsBody}
    </div>
  );
}
