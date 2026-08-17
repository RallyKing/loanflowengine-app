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
 * 4px left border + triage badge.
 * Mobile: badge is in document flow (own row) so it never overlays titles.
 * Desktop (md+): absolute top-right; callers reserve space with `md:pr-28`.
 */
export function HubTriageHighlightFrame({
  highlight,
  children,
  className,
  badgeClassName,
}: {
  highlight?: HubTriageHighlightView | null;
  children: ReactNode;
  className?: string;
  /** Desktop absolute offset only (e.g. `top-1.5`). Ignored on max-md flow badge. */
  badgeClassName?: string;
}) {
  if (!highlight) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn("relative", className)}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: highlight.hexCode,
        boxShadow: `inset 4px 0 14px -4px ${highlight.hexCode}33`,
      }}
      data-testid="hub-triage-highlight-frame"
      data-triage-color={highlight.hexCode}
    >
      {/* Mobile: in-flow — never overlays title / project / ★ lines */}
      <div
        className="pointer-events-none flex w-full justify-end px-2.5 pb-0 pt-2 md:hidden"
        data-testid="hub-triage-highlight-badge-slot-mobile"
      >
        <HubTriageHighlightBadge highlight={highlight} />
      </div>
      {/* Desktop: absolute top-right (pointer-events-none so stage pill stays clickable) */}
      <div
        className={cn(
          "pointer-events-none absolute right-2 top-2 z-[2] hidden md:block",
          badgeClassName,
        )}
        data-testid="hub-triage-highlight-badge-slot-desktop"
      >
        <HubTriageHighlightBadge highlight={highlight} />
      </div>
      {children}
    </div>
  );
}
