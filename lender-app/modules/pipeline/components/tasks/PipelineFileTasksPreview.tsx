"use client";

import { ListTodo } from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  HubTriageHighlightView,
  TaskRollupCountsView,
} from "@/lib/pipeline/hubTriageHighlight";

export type PipelineFileTasksPreviewProps = {
  fileName: string;
  highlight?: HubTriageHighlightView | null;
  counts?: TaskRollupCountsView | null;
  onOpen: () => void;
  className?: string;
};

/**
 * Compact clickable preview of open tasks for a pipeline file card.
 * Uses hub triage rollup DTOs already on the card — no per-card task query.
 */
export function PipelineFileTasksPreview({
  fileName,
  highlight,
  counts,
  onOpen,
  className,
}: PipelineFileTasksPreviewProps) {
  const openCount = counts?.open ?? 0;
  const hasOpen = openCount > 0;
  const primaryTitle = highlight?.taskTitle?.trim() || "";
  const overdue = counts?.overdue ?? 0;

  const label = !hasOpen
    ? "No open tasks"
    : primaryTitle
      ? openCount > 1
        ? `${primaryTitle} · +${openCount - 1}`
        : primaryTitle
      : `${openCount} open task${openCount === 1 ? "" : "s"}`;

  const aria = !hasOpen
    ? `No open tasks on ${fileName}. Open tasks.`
    : overdue > 0
      ? `${openCount} open task${openCount === 1 ? "" : "s"} on ${fileName}, ${overdue} overdue. Open tasks.`
      : `${openCount} open task${openCount === 1 ? "" : "s"} on ${fileName}. Open tasks.`;

  return (
    <button
      type="button"
      className={cn(
        "pointer-events-auto inline-flex max-w-[12rem] items-center gap-1 rounded-dlc-md border border-border/55 bg-dlc-surface-high/95 px-1.5 py-1",
        "text-left text-[10px] font-medium leading-tight text-muted-foreground shadow-dlc-1",
        "transition-colors duration-dlc-short1 ease-dlc-standard",
        "hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        hasOpen
          ? overdue > 0
            ? "border-red-300/70 text-red-700 dark:border-red-900 dark:text-red-300"
            : "text-foreground/85"
          : "border-dashed opacity-90",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onOpen();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={aria}
      title={aria}
      data-testid="pipeline-file-tasks-preview"
      data-open-count={openCount}
    >
      <ListTodo
        className={cn(
          "h-3 w-3 shrink-0",
          hasOpen ? "opacity-90" : "opacity-60",
        )}
        aria-hidden
      />
      <span className="min-w-0 truncate">{label}</span>
      {hasOpen ? (
        <span
          className="shrink-0 tabular-nums text-[9px] font-semibold text-muted-foreground"
          data-testid="pipeline-file-tasks-preview-count"
        >
          {openCount}
        </span>
      ) : null}
    </button>
  );
}
