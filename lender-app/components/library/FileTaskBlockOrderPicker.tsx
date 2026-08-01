"use client";

import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";
import {
  CLIENT_PORTAL_ASSIGNABLE_BLOCK_IDS,
  clientPortalBlockDescription,
  clientPortalBlockLabel,
} from "@/lib/documentVaultClientBlocks";
import type { AssignedBlockEntry } from "@/lib/documentVaultTaskTypes";
import { cn } from "@/lib/cn";

export type FileTaskBlockOrderPickerProps = {
  value: AssignedBlockEntry[];
  onChange: (entries: AssignedBlockEntry[]) => void;
  disabled?: boolean;
  className?: string;
};

export function FileTaskBlockOrderPicker({
  value,
  onChange,
  disabled = false,
  className,
}: FileTaskBlockOrderPickerProps) {
  const selectedIds = new Set(value.map((e) => e.blockId));
  const ordered = [...value].sort((a, b) => a.sortOrder - b.sortOrder);
  const available = CLIENT_PORTAL_ASSIGNABLE_BLOCK_IDS.filter(
    (id) => !selectedIds.has(id),
  );

  const setOrdered = (ids: string[]) => {
    onChange(
      ids.map((blockId, index) => ({
        blockId,
        sortOrder: (index + 1) * 1000,
      })),
    );
  };

  const addBlock = (blockId: string) => {
    if (disabled || selectedIds.has(blockId)) return;
    setOrdered([...ordered.map((e) => e.blockId), blockId]);
  };

  const removeBlock = (blockId: string) => {
    if (disabled) return;
    setOrdered(ordered.map((e) => e.blockId).filter((id) => id !== blockId));
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    if (disabled) return;
    const ids = ordered.map((e) => e.blockId);
    const index = ids.indexOf(blockId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= ids.length) return;
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item!);
    setOrdered(next);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Pipeline blocks (client order)
      </p>

      {ordered.length > 0 ? (
        <ol className="space-y-1.5">
          {ordered.map((entry, index) => (
            <li
              key={entry.blockId}
              className="flex items-center gap-1.5 rounded-dlc-md border border-border/70 bg-dlc-surface px-2 py-1.5"
            >
              <GripVertical
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {index + 1}.
                </span>{" "}
                <span className="text-xs font-medium text-foreground">
                  {clientPortalBlockLabel(entry.blockId)}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="rounded-dlc-sm p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${clientPortalBlockLabel(entry.blockId)} up`}
                  onClick={() => moveBlock(entry.blockId, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-dlc-sm p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
                  disabled={disabled || index === ordered.length - 1}
                  aria-label={`Move ${clientPortalBlockLabel(entry.blockId)} down`}
                  onClick={() => moveBlock(entry.blockId, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-dlc-sm p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                  disabled={disabled}
                  aria-label={`Remove ${clientPortalBlockLabel(entry.blockId)}`}
                  onClick={() => removeBlock(entry.blockId)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No blocks selected. Add blocks below — clients will complete them top
          to bottom.
        </p>
      )}

      {available.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {available.map((blockId) => (
            <button
              key={blockId}
              type="button"
              disabled={disabled}
              title={clientPortalBlockDescription(blockId)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary",
                disabled && "opacity-50",
              )}
              onClick={() => addBlock(blockId)}
            >
              <Plus className="h-3 w-3" aria-hidden />
              {clientPortalBlockLabel(blockId)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use FileTaskBlockOrderPicker */
export { FileTaskBlockOrderPicker as FileTaskBlockAssignPicker };
