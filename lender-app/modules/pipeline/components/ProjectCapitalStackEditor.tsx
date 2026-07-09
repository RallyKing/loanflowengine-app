"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Landmark, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  CAPITAL_REQUIREMENT_LABELS,
  CAPITAL_REQUIREMENT_TYPES,
  CAPITAL_SOURCE_STATUS_LABELS,
  CAPITAL_SOURCE_STATUSES,
  CAPITAL_SOURCE_TYPE_LABELS,
  CAPITAL_SOURCE_TYPES,
  formatCapitalMoney,
  type CapitalRequirementType,
  type CapitalSourceStatus,
  type CapitalSourceType,
} from "@/lib/projectCapitalStack";

type ProjectLoanOption = { id: string; fileName: string };

type Props = {
  organizationId: Id<"organizations">;
  memberUserKey: string;
  projectId: Id<"projects">;
  projectLoans?: ProjectLoanOption[];
  compact?: boolean;
  /** When true, title row is rendered by {@link HubCollapsibleSubsection}. */
  suppressTitle?: boolean;
};

function SortableShell({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-start gap-2 rounded-dlc-md border border-border/60 bg-background/80 p-2"
    >
      <button
        type="button"
        className={cn(
          "mt-1 shrink-0 touch-none text-muted-foreground",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-grab",
        )}
        aria-label="Drag to reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function GapMeter({
  coveragePercent,
  gapHealth,
  totalRequired,
  totalFunded,
  remainingGap,
}: {
  coveragePercent: number;
  gapHealth: "complete" | "partial" | "unfunded";
  totalRequired: number;
  totalFunded: number;
  remainingGap: number;
}) {
  const barColor =
    gapHealth === "complete"
      ? "bg-muted-foreground/50"
      : gapHealth === "partial"
        ? "bg-amber-500/70"
        : "bg-destructive/60";
  return (
    <div className="mb-3 space-y-1.5" data-testid="capital-gap-meter">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Required {formatCapitalMoney(totalRequired)} · Funded{" "}
          {formatCapitalMoney(totalFunded)}
        </span>
        <span className="tabular-nums font-medium text-foreground/80">
          {coveragePercent}% covered
          {remainingGap > 0 ? ` · Gap ${formatCapitalMoney(remainingGap)}` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn("h-full transition-all duration-dlc-standard", barColor)}
          style={{ width: `${Math.min(100, coveragePercent)}%` }}
        />
      </div>
    </div>
  );
}

export function ProjectCapitalStackEditor({
  organizationId,
  memberUserKey,
  projectId,
  projectLoans = [],
  compact = false,
  suppressTitle = false,
}: Props) {
  const stack = useQuery(api.projectCapitalStackMutations.getProjectCapitalStack, {
    organizationId,
    projectId,
    memberUserKey,
  });

  const addRequirement = useMutation(
    api.projectCapitalStackMutations.addCapitalRequirement,
  );
  const updateRequirement = useMutation(
    api.projectCapitalStackMutations.updateCapitalRequirement,
  );
  const removeRequirement = useMutation(
    api.projectCapitalStackMutations.removeCapitalRequirement,
  );
  const reorderRequirements = useMutation(
    api.projectCapitalStackMutations.reorderCapitalRequirements,
  );
  const addSource = useMutation(api.projectCapitalStackMutations.addCapitalSource);
  const updateSource = useMutation(
    api.projectCapitalStackMutations.updateCapitalSource,
  );
  const removeSource = useMutation(
    api.projectCapitalStackMutations.removeCapitalSource,
  );
  const reorderSources = useMutation(
    api.projectCapitalStackMutations.reorderCapitalSources,
  );
  const setAllocation = useMutation(
    api.projectCapitalStackMutations.setCapitalAllocation,
  );

  const [pending, setPending] = useState(false);
  const [newReqType, setNewReqType] = useState<CapitalRequirementType>("acquisition");
  const [newSourceType, setNewSourceType] = useState<CapitalSourceType>("loan");

  const canEdit = stack?.canEdit === true;
  const requirements = stack?.requirements ?? [];
  const sources = stack?.sources ?? [];
  const rollup = stack?.rollup;

  const linkedPipelineIds = useMemo(
    () => new Set(sources.map((s) => s.pipelineId).filter(Boolean)),
    [sources],
  );
  const availableLoans = useMemo(
    () => projectLoans.filter((l) => !linkedPipelineIds.has(l.id)),
    [projectLoans, linkedPipelineIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  }, []);

  const onReqDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canEdit || pending) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = requirements.map((r) => r.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(ids, oldIndex, newIndex);
      void run(async () => {
        await reorderRequirements({
          organizationId,
          projectId,
          memberUserKey,
          orderedRequirementIds: next as Id<"projectCapitalRequirements">[],
        });
      });
    },
    [
      canEdit,
      pending,
      requirements,
      run,
      reorderRequirements,
      organizationId,
      projectId,
      memberUserKey,
    ],
  );

  const onSourceDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canEdit || pending) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = sources.map((s) => s.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(ids, oldIndex, newIndex);
      void run(async () => {
        await reorderSources({
          organizationId,
          projectId,
          memberUserKey,
          orderedSourceIds: next as Id<"projectCapitalSources">[],
        });
      });
    },
    [
      canEdit,
      pending,
      sources,
      run,
      reorderSources,
      organizationId,
      projectId,
      memberUserKey,
    ],
  );

  if (stack === undefined) {
    return (
      <p className="text-xs text-muted-foreground">Loading capital stack…</p>
    );
  }
  if (stack === null) return null;

  return (
    <section
      className={cn(
        suppressTitle
          ? "min-w-0"
          : cn(
              "rounded-dlc-md border border-border/70 bg-dlc-surface/60",
              compact ? "p-2" : "p-3",
            ),
      )}
      data-testid="project-capital-stack-editor"
    >
      {!suppressTitle ? (
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          Capital stack
        </div>
      ) : null}

      {!canEdit ? (
        <p className="mb-2 rounded-dlc-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          View-only — you cannot edit the capital stack on this project.
        </p>
      ) : null}

      {rollup ? (
        <GapMeter
          coveragePercent={rollup.fundingCoveragePercent}
          gapHealth={rollup.gapHealth}
          totalRequired={rollup.totalRequired}
          totalFunded={rollup.totalFunded}
          remainingGap={rollup.remainingGap}
        />
      ) : null}

      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Requirements
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onReqDragEnd}
      >
        <SortableContext
          items={requirements.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {requirements.map((req) => (
              <li key={req.id}>
                <SortableShell id={req.id} disabled={!canEdit || pending}>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 min-w-[7rem] rounded-md border border-border bg-background px-2 text-xs"
                      value={req.capitalType}
                      disabled={!canEdit || pending}
                      onChange={(e) => {
                        const capitalType = e.target
                          .value as CapitalRequirementType;
                        void run(() =>
                          updateRequirement({
                            organizationId,
                            projectId,
                            memberUserKey,
                            requirementId: req.id as Id<"projectCapitalRequirements">,
                            capitalType,
                          }),
                        );
                      }}
                    >
                      {CAPITAL_REQUIREMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CAPITAL_REQUIREMENT_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 w-28 text-xs tabular-nums"
                      defaultValue={req.requiredAmount}
                      disabled={!canEdit || pending}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v) || v < 0) return;
                        void run(() =>
                          updateRequirement({
                            organizationId,
                            projectId,
                            memberUserKey,
                            requirementId: req.id as Id<"projectCapitalRequirements">,
                            requiredAmount: v,
                          }),
                        );
                      }}
                    />
                    <Input
                      className="h-9 min-w-0 flex-1 text-xs"
                      placeholder="Notes"
                      defaultValue={req.notes ?? ""}
                      disabled={!canEdit || pending}
                      onBlur={(e) => {
                        void run(() =>
                          updateRequirement({
                            organizationId,
                            projectId,
                            memberUserKey,
                            requirementId: req.id as Id<"projectCapitalRequirements">,
                            notes: e.target.value,
                          }),
                        );
                      }}
                    />
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 px-2"
                        disabled={pending}
                        onClick={() =>
                          void run(() =>
                            removeRequirement({
                              organizationId,
                              projectId,
                              memberUserKey,
                              requirementId: req.id as Id<"projectCapitalRequirements">,
                            }),
                          )
                        }
                        aria-label="Remove requirement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </SortableShell>
              </li>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
            value={newReqType}
            onChange={(e) =>
              setNewReqType(e.target.value as CapitalRequirementType)
            }
          >
            {CAPITAL_REQUIREMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CAPITAL_REQUIREMENT_LABELS[t]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            disabled={pending}
            onClick={() =>
              void run(() =>
                addRequirement({
                  organizationId,
                  projectId,
                  memberUserKey,
                  capitalType: newReqType,
                  requiredAmount: 0,
                }),
              )
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add requirement
          </Button>
        </div>
      ) : null}

      <div className="mb-1 mt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Funding sources
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onSourceDragEnd}
      >
        <SortableContext
          items={sources.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {sources.map((src) => (
              <li key={src.id}>
                <SortableShell id={src.id} disabled={!canEdit || pending}>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 min-w-[6rem] rounded-md border border-border bg-background px-2 text-xs"
                        value={src.sourceType}
                        disabled={!canEdit || pending}
                        onChange={(e) => {
                          void run(() =>
                            updateSource({
                              organizationId,
                              projectId,
                              memberUserKey,
                              sourceId: src.id as Id<"projectCapitalSources">,
                              sourceType: e.target.value as CapitalSourceType,
                            }),
                          );
                        }}
                      >
                        {CAPITAL_SOURCE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {CAPITAL_SOURCE_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 min-w-[8rem] flex-1 rounded-md border border-border bg-background px-2 text-xs"
                        value={src.pipelineId ?? ""}
                        disabled={!canEdit || pending}
                        onChange={(e) => {
                          const v = e.target.value;
                          void run(() =>
                            updateSource({
                              organizationId,
                              projectId,
                              memberUserKey,
                              sourceId: src.id as Id<"projectCapitalSources">,
                              pipelineId: v
                                ? (v as Id<"pipeline">)
                                : null,
                            }),
                          );
                        }}
                      >
                        <option value="">No loan file</option>
                        {src.pipelineId && src.pipelineFileName ? (
                          <option value={src.pipelineId}>
                            {src.pipelineFileName}
                          </option>
                        ) : null}
                        {availableLoans.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.fileName}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-9 min-w-[6rem] rounded-md border border-border bg-background px-2 text-xs"
                        value={src.status}
                        disabled={!canEdit || pending}
                        onChange={(e) => {
                          void run(() =>
                            updateSource({
                              organizationId,
                              projectId,
                              memberUserKey,
                              sourceId: src.id as Id<"projectCapitalSources">,
                              status: e.target.value as CapitalSourceStatus,
                            }),
                          );
                        }}
                      >
                        {CAPITAL_SOURCE_STATUSES.map((t) => (
                          <option key={t} value={t}>
                            {CAPITAL_SOURCE_STATUS_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <label className="flex items-center gap-1">
                        Cmt
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 text-xs tabular-nums"
                          defaultValue={src.committedAmount}
                          disabled={!canEdit || pending}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || v < 0) return;
                            void run(() =>
                              updateSource({
                                organizationId,
                                projectId,
                                memberUserKey,
                                sourceId: src.id as Id<"projectCapitalSources">,
                                committedAmount: v,
                              }),
                            );
                          }}
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        Appr
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 text-xs tabular-nums"
                          defaultValue={src.approvedAmount}
                          disabled={!canEdit || pending}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || v < 0) return;
                            void run(() =>
                              updateSource({
                                organizationId,
                                projectId,
                                memberUserKey,
                                sourceId: src.id as Id<"projectCapitalSources">,
                                approvedAmount: v,
                              }),
                            );
                          }}
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        Funded
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 text-xs tabular-nums"
                          defaultValue={src.fundedAmount}
                          disabled={!canEdit || pending}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || v < 0) return;
                            void run(() =>
                              updateSource({
                                organizationId,
                                projectId,
                                memberUserKey,
                                sourceId: src.id as Id<"projectCapitalSources">,
                                fundedAmount: v,
                              }),
                            );
                          }}
                        />
                      </label>
                      <Input
                        className="h-8 min-w-0 flex-1 text-xs"
                        placeholder="Source notes"
                        defaultValue={src.notes ?? ""}
                        disabled={!canEdit || pending}
                        onBlur={(e) => {
                          void run(() =>
                            updateSource({
                              organizationId,
                              projectId,
                              memberUserKey,
                              sourceId: src.id as Id<"projectCapitalSources">,
                              notes: e.target.value,
                            }),
                          );
                        }}
                      />
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          disabled={pending}
                          onClick={() =>
                            void run(() =>
                              removeSource({
                                organizationId,
                                projectId,
                                memberUserKey,
                                sourceId: src.id as Id<"projectCapitalSources">,
                              }),
                            )
                          }
                          aria-label="Remove source"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    {requirements.length > 0 ? (
                      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-2">
                        <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                          Allocations to requirements
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {requirements.map((req) => {
                            const alloc =
                              src.allocationByRequirementId[req.id] ?? 0;
                            return (
                              <label
                                key={req.id}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground"
                              >
                                {CAPITAL_REQUIREMENT_LABELS[req.capitalType]}
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-7 w-16 text-[10px] tabular-nums"
                                  defaultValue={alloc}
                                  disabled={!canEdit || pending}
                                  onBlur={(e) => {
                                    const v = Number(e.target.value);
                                    if (!Number.isFinite(v) || v < 0) return;
                                    void run(() =>
                                      setAllocation({
                                        organizationId,
                                        projectId,
                                        memberUserKey,
                                        sourceId: src.id as Id<"projectCapitalSources">,
                                        requirementId:
                                          req.id as Id<"projectCapitalRequirements">,
                                        allocatedAmount: v,
                                      }),
                                    );
                                  }}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </SortableShell>
              </li>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
            value={newSourceType}
            onChange={(e) =>
              setNewSourceType(e.target.value as CapitalSourceType)
            }
          >
            {CAPITAL_SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {CAPITAL_SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            disabled={pending}
            onClick={() =>
              void run(() =>
                addSource({
                  organizationId,
                  projectId,
                  memberUserKey,
                  sourceType: newSourceType,
                }),
              )
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add source
          </Button>
        </div>
      ) : null}
    </section>
  );
}
