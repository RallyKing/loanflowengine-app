"use client";

import { Archive } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatAutoArchiveRemainingShort,
  formatAutoArchiveTooltip,
  remainingAutoArchiveMs,
} from "@/lib/pipelineAutoArchive";

type Props = {
  autoArchiveInactivityDays?: number | null;
  autoArchiveAfterAt?: number | null;
  lastActivityAt: number;
  now?: number;
  compact?: boolean;
  className?: string;
};

/** Small hub/table marker when a file has auto-archive-on-inactivity enabled. */
export function PipelineFileAutoArchiveMarker({
  autoArchiveInactivityDays,
  autoArchiveAfterAt,
  lastActivityAt,
  now = Date.now(),
  compact = true,
  className,
}: Props) {
  if (autoArchiveInactivityDays == null && autoArchiveAfterAt == null) {
    return null;
  }
  const remaining = remainingAutoArchiveMs({
    now,
    autoArchiveAfterAt,
    lastActivityAt,
    inactivityDays: autoArchiveInactivityDays,
  });
  const short = formatAutoArchiveRemainingShort(remaining);
  const tooltip = formatAutoArchiveTooltip({
    now,
    inactivityDays: autoArchiveInactivityDays,
    autoArchiveAfterAt,
    lastActivityAt,
  });
  const due = remaining != null && remaining <= 0;

  return (
    <span
      role="img"
      aria-label={tooltip}
      title={tooltip}
      data-testid="pipeline-file-auto-archive-marker"
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-semibold uppercase tracking-wider shadow-dlc-1",
        due
          ? "border-amber-400/90 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200"
          : "border-violet-300/90 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/70 dark:text-violet-200",
        compact ? "text-[10px]" : "text-[11px]",
        className,
      )}
    >
      <Archive className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {short ? <span className="tabular-nums">{short}</span> : null}
    </span>
  );
}
