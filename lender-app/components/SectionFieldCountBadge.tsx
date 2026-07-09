"use client";

import { cn } from "@/lib/cn";

/**
 * Compact count of filled / meaningful fields for a collapsible file section.
 * Stays visible in the section header at all breakpoints.
 */
export function SectionFieldCountBadge({
  count,
  className,
  emphasize,
}: {
  count: number;
  className?: string;
  /**
   * When the parent section is collapsed, surface the count more clearly
   * (still hidden when count is 0).
   */
  emphasize?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold tabular-nums shadow-sm",
        emphasize && count > 0
          ? "border-[color:var(--ui-indicator)] bg-[color:var(--ui-indicator-soft-bg)] text-[color:var(--ui-indicator)]"
          : "border-border/70 bg-muted/70 text-muted-foreground opacity-80",
        className
      )}
      aria-label={`${count} fields with data`}
    >
      {count > 999 ? "999+" : count}
    </span>
  );
}
