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
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DebouncedPersistedField } from "@/components/settings/DebouncedPersistedField";
import { useResponsiveNav } from "@/components/navigation/ResponsiveNavProvider";
import { cn } from "@/lib/cn";
import {
  PIPELINE_STAGES_MOBILE_ACTION_BAR_HEIGHT,
  PIPELINE_STAGES_MOBILE_NAV_CLEARANCE,
  pipelineStagesMobileScrollPadStyle,
  pipelineStagesPageMobilePaddingClass,
} from "@/lib/settings/pipelineStagesMobileLayout";
import { useOrganizationPipelineStages } from "@/hooks/useOrganizationPipelineStages";
import { useOrgPermissions } from "@/lib/useOrgPermissions";
import { useActorUserKey } from "@/lib/useActorUserKey";
import { useOperationalConfirm } from "@/components/ui/OperationalConfirmDialog";
import { simpleDeleteConfirm } from "@/lib/ui/confirmDestructive";

const STAGE_ICONS = [
  "circle",
  "handshake",
  "folder-open",
  "search",
  "check-circle",
  "file-text",
  "key",
  "banknote",
  "circle-check",
] as const;

function SortableRow({
  id,
  children,
  disabled,
}: {
  id: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "rounded-dlc-md border border-border/70 bg-dlc-surface",
        isDragging && "opacity-80 shadow-dlc-md",
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          className={cn(
            "mt-0.5 shrink-0 touch-none text-muted-foreground",
            disabled ? "cursor-not-allowed opacity-40" : "cursor-grab",
          )}
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function PipelineStagesManager() {
  const { confirm } = useOperationalConfirm();
  const { activeOrganizationId } = useOrgPermissions();
  const memberUserKey = useActorUserKey();
  const { bundle, loading, canManageStageArchitecture } =
    useOrganizationPipelineStages();
  const { layout } = useResponsiveNav();
  const keyboardInset = layout.keyboardInsetBottom;
  const keyboardActive = keyboardInset > 48;

  const createStage = useMutation(api.organizationPipelineStages.createStage);
  const updateStage = useMutation(api.organizationPipelineStages.updateStage);
  const deleteStage = useMutation(api.organizationPipelineStages.deleteStage);
  const reorderStages = useMutation(api.organizationPipelineStages.reorderStages);
  const createSubStage = useMutation(api.organizationPipelineStages.createSubStage);
  const updateSubStage = useMutation(api.organizationPipelineStages.updateSubStage);
  const deleteSubStage = useMutation(api.organizationPipelineStages.deleteSubStage);
  const reorderSubStages = useMutation(
    api.organizationPipelineStages.reorderSubStages,
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newStageName, setNewStageName] = useState("");
  const [newSubNames, setNewSubNames] = useState<Record<string, string>>({});

  const tree = useMemo(() => {
    if (!bundle) return [];
    const stages = bundle.stages
      .filter((s) => !s.isArchived)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return stages.map((stage) => ({
      stage,
      subStages: bundle.subStages
        .filter((s) => s.parentStageId === stage._id)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    }));
  }, [bundle]);

  const parentOptions = useMemo(
    () => tree.map(({ stage }) => ({ id: stage._id, name: stage.name })),
    [tree],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const stageIds = useMemo(() => tree.map((t) => String(t.stage._id)), [tree]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addStage = useCallback(() => {
    if (!activeOrganizationId) return;
    const name = newStageName.trim();
    if (!name) return;
    void createStage({
      organizationId: activeOrganizationId,
      memberUserKey,
      name,
    }).then(() => setNewStageName(""));
  }, [activeOrganizationId, createStage, memberUserKey, newStageName]);

  const onStageDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!activeOrganizationId || !canManageStageArchitecture) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = stageIds.indexOf(String(active.id));
      const newIndex = stageIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(stageIds, oldIndex, newIndex);
      void reorderStages({
        organizationId: activeOrganizationId,
        memberUserKey,
        orderedStageIds: next as Id<"organizationPipelineStages">[],
      });
    },
    [
      activeOrganizationId,
      canManageStageArchitecture,
      memberUserKey,
      reorderStages,
      stageIds,
    ],
  );

  const stickyBottomStyle = keyboardActive
    ? { bottom: `${keyboardInset}px` }
    : { bottom: `calc(${PIPELINE_STAGES_MOBILE_NAV_CLEARANCE})` };

  if (!activeOrganizationId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization to manage pipeline stages.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading stages…</p>;
  }

  if (!canManageStageArchitecture) {
    return (
      <p className="text-sm text-muted-foreground">
        You can view stages but only owners, admins, and managers can edit the
        pipeline architecture.
      </p>
    );
  }

  return (
    <div
      className={cn("relative", pipelineStagesPageMobilePaddingClass)}
      style={pipelineStagesMobileScrollPadStyle}
      data-pipeline-stages-settings
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Shape your funnel with parent stages and nested sub-stages. Drag to
        reorder. Names save automatically after you stop typing.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onStageDragEnd}
      >
        <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 pb-4 md:pb-0">
            {tree.map(({ stage, subStages }) => {
              const sid = String(stage._id);
              const isOpen = expanded.has(sid);
              const activeSubs = subStages.filter((s) => !s.isArchived);
              const archivedSubs = subStages.filter((s) => s.isArchived);
              return (
                <SortableRow key={sid} id={sid}>
                  <div className="space-y-3 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border"
                        onClick={() => toggleExpanded(sid)}
                        aria-expanded={isOpen}
                        aria-label={
                          isOpen ? "Collapse sub-stages" : "Expand sub-stages"
                        }
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border"
                        style={{ backgroundColor: stage.color }}
                        aria-hidden
                      />
                      <DebouncedPersistedField
                        value={stage.name}
                        aria-label="Stage name"
                        inputClassName="h-10 min-w-[10rem] flex-1 text-sm"
                        onSave={async (name) => {
                          await updateStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            stageId: stage._id,
                            name,
                          });
                        }}
                      />
                      <Input
                        type="color"
                        defaultValue={stage.color}
                        className="h-10 w-12 shrink-0 cursor-pointer p-1"
                        aria-label="Stage color"
                        onChange={(e) => {
                          void updateStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            stageId: stage._id,
                            color: e.target.value,
                          });
                        }}
                      />
                      <select
                        defaultValue={stage.icon}
                        className="h-10 shrink-0 rounded-dlc-sm border border-input bg-background px-2 text-xs"
                        aria-label="Stage icon"
                        onChange={(e) => {
                          void updateStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            stageId: stage._id,
                            icon: e.target.value,
                          });
                        }}
                      >
                        {STAGE_ICONS.map((ic) => (
                          <option key={ic} value={ic}>
                            {ic}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant={stage.isDefault ? "primary" : "outline"}
                        size="sm"
                        className="h-10 shrink-0 gap-1"
                        onClick={() =>
                          void updateStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            stageId: stage._id,
                            isDefault: !stage.isDefault,
                          })
                        }
                      >
                        <Star className="h-3.5 w-3.5" />
                        Default
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 shrink-0"
                        onClick={() =>
                          void updateStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            stageId: stage._id,
                            isArchived: !stage.isArchived,
                          })
                        }
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-10 shrink-0 text-destructive"
                        onClick={() => {
                          void (async () => {
                            const ok = await confirm({
                              ...simpleDeleteConfirm(stage.name, {
                                title: "Delete stage",
                                impact:
                                  "This stage and its sub-stages are permanently removed.",
                              }),
                            });
                            if (!ok) return;
                            void deleteStage({
                              organizationId: activeOrganizationId,
                              memberUserKey,
                              stageId: stage._id,
                            });
                          })();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {isOpen && (
                      <SubStageList
                        parentName={stage.name}
                        subStages={activeSubs}
                        archivedSubStages={archivedSubs}
                        parentOptions={parentOptions}
                        newSubName={newSubNames[sid] ?? ""}
                        onNewSubNameChange={(v) =>
                          setNewSubNames((prev) => ({ ...prev, [sid]: v }))
                        }
                        onCreate={() => {
                          const name = (newSubNames[sid] ?? "").trim();
                          if (!name) return;
                          void createSubStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            parentStageId: stage._id,
                            name,
                          }).then(() =>
                            setNewSubNames((prev) => ({ ...prev, [sid]: "" })),
                          );
                        }}
                        onUpdate={(subStageId, patch) =>
                          void updateSubStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            subStageId,
                            ...patch,
                          })
                        }
                        onDelete={async (subStageId, name) => {
                          const ok = await confirm({
                            ...simpleDeleteConfirm(name, {
                              title: "Delete sub-stage",
                              impact: "This sub-stage is permanently removed.",
                            }),
                          });
                          if (!ok) return;
                          void deleteSubStage({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            subStageId,
                          });
                        }}
                        onReorder={(ordered) =>
                          void reorderSubStages({
                            organizationId: activeOrganizationId,
                            memberUserKey,
                            parentStageId: stage._id,
                            orderedSubStageIds: ordered,
                          })
                        }
                      />
                    )}
                  </div>
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="hidden flex-wrap items-center gap-2 border-t border-border/60 pt-4 md:flex">
        <Input
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          placeholder="New parent stage name"
          className="h-10 max-w-xs"
          aria-label="New parent stage name"
          onKeyDown={(e) => {
            if (e.key === "Enter") addStage();
          }}
        />
        <Button
          type="button"
          className="h-10 gap-1"
          disabled={!newStageName.trim()}
          onClick={addStage}
        >
          <Plus className="h-4 w-4" />
          Add stage
        </Button>
      </div>

      <div
        data-pipeline-stages-add-bar
        className={cn(
          "fixed inset-x-0 z-[calc(var(--shell-overlay-z,50)+2)] border-t border-border bg-background/95 backdrop-blur-md md:hidden",
          "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-dlc-md",
        )}
        style={{
          ...stickyBottomStyle,
          minHeight: PIPELINE_STAGES_MOBILE_ACTION_BAR_HEIGHT,
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="New parent stage name"
            className="h-11 min-h-[44px] flex-1 text-base"
            aria-label="New parent stage name"
            onKeyDown={(e) => {
              if (e.key === "Enter") addStage();
            }}
          />
          <Button
            type="button"
            className="h-11 min-h-[44px] shrink-0 gap-1 px-4"
            disabled={!newStageName.trim()}
            onClick={addStage}
          >
            <Plus className="h-4 w-4" />
            Add stage
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubStageList({
  parentName,
  subStages,
  archivedSubStages,
  parentOptions,
  newSubName,
  onNewSubNameChange,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: {
  parentName: string;
  subStages: Doc<"organizationPipelineSubStages">[];
  archivedSubStages: Doc<"organizationPipelineSubStages">[];
  parentOptions: { id: Id<"organizationPipelineStages">; name: string }[];
  newSubName: string;
  onNewSubNameChange: (v: string) => void;
  onCreate: () => void;
  onUpdate: (
    id: Id<"organizationPipelineSubStages">,
    patch: {
      name?: string;
      color?: string;
      isArchived?: boolean;
      parentStageId?: Id<"organizationPipelineStages">;
    },
  ) => void;
  onDelete: (
    id: Id<"organizationPipelineSubStages">,
    name: string,
  ) => void | Promise<void>;
  onReorder: (ordered: Id<"organizationPipelineSubStages">[]) => void;
}) {
  const ids = subStages.map((s) => String(s._id));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  return (
    <div className="ml-4 space-y-2 border-l border-border/60 pl-3 sm:ml-8">
      <p className="text-xs font-medium text-muted-foreground">
        Sub-stages under {parentName}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          const { active, over } = event;
          if (!over || active.id === over.id) return;
          const oldIndex = ids.indexOf(String(active.id));
          const newIndex = ids.indexOf(String(over.id));
          if (oldIndex < 0 || newIndex < 0) return;
          onReorder(
            arrayMove(ids, oldIndex, newIndex) as Id<"organizationPipelineSubStages">[],
          );
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {subStages.map((sub) => (
            <SortableRow key={String(sub._id)} id={String(sub._id)}>
              <SubStageRow
                sub={sub}
                parentOptions={parentOptions}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>
      {archivedSubStages.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Archived sub-stages
          </p>
          {archivedSubStages.map((sub) => (
            <div
              key={String(sub._id)}
              className="rounded-dlc-md border border-dashed border-border/60 bg-muted/20 p-2 opacity-80"
            >
              <SubStageRow
                sub={sub}
                parentOptions={parentOptions}
                onUpdate={onUpdate}
                onDelete={onDelete}
                archived
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2 pt-1">
        <Input
          value={newSubName}
          onChange={(e) => onNewSubNameChange(e.target.value)}
          placeholder="New sub-stage"
          className="h-11 min-h-[44px] text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-11 min-h-[44px] shrink-0 px-4"
          disabled={!newSubName.trim()}
          onClick={onCreate}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function SubStageRow({
  sub,
  parentOptions,
  onUpdate,
  onDelete,
  archived = false,
}: {
  sub: Doc<"organizationPipelineSubStages">;
  parentOptions: { id: Id<"organizationPipelineStages">; name: string }[];
  onUpdate: (
    id: Id<"organizationPipelineSubStages">,
    patch: {
      name?: string;
      color?: string;
      isArchived?: boolean;
      parentStageId?: Id<"organizationPipelineStages">;
    },
  ) => void;
  onDelete: (id: Id<"organizationPipelineSubStages">, name: string) => void;
  archived?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: sub.color }}
        aria-hidden
      />
      <DebouncedPersistedField
        value={sub.name}
        inputClassName="h-10 min-w-[8rem] flex-1 text-xs"
        onSave={async (name) => {
          await onUpdate(sub._id, { name });
        }}
      />
      <select
        value={String(sub.parentStageId)}
        className="h-10 max-w-[9rem] shrink-0 rounded-dlc-sm border border-input bg-background px-1 text-[10px]"
        aria-label={`Move ${sub.name} to parent stage`}
        onChange={(e) =>
          onUpdate(sub._id, {
            parentStageId: e.target.value as Id<"organizationPipelineStages">,
          })
        }
      >
        {parentOptions.map((p) => (
          <option key={String(p.id)} value={String(p.id)}>
            {p.name}
          </option>
        ))}
      </select>
      <Input
        type="color"
        defaultValue={sub.color}
        className="h-10 w-10 shrink-0 p-0.5"
        aria-label="Sub-stage color"
        onChange={(e) => onUpdate(sub._id, { color: e.target.value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-10 shrink-0"
        title={archived ? "Restore sub-stage" : "Archive sub-stage"}
        onClick={() => onUpdate(sub._id, { isArchived: !archived })}
      >
        {archived ? (
          <ArchiveRestore className="h-4 w-4" />
        ) : (
          <Archive className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-10 shrink-0 text-destructive"
        onClick={() => void onDelete(sub._id, sub.name)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
