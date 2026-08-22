"use client";

import {
  ChevronLeft,
  ChevronRight,
  Crop,
  Edit3,
  Highlighter,
  Info,
  Loader2,
  Maximize2,
  AppWindow,
  Merge,
  Minimize2,
  RotateCcw,
  RotateCw,
  Save,
  StickyNote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Id } from "@/convex/_generated/dataModel";
import type { AnnotationToolMode } from "@/components/library/DocumentAnnotationLayer";

export type MergeCandidate = {
  documentId: string;
  title: string;
};

export type VaultPreviewBreadcrumb = {
  id: Id<"documentFolders"> | null;
  name: string;
};

export type DocumentManipulationToolbarProps = {
  versionNumber: number;
  pageIndex: number;
  pageCount: number;
  busy: boolean;
  annotationMode: AnnotationToolMode;
  mergeCandidates: MergeCandidate[];
  canMutate: boolean;
  onRotate: (direction: "cw" | "ccw") => void;
  onExtractPages: () => void;
  onMergeSelect: (documentId: string) => void;
  onAnnotationModeChange: (mode: AnnotationToolMode) => void;
  onSaveAnnotations: () => void;
  onFinalize: () => void;
  onPageChange: (pageIndex: number) => void;
  breadcrumbs?: VaultPreviewBreadcrumb[];
  onBreadcrumbSelect?: (folderId: Id<"documentFolders"> | null) => void;
  onClosePreview?: () => void;
  onToggleFullscreen?: () => void;
  previewFullscreen?: boolean;
  /** Float the current document (closes modal when provided by parent). */
  onOpenInWindow?: () => void;
  onOpenProperties?: () => void;
  fileName?: string;
  className?: string;
  canEnterEditMode?: boolean;
  onEnterEditMode?: () => void;
  onCancelEditMode?: () => void;
};

export function DocumentManipulationToolbar({
  versionNumber,
  pageIndex,
  pageCount,
  busy,
  annotationMode,
  mergeCandidates,
  canMutate,
  onRotate,
  onExtractPages,
  onMergeSelect,
  onAnnotationModeChange,
  onSaveAnnotations,
  onFinalize,
  onPageChange,
  breadcrumbs,
  onBreadcrumbSelect,
  onClosePreview,
  onToggleFullscreen,
  previewFullscreen = false,
  onOpenInWindow,
  onOpenProperties,
  fileName,
  className,
  canEnterEditMode = false,
  onEnterEditMode,
  onCancelEditMode,
}: DocumentManipulationToolbarProps) {
  const chromeActions =
    onClosePreview ||
    onToggleFullscreen ||
    onOpenInWindow ||
    onOpenProperties ||
    onEnterEditMode ||
    onCancelEditMode ? (
      <div className="flex shrink-0 items-center gap-0.5">
        {canEnterEditMode && onEnterEditMode ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={onEnterEditMode}
            data-testid="document-vault-enter-edit-mode"
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden />
            Edit document
          </Button>
        ) : null}
        {onCancelEditMode ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={onCancelEditMode}
            data-testid="document-vault-cancel-edit-mode"
          >
            Cancel Editing
          </Button>
        ) : null}
        {onOpenProperties ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onOpenProperties}
            aria-label="Document properties"
            title="Properties"
          >
            <Info className="h-4 w-4" />
          </Button>
        ) : null}
        {onOpenInWindow ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            onClick={onOpenInWindow}
            aria-label="Open in floating window"
            title="Open in floating window"
            data-testid="document-vault-open-in-window"
          >
            <AppWindow className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Window</span>
          </Button>
        ) : null}
        {onToggleFullscreen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onToggleFullscreen}
            aria-label={
              previewFullscreen ? "Exit fullscreen preview" : "Fullscreen preview"
            }
            title={previewFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {previewFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        ) : null}
        {onClosePreview ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClosePreview}
            aria-label="Close preview"
            data-testid="document-vault-close-preview"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 border-b border-border/60 bg-dlc-surface-high/80 px-3 py-2",
        className,
      )}
      data-testid="document-manipulation-toolbar"
    >
      {breadcrumbs && breadcrumbs.length > 0 && onBreadcrumbSelect ? (
        <nav
          className="flex min-w-0 flex-wrap items-center gap-1 text-xs"
          aria-label="Folder location"
          data-testid="document-vault-preview-breadcrumbs"
        >
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id ?? "root"} className="inline-flex min-w-0 items-center gap-1">
              {i > 0 ? (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
              <button
                type="button"
                className={cn(
                  "max-w-[10rem] truncate rounded-dlc-sm px-1 py-0.5 font-medium hover:bg-muted/50",
                  i === breadcrumbs.length - 1
                    ? "text-foreground"
                    : "text-primary",
                )}
                disabled={i === breadcrumbs.length - 1}
                onClick={() => onBreadcrumbSelect(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
          {fileName ? (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-[12rem] truncate font-medium text-muted-foreground">
                {fileName}
              </span>
            </>
          ) : null}
          <span className="ml-auto">{chromeActions}</span>
        </nav>
      ) : (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {fileName ? (
            <p className="min-w-0 truncate text-sm font-medium">{fileName}</p>
          ) : (
            <span />
          )}
          {chromeActions}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            data-testid="document-vault-version-badge"
          >
            Version {versionNumber}
          </span>
          {pageCount > 0 ? (
            <div className="inline-flex items-center gap-0.5 rounded-dlc-sm border border-input bg-background">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={busy || pageIndex <= 0}
                onClick={() => onPageChange(pageIndex - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
                {pageIndex + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={busy || pageIndex >= pageCount - 1}
                onClick={() => onPageChange(pageIndex + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
        {canMutate ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={() => onRotate("ccw")}
              title="Rotate 90° counter-clockwise"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Rotate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={busy}
              onClick={() => onRotate("cw")}
              title="Rotate 90° clockwise"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={onExtractPages}
            >
              <Crop className="h-3.5 w-3.5" />
              Extract
            </Button>
            {mergeCandidates.length > 0 ? (
              <label className="inline-flex h-8 items-center gap-1 rounded-dlc-sm border border-input bg-background px-2 text-xs">
                <Merge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <select
                  className="max-w-[8rem] bg-transparent text-base outline-none md:text-xs"
                  defaultValue=""
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (v) onMergeSelect(v);
                  }}
                  aria-label="Append document"
                >
                  <option value="">Append…</option>
                  {mergeCandidates.map((c) => (
                    <option key={c.documentId} value={c.documentId}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button
              type="button"
              variant={annotationMode === "highlight" ? "primary" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              disabled={busy}
              onClick={() =>
                onAnnotationModeChange(
                  annotationMode === "highlight" ? "view" : "highlight",
                )
              }
              title="Highlight"
            >
              <Highlighter className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={annotationMode === "note" ? "primary" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              disabled={busy}
              onClick={() =>
                onAnnotationModeChange(
                  annotationMode === "note" ? "view" : "note",
                )
              }
              title="Sticky note"
            >
              <StickyNote className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={onSaveAnnotations}
            >
              <Save className="h-3.5 w-3.5" />
              Save notes
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={onFinalize}
              data-testid="document-vault-finalize-save"
            >
              Finalize &amp; Save
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
