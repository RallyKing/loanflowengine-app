"use client";

import { Archive } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  archivedAt?: number | null;
  compact?: boolean;
  /** Show “Archived” text next to the icon (table / denser lists). */
  withLabel?: boolean;
  className?: string;
};

/** Leading archive marker for pipeline hub/table file rows. */
export function PipelineFileArchivedIndicator({
  archivedAt,
  compact = false,
  withLabel = false,
  className,
}: Props) {
  if (archivedAt == null) return null;

  const archivedLabel = new Date(archivedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <span
      role="img"
      aria-label={`Archived file (${archivedLabel})`}
      title={`Archived ${archivedLabel}`}
      data-testid="pipeline-file-archived-indicator"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-amber-300/90 bg-amber-50 font-semibold uppercase tracking-wider text-amber-800 shadow-dlc-1",
        "dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200",
        withLabel
          ? cn(
              "gap-1 rounded-full px-1.5 py-0.5",
              compact ? "text-[10px]" : "text-[11px]",
            )
          : cn(
              "rounded-dlc-sm",
              compact ? "h-6 w-6" : "h-7 w-7",
            ),
        className,
      )}
    >
      <Archive
        className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4")}
        aria-hidden
      />
      {withLabel ? <span>Archived</span> : null}
    </span>
  );
}
