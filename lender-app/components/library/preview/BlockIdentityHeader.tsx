"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatRelativeTimestamp } from "@/lib/formatRelativeTimestamp";

export type BlockIdentityHeaderProps = {
  fileName: string;
  fileType: string;
  pageCount?: number | null;
  pageCountLoading?: boolean;
  lastModified?: number;
  mode?: "view" | "edit";
  className?: string;
  canEditTitle?: boolean;
  isEditingTitle?: boolean;
  editTitleValue?: string;
  onStartEditTitle?: () => void;
  onEditTitleChange?: (value: string) => void;
  onSaveTitle?: () => void;
  onCancelEditTitle?: () => void;
};

function formatPageSummary(
  pageCount: number | null | undefined,
  loading: boolean,
): string {
  if (loading) return "Counting pages…";
  if (pageCount == null) return "Pages unknown";
  if (pageCount === 1) return "1 page";
  return `${pageCount} pages`;
}

export function BlockIdentityHeader({
  fileName,
  fileType,
  pageCount,
  pageCountLoading = false,
  lastModified,
  mode = "view",
  className,
  canEditTitle = false,
  isEditingTitle = false,
  editTitleValue = "",
  onStartEditTitle,
  onEditTitleChange,
  onSaveTitle,
  onCancelEditTitle,
}: BlockIdentityHeaderProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const lastUpdated =
    lastModified != null
      ? `Last updated ${formatRelativeTimestamp(lastModified)}`
      : "Last updated unknown";

  const summary = `${formatPageSummary(pageCount, pageCountLoading)} • ${lastUpdated}`;

  const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.stopPropagation();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSaveTitle?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEditTitle?.();
    }
  };

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-3 border-b border-border/60 bg-muted/10 px-4 py-2",
        className,
      )}
      data-testid="document-vault-block-identity-header"
      data-preview-mode={mode}
    >
      <Badge variant="accent" className="shrink-0 font-mono text-[10px] uppercase">
        {fileType}
      </Badge>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {isEditingTitle ? (
          <>
            <input
              ref={titleInputRef}
              type="text"
              value={editTitleValue}
              onChange={(e) => onEditTitleChange?.(e.target.value)}
              onKeyDown={onTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded-dlc-sm border border-border/80 bg-dlc-surface px-2 py-1 text-sm font-medium outline-none ring-1 ring-primary/20 focus:ring-primary/40"
              aria-label="Edit document title"
              data-testid="document-preview-title-input"
            />
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-dlc-sm text-emerald-600 hover:bg-emerald-500/10"
              aria-label="Save document title"
              data-testid="document-preview-title-save"
              onClick={(e) => {
                e.stopPropagation();
                onSaveTitle?.();
              }}
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-dlc-sm text-destructive hover:bg-destructive/10"
              aria-label="Cancel title edit"
              data-testid="document-preview-title-cancel"
              onClick={(e) => {
                e.stopPropagation();
                onCancelEditTitle?.();
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </>
        ) : (
          <button
            type="button"
            className={cn(
              "min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground",
              canEditTitle &&
                "cursor-text hover:underline decoration-dotted underline-offset-2",
            )}
            onClick={() => {
              if (canEditTitle) onStartEditTitle?.();
            }}
            disabled={!canEditTitle}
          >
            {fileName}
          </button>
        )}
      </div>
      <div className="shrink-0 text-xs text-muted-foreground">{summary}</div>
    </div>
  );
}

export function fileTypeBadgeLabel(
  contentType: string | undefined,
  fileName: string,
): string {
  const kind = contentType?.toLowerCase() ?? "";
  const name = fileName.toLowerCase();
  if (kind.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (kind.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(name)) {
    return "IMG";
  }
  if (kind.includes("html") || name.endsWith(".html") || name.endsWith(".htm")) {
    return "HTML";
  }
  if (kind.startsWith("text/") || name.endsWith(".txt")) return "TXT";
  if (/scan/i.test(fileName)) return "SCAN";
  return "FILE";
}
