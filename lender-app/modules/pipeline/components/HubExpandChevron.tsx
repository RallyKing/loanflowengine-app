"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type HubExpandChevronProps = {
  expanded: boolean;
  onToggle: () => void;
  /** For `aria-label` (e.g. client or project name). */
  label: string;
  className?: string;
};

/**
 * Pipeline hub hierarchy/projection expand control — isolated from row open handlers.
 */
export function HubExpandChevron({
  expanded,
  onToggle,
  label,
  className,
}: HubExpandChevronProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-md",
        "text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      data-testid="pipeline-hub-expand-chevron"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <ChevronRight
        className={cn(
          "h-4 w-4 transition-transform duration-dlc-standard ease-dlc-standard motion-reduce:transition-none",
          expanded && "rotate-90",
        )}
        aria-hidden
      />
    </button>
  );
}
