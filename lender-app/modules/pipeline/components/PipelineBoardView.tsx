"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Archive,
  BellOff,
  FileText,
  GripVertical,
  User,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { PipelineStageSelector } from "@/components/pipeline/PipelineStageSelector";
import { ClientMomentumStars, type ClientMomentumCommitValue } from "@/components/pipeline/ClientMomentumStars";
import {
  buildPipelineStageIndex,
  type PipelineStageDisplay,
} from "@/hooks/useOrganizationPipelineStages";
import { cn } from "@/lib/cn";
import {
  fmtPipelineBoardLoanCompact,
  fmtPipelineRelativeUpdated,
} from "@/lib/pipeline/pipelineTableFormatting";
import { pipelineDealEditorHref } from "@/lib/pipeline/routes";
import { HubTriageHighlightFrame } from "@/components/pipeline/tasks/HubTriageHighlightChrome";
import { useHubTriageHighlightMap } from "@/hooks/useHubTriageHighlightMap";
import { resolveTriageHighlight } from "@/lib/pipeline/hubTriageHighlight";
import { ResourceOwnershipLine } from "@/components/ownership/ResourceOwnershipLine";
import type { PipelineTablePreviewRow } from "@/lib/pipelineTablePreview";
import { groupBoardRowsByHierarchy } from "@/lib/pipeline/boardHierarchyGroups";
import { snoozedUntilToMs } from "@/lib/pipelineSnooze";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOrgMemberDisplayLabel } from "@/lib/useOrgMemberDisplayLabel";

type StageIndex = ReturnType<typeof buildPipelineStageIndex>;

type StageCommit = (next: {
  stageId: Id<"organizationPipelineStages">;
  subStageId?: Id<"organizationPipelineSubStages">;
}) => void;

function resolveRowStageKey(
  row: PipelineTablePreviewRow,
  index: StageIndex,
): string | null {
  if (row.stageId && index.stageById.has(row.stageId)) {
    return String(row.stageId);
  }
  const slug = row.status.split("::")[0] ?? row.status;
  const match = index.activeStages.find((s) => s.slug === slug);
  return match ? String(match._id) : null;
}

function BoardColumn({
  stageId,
  label,
  color,
  count,
  children,
}: {
  stageId: string;
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 w-72 shrink-0 flex-col rounded-lg border-2 border-border/65 bg-muted/20 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
      aria-label={`${label} column`}
    >
      <header className="flex items-center gap-2 border-b-2 border-border/60 bg-background/95 px-3 py-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <h3 className="text-sm font-semibold" style={{ color }}>
          {label}
        </h3>
        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {count}
        </span>
      </header>
      <ul className="space-y-2 p-2">{children}</ul>
    </section>
  );
}

function BoardCardContent({
  row,
  dragDisabled,
  dragHandleProps,
  onStageCommit,
  onMomentumCommit,
  assigneeLabel,
}: {
  row: PipelineTablePreviewRow;
  dragDisabled: boolean;
  dragHandleProps?: Record<string, unknown>;
  onStageCommit: StageCommit;
  onMomentumCommit?: (n: ClientMomentumCommitValue) => void;
  assigneeLabel: (userKey: string) => string;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <BoardCardHeader row={row} dragDisabled={dragDisabled} dragHandleProps={dragHandleProps} onMomentumCommit={onMomentumCommit} />
        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
          {row.fundingAmountDisplay ||
            fmtPipelineBoardLoanCompact(row.fundingAmount || 0)}
        </span>
      </div>
      <BoardCardDetails
        row={row}
        onStageCommit={onStageCommit}
        assigneeLabel={assigneeLabel}
      />
    </>
  );
}

function BoardCardHeader({
  row,
  dragDisabled,
  dragHandleProps,
  onMomentumCommit,
}: {
  row: PipelineTablePreviewRow;
  dragDisabled: boolean;
  dragHandleProps?: Record<string, unknown>;
  onMomentumCommit?: (n: ClientMomentumCommitValue) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-nowrap items-start gap-1.5 overflow-hidden">
        {!dragDisabled ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag ${row.fileName}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <Link
          href={pipelineDealEditorHref(row._id)}
          className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Open file ${row.fileName}`}
          title="Open file"
          onClick={(e) => e.stopPropagation()}
          prefetch={false}
        >
          <FileText className="h-4 w-4" aria-hidden />
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {row.fileName}
        </span>
      </div>
      <div
        className="mt-0.5 flex min-w-0 flex-nowrap pl-8"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ClientMomentumStars
          className="shrink-0"
          value={row.clientMomentum}
          readOnly={row.archivedAt != null || !row.canEditFile}
          disabled={row.archivedAt != null}
          onCommit={onMomentumCommit}
        />
      </div>
      {row.archivedAt != null ? (
        <span
          className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
          title={`Archived ${new Date(row.archivedAt).toLocaleString()}`}
        >
          <Archive className="h-2.5 w-2.5" aria-hidden />
          Archived
        </span>
      ) : null}
      {row.isSnoozed && snoozedUntilToMs(row.snoozedUntil) != null ? (
        <span
          className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-800 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200"
          title={`Snoozed until ${new Date(snoozedUntilToMs(row.snoozedUntil)!).toLocaleString()}`}
        >
          <BellOff className="h-2.5 w-2.5" aria-hidden />
          Snoozed until{" "}
          {new Date(snoozedUntilToMs(row.snoozedUntil)!).toLocaleDateString()}
        </span>
      ) : null}
    </div>
  );
}

function BoardCardDetails({
  row,
  onStageCommit,
  assigneeLabel,
}: {
  row: PipelineTablePreviewRow;
  onStageCommit: StageCommit;
  assigneeLabel: (userKey: string) => string;
}) {
  return (
    <>
      {row.ownership ? (
        <ResourceOwnershipLine
          presentation={row.ownership}
          compact
          className="mt-1"
        />
      ) : null}
      {row.sourceLabel ? (
        <p
          className="mt-1 line-clamp-1 text-[11px] text-muted-foreground"
          title={row.sourceLabel}
        >
          {row.sourceLabel}
        </p>
      ) : null}
      {row.subjectAddressDisplay ? (
        <p
          className="mt-1 line-clamp-2 text-xs text-muted-foreground"
          title={row.subjectAddressDisplay}
        >
          {row.subjectAddressDisplay}
        </p>
      ) : null}
      <BoardCardMeta row={row} />
      <div
        className="mt-2 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <PipelineStageSelector
          stageId={row.stageId}
          subStageId={row.subStageId}
          status={row.status}
          readOnly={row.archivedAt != null || !row.canEditFile}
          canEditFile={row.canEditFile}
          compact
          stopPropagation
          ariaLabel={`Change stage for ${row.fileName}`}
          onCommit={onStageCommit}
        />
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {row.assigneeId ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5"
              title={`Assigned to ${assigneeLabel(row.assigneeId)}`}
            >
              <User className="h-3 w-3" />
              {assigneeLabel(row.assigneeId)}
            </span>
          ) : null}
          <span title={`Updated ${fmtPipelineRelativeUpdated(row.updatedAt)}`}>
            {fmtPipelineRelativeUpdated(row.updatedAt)}
          </span>
        </span>
      </div>
    </>
  );
}

function BoardCardMeta({ row }: { row: PipelineTablePreviewRow }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      {row.fundingTypeDisplay ? (
        <span className="line-clamp-1">{row.fundingTypeDisplay}</span>
      ) : null}
      {row.purchaseRefiDisplay ? (
        <span className="line-clamp-1">· {row.purchaseRefiDisplay}</span>
      ) : null}
      {row.selectedLenderDisplay ? (
        <span className="line-clamp-1 font-medium text-foreground/90">
          · {row.selectedLenderDisplay}
        </span>
      ) : row.lenders.length > 0 ? (
        <span>
          · {row.lenders.length}{" "}
          {row.lenders.length === 1 ? "lender" : "lenders"}
        </span>
      ) : null}
    </div>
  );
}

function BoardCard({
  row,
  hubFocusFileId,
  dragDisabled,
  onSelect,
  onStageCommit,
  onMomentumCommit,
  assigneeLabel,
  triageHighlight,
}: {
  row: PipelineTablePreviewRow;
  hubFocusFileId: Id<"pipeline"> | null;
  dragDisabled: boolean;
  onSelect: () => void;
  onStageCommit: StageCommit;
  onMomentumCommit?: (n: ClientMomentumCommitValue) => void;
  assigneeLabel: (userKey: string) => string;
  triageHighlight?: ReturnType<typeof resolveTriageHighlight>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(row._id),
    disabled: dragDisabled,
  });

  const dragHandleProps = dragDisabled
    ? undefined
    : { ...attributes, ...listeners };

  return (
    <li
      ref={setNodeRef}
      data-pipeline-row={row._id}
      className={cn(
        "cursor-pointer rounded-md border bg-background p-3 shadow-sm transition-colors hover:border-primary/40 hover:shadow",
        row.archivedAt != null && "opacity-65",
        hubFocusFileId === row._id &&
          "ring-2 ring-brand-accent/45 ring-offset-2 ring-offset-background",
        isDragging && "opacity-40",
      )}
      onClick={onSelect}
    >
      <HubTriageHighlightFrame
        highlight={triageHighlight}
        className="rounded-md"
        badgeClassName="top-1.5 right-1.5"
      >
        <BoardCardContent
          row={row}
          dragDisabled={dragDisabled}
          dragHandleProps={dragHandleProps}
          onStageCommit={onStageCommit}
          onMomentumCommit={onMomentumCommit}
          assigneeLabel={assigneeLabel}
        />
      </HubTriageHighlightFrame>
    </li>
  );
}

export type PipelineBoardViewProps = {
  rows: PipelineTablePreviewRow[];
  stageTree: PipelineStageDisplay[];
  stageIndex: StageIndex;
  hubFocusFileId: Id<"pipeline"> | null;
  selectFile: (id: Id<"pipeline">) => void;
  runPatchPipeline: (args: {
    id: Id<"pipeline">;
    stageId?: Id<"organizationPipelineStages"> | null;
    subStageId?: Id<"organizationPipelineSubStages"> | null;
  }) => Promise<unknown>;
  runSetClientMomentum: (id: Id<"pipeline">, n: ClientMomentumCommitValue) => void;
};

export function PipelineBoardView({
  rows,
  stageTree,
  stageIndex,
  hubFocusFileId,
  selectFile,
  runPatchPipeline,
  runSetClientMomentum,
}: PipelineBoardViewProps) {
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey().trim() || undefined;
  const triageHighlights = useHubTriageHighlightMap(
    activeOrganizationId ?? undefined,
    memberUserKey,
  );
  const { labelFor: assigneeLabel } = useOrgMemberDisplayLabel(
    activeOrganizationId,
    memberUserKey,
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const byStage = useMemo(() => {
    const m = new Map<string, PipelineTablePreviewRow[]>();
    for (const { stage } of stageTree) m.set(String(stage._id), []);
    const unassigned: PipelineTablePreviewRow[] = [];
    for (const r of rows) {
      const key = resolveRowStageKey(r, stageIndex);
      if (key && m.has(key)) m.get(key)!.push(r);
      else unassigned.push(r);
    }
    return { columns: m, unassigned };
  }, [rows, stageIndex, stageTree]);

  const activeRow = useMemo(
    () => rows.find((r) => String(r._id) === activeDragId) ?? null,
    [activeDragId, rows],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const rowId = event.active.id as Id<"pipeline">;
      const overId = event.over?.id;
      if (!overId || overId === rowId || overId === "__unassigned__") return;
      const row = rows.find((r) => r._id === rowId);
      if (!row || row.archivedAt != null || !row.canEditFile) return;
      const targetStageId = String(overId) as Id<"organizationPipelineStages">;
      if (row.stageId === targetStageId && !row.subStageId) return;
      await runPatchPipeline({
        id: rowId,
        stageId: targetStageId,
        subStageId: null,
      });
    },
    [rows, runPatchPipeline],
  );

  const onStageCommit = useCallback(
    async (rowId: Id<"pipeline">, next: Parameters<StageCommit>[0]) => {
      await runPatchPipeline({
        id: rowId,
        stageId: next.stageId,
        subStageId: next.subStageId ?? null,
      });
    },
    [runPatchPipeline],
  );

  if (stageTree.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No pipeline stages configured. Open Settings → Pipeline stages to add columns.
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="w-full overflow-x-auto touch-pan-x touch-scroll-x">
        <div className="flex min-h-0 min-w-max gap-3 p-3">
          {stageTree.map(({ stage }) => {
            const stageKey = String(stage._id);
            const rowsForStage = byStage.columns.get(stageKey) ?? [];
            return (
              <BoardColumn
                key={stageKey}
                stageId={stageKey}
                label={stage.name}
                color={stage.color}
                count={rowsForStage.length}
              >
                {rowsForStage.length === 0 ? (
                  <li className="rounded-md border border-dashed bg-background/50 p-3 text-center text-xs text-muted-foreground">
                    Empty
                  </li>
                ) : (
                  groupBoardRowsByHierarchy(rowsForStage).map((group) => (
                    <li
                      key={group.groupKey}
                      className={cn(
                        "list-none space-y-1.5 rounded-md border border-border/60 bg-muted/15 p-1.5",
                        group.rows.length > 1 && "border-l-2 border-l-primary/20",
                      )}
                      data-testid="pipeline-board-project-group"
                    >
                      <div className="px-1.5 py-0.5">
                        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.clientDisplayName}
                        </p>
                        <p className="truncate text-xs font-medium text-foreground/90">
                          {group.projectDisplayTitle}
                          {group.rows.length > 1
                            ? ` · ${group.rows.length} loans`
                            : ""}
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {group.rows.map((r) => (
                          <BoardCard
                            key={r._id}
                            row={r}
                            hubFocusFileId={hubFocusFileId}
                            dragDisabled={r.archivedAt != null || !r.canEditFile}
                            onSelect={() => selectFile(r._id)}
                            onStageCommit={(next) =>
                              void onStageCommit(r._id, next)
                            }
                            onMomentumCommit={
                              r.archivedAt == null && r.canEditFile
                                ? (n) => void runSetClientMomentum(r._id, n)
                                : undefined
                            }
                            assigneeLabel={assigneeLabel}
                            triageHighlight={resolveTriageHighlight(
                              triageHighlights,
                              { kind: "file", id: String(r._id) },
                            )}
                          />
                        ))}
                      </ul>
                    </li>
                  ))
                )}
              </BoardColumn>
            );
          })}
          {byStage.unassigned.length > 0 ? (
            <BoardColumn
              stageId="__unassigned__"
              label="Unassigned"
              color="#94A3B8"
              count={byStage.unassigned.length}
            >
              {byStage.unassigned.map((r) => (
                <BoardCard
                  key={r._id}
                  row={r}
                  hubFocusFileId={hubFocusFileId}
                  dragDisabled
                  onSelect={() => selectFile(r._id)}
                  onStageCommit={(next) => void onStageCommit(r._id, next)}
                  assigneeLabel={assigneeLabel}
                  triageHighlight={resolveTriageHighlight(triageHighlights, {
                    kind: "file",
                    id: String(r._id),
                  })}
                />
              ))}
            </BoardColumn>
          ) : null}
        </div>
      </div>
      <DragOverlay>
        {activeRow ? (
          <div className="rounded-md border bg-background p-3 shadow-lg">
            <BoardCardContent
              row={activeRow}
              dragDisabled
              onStageCommit={() => {}}
              assigneeLabel={assigneeLabel}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
