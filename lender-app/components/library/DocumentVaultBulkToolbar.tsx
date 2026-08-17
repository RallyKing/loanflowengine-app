"use client";

import { Download, FolderInput, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type DocumentVaultBulkToolbarProps = {
  count: number;
  busy?: boolean;
  onMove: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onDueDiligence?: () => void;
  onClear: () => void;
  className?: string;
};

export function DocumentVaultBulkToolbar({
  count,
  busy = false,
  onMove,
  onDelete,
  onDownload,
  onDueDiligence,
  onClear,
  className,
}: DocumentVaultBulkToolbarProps) {
  if (count <= 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-dlc-md border border-primary/30 bg-primary/5 px-3 py-2",
        className,
      )}
      data-testid="document-vault-bulk-toolbar"
      role="status"
    >
      <span className="text-sm font-medium text-foreground">
        {count} selected
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          disabled={busy}
          onClick={onMove}
        >
          <FolderInput className="h-3.5 w-3.5" />
          Move to…
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          disabled={busy}
          onClick={onDownload}
        >
          <Download className="h-3.5 w-3.5" />
          Download zip
        </Button>
        {onDueDiligence ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            disabled={busy}
            onClick={onDueDiligence}
            data-testid="document-vault-due-diligence"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Due Diligence
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={busy}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
