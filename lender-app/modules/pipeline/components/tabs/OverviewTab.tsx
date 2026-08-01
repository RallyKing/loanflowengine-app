"use client";

import { useCallback, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useOrgMemberQueryArgs } from "@/lib/convex/useStableConvexArgs";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { Settings2, BookOpen, ClipboardList, Lightbulb, StickyNote, Users } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuSeparator,
} from "@/components/ui/DropdownMenu";
import { FileNotesBlock } from "@/components/pipeline/blocks/FileNotesBlock";
import { FileTasksBlock } from "@/components/pipeline/blocks/FileTasksBlock";
import {
  FileLendersBlock,
  type FileLendersBlockProps,
} from "@/components/pipeline/blocks/FileLendersBlock";
import { PipelineFileInsightsPanel } from "@/components/PipelineFileInsightsPanel";
import {
  SortableSectionItem,
  SortableSectionList,
} from "@/components/pipeline/workspace/SortableSectionList";
import { cn } from "@/lib/cn";
import {
  collapseAllOverviewSections,
  expandAllOverviewSections,
  isOverviewSectionExpanded,
  isOverviewSectionVisible,
  normalizeOverviewSectionOrder,
  OVERVIEW_SECTION_IDS,
  OVERVIEW_SECTION_LABELS,
  parseOverviewTabLayoutFromUnknown,
  resetOverviewTabLayout,
  setOverviewSectionExpanded,
  toggleOverviewSectionHidden,
  type OverviewSectionId,
} from "@/lib/file/overviewTabLayout";
import type { RegisterCommandCenterSections } from "@/lib/file/commandCenterSectionRegistry";
import type {
  CommandCenterSectionRenderer,
  DealInfoCommandCenterSectionId,
} from "@/lib/file/dealInfoCommandCenterLayout";
import {
  DealWorkspaceSaveStatus,
  useDealWorkspaceEditor,
} from "@/lib/file/useDealWorkspaceEditor";
import type { FileTaskCreatePayload } from "@/lib/inFileTaskTriageUi";
import type { PipelineBlockId } from "@/lib/pipelineBlockRegistry";
import type { PipelineFileInsightsSnapshot } from "@/lib/pipelineFileInsights";
import { OVERVIEW_TAB_SECTION_IDS } from "@/lib/pipeline/fileWorkspaceTabRouting";
import {
  fileInsightsBlockMeta,
  tasksBlockMeta,
  type CollapsibleBlockBadgeVariant,
} from "@/lib/pipeline/collapsibleBlockMetadata";
import {
  premiumSectionStackClass,
  premiumTabStackClass,
  premiumWorkspaceCanvasClass,
} from "@/lib/pipeline/premiumWorkspaceUi";

export type OverviewTabLendersProps = FileLendersBlockProps;

export type OverviewTabProps = {
  className?: string;
  /** When set, only these overview sections render (Deal Info tab migration). */
  sectionIncludeFilter?: readonly OverviewSectionId[];
  /** Override root `data-testid` (default: pipeline-overview-tab). */
  dataTestId?: string;
  /** Skip canvas + toolbar when nested in unified Deal Info tab. */
  embedded?: boolean;
  /** Parent owns DnD — register section renderers instead of SortableSectionList. */
  suppressInternalDnd?: boolean;
  onRegisterSections?: RegisterCommandCenterSections;
  notes: {
    organizationId: Id<"organizations"> | null;
    memberUserKey?: string;
    pipelineFileId: Id<"pipeline">;
    blockSettings?: Readonly<Record<string, unknown>>;
    orgMissingMessage?: ReactNode;
  };
  contacts: {
    contactsBlock: ReactNode;
  };
  tasks: {
    tasks: Doc<"tasks">[];
    loading: boolean;
    attachmentCounts?: Record<string, number>;
    organizationId?: Id<"organizations">;
    memberUserKey?: string;
    pipelineFileId: Id<"pipeline">;
    actorUserKey?: string;
    disabled?: boolean;
    onAdd: (payload: FileTaskCreatePayload) => Promise<void>;
    onToggleDone: (t: Doc<"tasks">) => Promise<void>;
    onDelete: (t: Doc<"tasks">) => Promise<void>;
    onPatchTask: (
      t: Doc<"tasks">,
      patch: { triageLabelId: Id<"organizationTriageLabels"> | null },
    ) => Promise<void>;
    onOpen: (id: Id<"tasks">) => void;
  };
  lenders: OverviewTabLendersProps;
  fileInsights: {
    snapshot: PipelineFileInsightsSnapshot | null;
    onGoToSection: (section: PipelineBlockId) => void;
  };
};

const OVERVIEW_SECTION_DESCRIPTIONS: Record<OverviewSectionId, ReactNode> = {
  fileInsights:
    "Health snapshot, metrics, prioritized alerts, and quick jumps across this file.",
  notes: "Pinned notes, links, and attachments for this file.",
  contacts: "People linked to this loan file.",
  tasks: "File-level triage and follow-ups.",
  lenders: "Search lenders to add to the shortlist; assign Primary or Secondary roles on the board.",
};

function overviewAnchorForSection(sectionId: OverviewSectionId): string {
  return OVERVIEW_TAB_SECTION_IDS[sectionId];
}

function OverviewLayoutMenuItem({
  sectionId,
  label,
  visible,
  onToggle,
}: {
  sectionId: OverviewSectionId;
  label: string;
  visible: boolean;
  onToggle: (sectionId: OverviewSectionId) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={visible}
      data-testid={`pipeline-overview-layout-toggle-${sectionId}`}
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

function OverviewCollapsibleSection({
  id,
  title,
  status,
  summary,
  description,
  icon,
  indicatorCount,
  badgeVariant,
  open,
  onOpenChange,
  headerRight,
  lazyMount = true,
  contentClassName,
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerRight?: ReactNode;
  lazyMount?: boolean;
  contentClassName?: string;
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
      open={open}
      onOpenChange={onOpenChange}
      headerRight={headerRight}
      lazyMount={lazyMount}
      animated
      description={description}
      contentClassName={contentClassName ?? "space-y-4"}
    >
      {children}
    </CollapsibleBlock>
  );
}

export function OverviewTab({
  className,
  sectionIncludeFilter,
  dataTestId = "pipeline-overview-tab",
  embedded = false,
  suppressInternalDnd = false,
  onRegisterSections,
  notes,
  contacts,
  tasks,
  lenders,
  fileInsights,
}: OverviewTabProps) {
  const allowedSectionIds = sectionIncludeFilter ?? OVERVIEW_SECTION_IDS;
  const { draft, saving, savedAt, isDirty, patchOverviewTabLayout } =
    useDealWorkspaceEditor();

  const orgMemberArgs = useOrgMemberQueryArgs(
    tasks.organizationId,
    tasks.memberUserKey,
  );
  const triageLabels =
    useQuery(api.organizationTriageLabels.listTriageLabels, orgMemberArgs) ??
    [];

  const overviewLayout = useMemo(
    () => parseOverviewTabLayoutFromUnknown(draft?.overviewTabLayout),
    [draft?.overviewTabLayout],
  );

  const setSectionOpen = useCallback(
    (sectionId: OverviewSectionId, open: boolean) => {
      patchOverviewTabLayout((prev) =>
        setOverviewSectionExpanded(prev, sectionId, open),
      );
    },
    [patchOverviewTabLayout],
  );

  const visibleSectionIds = useMemo(
    () =>
      overviewLayout.order.filter(
        (id) =>
          allowedSectionIds.includes(id) &&
          (suppressInternalDnd ||
            isOverviewSectionVisible(overviewLayout, id)),
      ),
    [allowedSectionIds, overviewLayout, suppressInternalDnd],
  );

  const onOverviewDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id) as OverviewSectionId;
      const overId = String(over.id) as OverviewSectionId;
      if (
        !allowedSectionIds.includes(activeId) ||
        !allowedSectionIds.includes(overId)
      ) {
        return;
      }

      patchOverviewTabLayout((prev) => {
        const oldIndex = prev.order.indexOf(activeId);
        const newIndex = prev.order.indexOf(overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return normalizeOverviewSectionOrder(
          prev,
          arrayMove(prev.order, oldIndex, newIndex),
        );
      });
    },
    [allowedSectionIds, patchOverviewTabLayout],
  );

  const anySectionExpanded = useMemo(
    () =>
      visibleSectionIds.some((id) =>
        isOverviewSectionExpanded(overviewLayout, id),
      ),
    [overviewLayout, visibleSectionIds],
  );

  const allVisibleSectionsExpanded = useMemo(
    () =>
      visibleSectionIds.length > 0 &&
      visibleSectionIds.every((id) =>
        isOverviewSectionExpanded(overviewLayout, id),
      ),
    [overviewLayout, visibleSectionIds],
  );

  const onToggleSectionVisibility = useCallback(
    (sectionId: OverviewSectionId) => {
      patchOverviewTabLayout((prev) =>
        toggleOverviewSectionHidden(prev, sectionId),
      );
    },
    [patchOverviewTabLayout],
  );

  const onResetLayout = useCallback(() => {
    patchOverviewTabLayout(() => resetOverviewTabLayout());
  }, [patchOverviewTabLayout]);

  const onCollapseAll = useCallback(() => {
    patchOverviewTabLayout((prev) => collapseAllOverviewSections(prev));
  }, [patchOverviewTabLayout]);

  const onExpandAll = useCallback(() => {
    patchOverviewTabLayout((prev) => expandAllOverviewSections(prev));
  }, [patchOverviewTabLayout]);

  const renderSection = (
    sectionId: OverviewSectionId,
    dragHandle?: ReactNode,
  ) => {
    const anchorId = overviewAnchorForSection(sectionId);
    const open = isOverviewSectionExpanded(overviewLayout, sectionId);
    const onOpenChange = (next: boolean) => setSectionOpen(sectionId, next);
    const headerRight = dragHandle ?? undefined;

    switch (sectionId) {
      case "fileInsights": {
        const meta = fileInsightsBlockMeta(fileInsights.snapshot);
        return (
          <OverviewCollapsibleSection
            id={anchorId}
            title={OVERVIEW_SECTION_LABELS.fileInsights}
            status={meta.status}
            summary={meta.summary}
            badgeVariant={meta.badgeVariant}
            icon={<Lightbulb className="h-4 w-4" aria-hidden />}
            description={
              fileInsights.snapshot?.healthSummary ??
              OVERVIEW_SECTION_DESCRIPTIONS.fileInsights
            }
            open={open}
            onOpenChange={onOpenChange}
            headerRight={headerRight}
            lazyMount={false}
          >
            {fileInsights.snapshot ? (
              <PipelineFileInsightsPanel
                embedded
                snapshot={fileInsights.snapshot}
                onGoToSection={fileInsights.onGoToSection}
              />
            ) : (
              <p className="text-sm text-muted-foreground" role="status">
                Loading file insights…
              </p>
            )}
          </OverviewCollapsibleSection>
        );
      }
      case "notes":
        return (
          <OverviewCollapsibleSection
            id={anchorId}
            title="Notes"
            status="Ready"
            summary="Pinned notes, links, and attachments"
            icon={<StickyNote className="h-4 w-4" aria-hidden />}
            description={OVERVIEW_SECTION_DESCRIPTIONS.notes}
            open={open}
            onOpenChange={onOpenChange}
            headerRight={headerRight}
          >
            {notes.organizationId ? (
              <FileNotesBlock
                blockSettings={notes.blockSettings}
                pipelineFileId={notes.pipelineFileId}
                organizationId={notes.organizationId}
                memberUserKey={notes.memberUserKey}
              />
            ) : (
              notes.orgMissingMessage ?? (
                <p className="text-sm text-muted-foreground">
                  Select an organization to view and add file notes.
                </p>
              )
            )}
          </OverviewCollapsibleSection>
        );
      case "contacts":
        return (
          <OverviewCollapsibleSection
            id={anchorId}
            title="Associated contacts"
            status="Linked"
            summary="Borrowers, guarantors, and related people"
            icon={<Users className="h-4 w-4" aria-hidden />}
            description={OVERVIEW_SECTION_DESCRIPTIONS.contacts}
            open={open}
            onOpenChange={onOpenChange}
            headerRight={headerRight}
          >
            {contacts.contactsBlock}
          </OverviewCollapsibleSection>
        );
      case "tasks": {
        const taskMeta = tasksBlockMeta(tasks.tasks, triageLabels);
        return (
          <OverviewCollapsibleSection
            id={anchorId}
            title="Tasks"
            status={taskMeta.status}
            summary={taskMeta.summary}
            indicatorCount={taskMeta.indicatorCount}
            badgeVariant={taskMeta.badgeVariant}
            icon={<ClipboardList className="h-4 w-4" aria-hidden />}
            open={open}
            onOpenChange={onOpenChange}
            headerRight={headerRight}
            contentClassName="space-y-1.5 pt-0"
          >
            <FileTasksBlock
              tasks={tasks.tasks}
              loading={tasks.loading}
              attachmentCounts={tasks.attachmentCounts}
              organizationId={tasks.organizationId}
              memberUserKey={tasks.memberUserKey}
              pipelineFileId={tasks.pipelineFileId}
              actorUserKey={tasks.actorUserKey}
              disabled={tasks.disabled}
              onAdd={tasks.onAdd}
              onToggleDone={tasks.onToggleDone}
              onDelete={tasks.onDelete}
              onPatchTask={tasks.onPatchTask}
              onOpen={tasks.onOpen}
            />
          </OverviewCollapsibleSection>
        );
      }
      case "lenders":
        return (
          <OverviewCollapsibleSection
            id={anchorId}
            title="Lenders"
            status="Search"
            summary="Programs, attach, and primary lender selection"
            icon={<BookOpen className="h-4 w-4" aria-hidden />}
            description={OVERVIEW_SECTION_DESCRIPTIONS.lenders}
            open={open}
            onOpenChange={onOpenChange}
            headerRight={headerRight}
            lazyMount={false}
          >
            <FileLendersBlock {...lenders} />
          </OverviewCollapsibleSection>
        );
      default:
        return null;
    }
  };

  const overviewRegisterSig = useMemo(
    () =>
      [
        visibleSectionIds.join(","),
        overviewLayout.order.join(","),
        overviewLayout.hidden.join(","),
        Object.entries(overviewLayout.expanded)
          .filter(([, open]) => open)
          .map(([id]) => id)
          .sort()
          .join(","),
        tasks.tasks.length,
        triageLabels.length,
        fileInsights.snapshot?.healthSummary ?? "",
        notes.organizationId ?? "",
      ].join("|"),
    [
      fileInsights.snapshot?.healthSummary,
      notes.organizationId,
      overviewLayout.expanded,
      overviewLayout.hidden,
      overviewLayout.order,
      tasks.tasks.length,
      triageLabels.length,
      visibleSectionIds,
    ],
  );

  useLayoutEffect(() => {
    if (!suppressInternalDnd || !onRegisterSections) return;

    const sections: Partial<
      Record<DealInfoCommandCenterSectionId, CommandCenterSectionRenderer>
    > = {};
    for (const sectionId of visibleSectionIds) {
      if (
        sectionId === "contacts" ||
        sectionId === "notes" ||
        sectionId === "tasks" ||
        sectionId === "lenders"
      ) {
        sections[sectionId] = (handle) => renderSection(sectionId, handle);
      }
    }
    onRegisterSections(sections, overviewRegisterSig);
  }, [
    contacts,
    fileInsights,
    lenders,
    notes,
    onRegisterSections,
    overviewRegisterSig,
    suppressInternalDnd,
    tasks,
    visibleSectionIds,
  ]);

  const sectionsBody =
    !suppressInternalDnd ? (
    <SortableSectionList
      itemIds={visibleSectionIds}
      onDragEnd={onOverviewDragEnd}
    >
      <div className={premiumSectionStackClass} aria-label="Overview sections">
        {visibleSectionIds.map((sectionId) => (
          <SortableSectionItem key={sectionId} id={sectionId}>
            {(dragHandle) => renderSection(sectionId, dragHandle)}
          </SortableSectionItem>
        ))}
      </div>
    </SortableSectionList>
  ) : null;

  if (embedded && suppressInternalDnd) {
    return null;
  }

  if (embedded) {
    return (
      <div
        className={cn("min-w-0", className)}
        data-testid={dataTestId}
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
      data-testid={dataTestId}
    >
      <div
        className="flex min-w-0 flex-wrap items-center justify-end gap-2 px-0.5 pb-1"
        data-testid="pipeline-overview-tab-toolbar"
      >
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu
            aria-label="Overview layout settings"
            align="start"
            className="min-w-[14rem]"
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0 p-0 text-muted-foreground"
                data-testid="pipeline-overview-layout-control"
                aria-label="Overview layout settings"
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
              <OverviewLayoutMenuItem
                key={sectionId}
                sectionId={sectionId}
                label={OVERVIEW_SECTION_LABELS[sectionId]}
                visible={isOverviewSectionVisible(overviewLayout, sectionId)}
                onToggle={onToggleSectionVisibility}
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
              onClick={onResetLayout}
            >
              Reset to defaults
            </button>
          </DropdownMenu>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCollapseAll}
            disabled={!anySectionExpanded}
            aria-label="Collapse all overview sections"
            data-testid="pipeline-overview-collapse-all"
          >
            Collapse all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onExpandAll}
            disabled={!visibleSectionIds.length || allVisibleSectionsExpanded}
            aria-label="Expand all overview sections"
            data-testid="pipeline-overview-expand-all"
          >
            Expand all
          </Button>
        </div>
        <DealWorkspaceSaveStatus
          saving={saving}
          savedAt={savedAt}
          isDirty={isDirty}
        />
      </div>

      {sectionsBody}
    </div>
  );
}
