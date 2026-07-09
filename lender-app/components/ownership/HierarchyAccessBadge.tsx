"use client";

import type { PipelineHierarchyAccessLabel } from "@/lib/resourceOwnershipUi";
import { cn } from "@/lib/cn";

export function HierarchyAccessBadge({
  label,
  className,
}: {
  label: PipelineHierarchyAccessLabel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border/60 bg-muted/25 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
