"use client";

import type { ReactNode } from "react";
import { ListTodo } from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  HubTriageHighlightView,
  TaskRollupCountsView,
} from "@/lib/pipeline/hubTriageHighlight";

/**
 * Phase Modular-D — compact open/overdue task roll-up pill.
 * Rendered beside `HubTriageHighlightBadge` on hub file rows, mobile cards,
 * hierarchy rows, and the client workspace header. Returns null when no open tasks.
 */
export function TaskRollupBadge({
  counts,
  className,
}: {
  counts: TaskRollupCountsView | null | undefined;
  className?: string;
}) {
  if (!counts || counts.open <= 0) return null;
  const hasOverdue = counts.overdue > 0;
  const title = hasOverdue
    ? `${counts.open} open task${counts.open === 1 ? "" : "s"} — ${counts.overdue} overdue`
    : `${counts.open} open task${counts.open === 1 ? "" : "s"}${
        counts.topStatus === "in_progress" ? " — in progress" : ""
      }`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-dlc-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-dlc-1",
        hasOverdue
          ? "border-red-300/80 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          : counts.topStatus === "in_progress"
            ? "border-blue-300/80 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
            : "border-border/55 bg-dlc-surface-high text-muted-foreground",
        className,
      )}
      title={title}
      aria-label={title}
      data-testid="hub-task-rollup-badge"
    >
      <ListTodo className="h-3 w-3 shrink-0" aria-hidden />
      {counts.open}
      {hasOverdue ? (
        <span className="font-bold" data-testid="hub-task-rollup-overdue">
          · {counts.overdue} late
        </span>
      ) : null}
    </span>
  );
}

export function HubTriageHighlightBadge({
  highlight,
  className,
}: {
  highlight: HubTriageHighlightView;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-dlc-full px-2 py-0.5",
        "text-[10px] font-semibold shadow-dlc-1",
        "max-md:max-w-[min(100%,18rem)] md:max-w-[12rem]",
        className,
      )}
      style={{
        color: highlight.hexCode,
        backgroundColor: `${highlight.hexCode}18`,
        boxShadow: `0 0 0 1px ${highlight.hexCode}40`,
      }}
      title={`${highlight.label}: ${highlight.taskTitle}`}
      data-testid="hub-triage-highlight-badge"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-dlc-full shadow-dlc-1"
        style={{ backgroundColor: highlight.hexCode }}
        aria-hidden
      />
      <span className="min-w-0 truncate">{highlight.label}</span>
    </span>
  );
}

/**
 * Optional left accent + single top-right badge stack (one React mount).
 * Mobile: in-flow via `max-md:static`; desktop: absolute top-right.
 * Callers reserve space with `md:pr-28` / `md:pr-32` when chrome is present.
 */
export function HubTriageHighlightFrame({
  highlight,
  children,
  className,
  badgeClassName,
  underBadge,
}: {
  highlight?: HubTriageHighlightView | null;
  children: ReactNode;
  className?: string;
  /** Desktop absolute offset only (e.g. `top-1.5`). */
  badgeClassName?: string;
  /** Rendered under the triage badge (far-right card rail). Mount once. */
  underBadge?: ReactNode;
}) {
  const hasChrome = Boolean(highlight) || underBadge != null;

  if (!hasChrome) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn("relative", className)}
      style={
        highlight
          ? {
              borderLeftWidth: 4,
              borderLeftColor: highlight.hexCode,
              boxShadow: `inset 4px 0 14px -4px ${highlight.hexCode}33`,
            }
          : undefined
      }
      data-testid={
        highlight ? "hub-triage-highlight-frame" : "hub-file-tasks-frame"
      }
      data-triage-color={highlight?.hexCode}
    >
      {/* One stack — in-flow on mobile, absolute on md+ (never duplicate stateful underBadge). */}
      <div
        className={cn(
          "pointer-events-none z-[2] flex max-w-full flex-col items-end gap-1",
          "max-md:relative max-md:w-full max-md:px-2.5 max-md:pb-0 max-md:pt-2",
          "md:absolute md:right-2 md:top-2",
          badgeClassName,
        )}
        data-testid="hub-triage-highlight-badge-stack"
      >
        {highlight ? <HubTriageHighlightBadge highlight={highlight} /> : null}
        {underBadge}
      </div>
      {children}
    </div>
  );
}
