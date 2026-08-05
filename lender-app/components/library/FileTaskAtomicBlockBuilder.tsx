"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ATOMIC_PORTAL_BLOCKS_BY_CATEGORY,
  ATOMIC_PORTAL_CATEGORY_LABELS,
  getAtomicPortalBlock,
  isAtomicPortalBlockId,
  normalizeToAtomicBlockIds,
  type AtomicPortalBlockCategory,
  type AtomicPortalBlockId,
} from "@/lib/atomicPortalBlockRegistry";
import type { AssignedBlockEntry } from "@/lib/documentVaultTaskTypes";
import { AtomicPortalBlockRenderer } from "@/components/library/AtomicPortalBlockRenderer";
import { CollapsibleBlock } from "@/components/ui/CollapsibleBlock";
import { cn } from "@/lib/cn";

export type FileTaskAtomicBlockBuilderProps = {
  value: AssignedBlockEntry[];
  onChange: (entries: AssignedBlockEntry[]) => void;
  pipelineFileId?: Id<"pipeline">;
  memberUserKey?: string;
  disabled?: boolean;
  className?: string;
};

function sortableId(blockId: string) {
  return `atomic-staging-${blockId}`;
}

function SortableStagingCard({
  blockId,
  index,
  pipelineFileId,
  memberUserKey,
  disabled,
  onRemove,
}: {
  blockId: AtomicPortalBlockId;
  index: number;
  pipelineFileId?: Id<"pipeline">;
  memberUserKey?: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId(blockId), disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const def = getAtomicPortalBlock(blockId);

  const dragHandle = (
    <button
      type="button"
      className="inline-flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-dlc-sm text-muted-foreground hover:bg-muted/50 active:cursor-grabbing"
      aria-label={`Drag ${def.label}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" aria-hidden />
    </button>
  );

  const removeBtn = (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-dlc-sm text-muted-foreground hover:text-destructive"
      disabled={disabled}
      aria-label={`Remove ${def.label}`}
      onClick={onRemove}
    >
      <X className="h-3.5 w-3.5" aria-hidden />
    </button>
  );

  if (pipelineFileId) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(isDragging && "opacity-60")}
      >
        <AtomicPortalBlockRenderer
          blockId={blockId}
          pipelineFileId={pipelineFileId}
          memberUserKey={memberUserKey}
          readOnly
          useCollapsibleChrome
          headerLeading={dragHandle}
          headerRight={removeBtn}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-60")}>
      <CollapsibleBlock
        id={`staging-${blockId}`}
        title={def.label}
        status={def.defaultStatus}
        summary={def.defaultSummary}
        description={def.description}
        density="compact"
        headerLeading={dragHandle}
        headerRight={removeBtn}
        clientAssignBlockId={false}
      >
        <p className="text-xs text-muted-foreground">
          Live preview requires an open pipeline file. Clients will see the full{" "}
          {def.label} form here.
        </p>
      </CollapsibleBlock>
    </div>
  );
}

export function FileTaskAtomicBlockBuilder({
  value,
  onChange,
  pipelineFileId,
  memberUserKey,
  disabled = false,
  className,
}: FileTaskAtomicBlockBuilderProps) {
  const [libraryCategory, setLibraryCategory] =
    useState<AtomicPortalBlockCategory>("intake");

  const ordered = useMemo(() => {
    const ids = [...value]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((e) =>
        isAtomicPortalBlockId(e.blockId)
          ? [e.blockId]
          : normalizeToAtomicBlockIds(e.blockId, true),
      );
    const seen = new Set<string>();
    return ids.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }) as AtomicPortalBlockId[];
  }, [value]);

  const selectedSet = new Set<string>(ordered);

  const setOrdered = (ids: AtomicPortalBlockId[]) => {
    onChange(
      ids.map((blockId, index) => ({
        blockId,
        sortOrder: (index + 1) * 1000,
      })),
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((id) => sortableId(id) === String(active.id));
    const newIndex = ordered.findIndex((id) => sortableId(id) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrdered(arrayMove(ordered, oldIndex, newIndex));
  };

  const libraryBlocks =
    ATOMIC_PORTAL_BLOCKS_BY_CATEGORY.get(libraryCategory) ?? [];

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Block library
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(
            Object.keys(ATOMIC_PORTAL_CATEGORY_LABELS) as AtomicPortalBlockCategory[]
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              disabled={disabled}
              className={cn(
                "rounded-dlc-sm px-2 py-1 text-[10px] font-medium transition-colors",
                libraryCategory === cat
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setLibraryCategory(cat)}
            >
              {ATOMIC_PORTAL_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {libraryBlocks.map((block) => {
            const added = selectedSet.has(block.id);
            return (
              <button
                key={block.id}
                type="button"
                disabled={disabled || added}
                title={block.description}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                  added
                    ? "border-border/40 bg-muted/30 text-muted-foreground opacity-50"
                    : "border-dashed border-border hover:border-primary/50 hover:text-primary",
                )}
                onClick={() => setOrdered([...ordered, block.id])}
              >
                <Plus className="h-3 w-3" aria-hidden />
                {block.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Client flow (drag to reorder)
        </p>
        {ordered.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Add atomic blocks from the library. Each card previews what the client
            will see, in order.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((id) => sortableId(id))}
              strategy={verticalListSortingStrategy}
            >
              <div className="mt-2 space-y-2">
                {ordered.map((blockId, index) => (
                  <SortableStagingCard
                    key={blockId}
                    blockId={blockId}
                    index={index}
                    pipelineFileId={pipelineFileId}
                    memberUserKey={memberUserKey}
                    disabled={disabled}
                    onRemove={() =>
                      setOrdered(ordered.filter((id) => id !== blockId))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
