"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";

type DragHandleProps = {
  disabled?: boolean;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
};

/** Icon grip — attach to sortable section headers; does not toggle collapsible. */
export function SectionDragHandle({
  disabled,
  attributes,
  listeners,
}: DragHandleProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-dlc-sm text-muted-foreground touch-none",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing",
      )}
      aria-label="Reorder section"
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

export type SortableSectionListProps = {
  itemIds: string[];
  onDragEnd: (event: DragEndEvent) => void;
  disabled?: boolean;
  children: ReactNode;
};

/** Vertical sortable list — PointerSensor distance 6 preserves workspace scroll. */
export function SortableSectionList({
  itemIds,
  onDragEnd,
  disabled = false,
  children,
}: SortableSectionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={disabled ? undefined : onDragEnd}
    >
      <SortableContext
        items={itemIds}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

export type SortableSectionItemProps = {
  id: string;
  disabled?: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
};

export function SortableSectionItem({
  id,
  disabled,
  children,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "min-w-0",
        isDragging && "relative z-10 opacity-95 shadow-dlc-md",
      )}
      data-sortable-section-id={id}
    >
      {children(
        <SectionDragHandle
          disabled={disabled}
          attributes={attributes}
          listeners={listeners}
        />,
      )}
    </div>
  );
}
