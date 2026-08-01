"use client";

import { Loader2, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type ContactsBulkToolbarProps = {
  count: number;
  busy?: boolean;
  canMutate?: boolean;
  onAssignTag: () => void;
  onDelete: () => void;
  onClear: () => void;
  className?: string;
};

export function ContactsBulkToolbar({
  count,
  busy = false,
  canMutate = true,
  onAssignTag,
  onDelete,
  onClear,
  className,
}: ContactsBulkToolbarProps) {
  if (count <= 0) return null;

  return (
    <div
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-dlc-md border border-primary/30 bg-primary/5 px-3 py-2",
        className,
      )}
      data-testid="contacts-bulk-toolbar"
      role="status"
    >
      <span className="text-sm font-medium text-foreground">
        {count} selected
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {canMutate ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={onAssignTag}
              data-testid="contacts-bulk-assign-tag"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Tag className="h-3.5 w-3.5" aria-hidden />
              )}
              Assign tag
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={onDelete}
              data-testid="contacts-bulk-delete"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete selected
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={busy}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
