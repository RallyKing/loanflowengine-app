"use client";

import { cn } from "@/lib/cn";
import { ResourceOwnershipBadge } from "@/components/ownership/ResourceOwnershipBadge";
import type {
  PipelineHierarchyAccessLabel,
  ResourceOwnershipBadgeKind,
  ResourceOwnershipPresentationClient,
} from "@/lib/resourceOwnershipUi";
import { HierarchyAccessBadge } from "@/components/ownership/HierarchyAccessBadge";

export function ResourceOwnershipLine({
  ownershipLine,
  badge,
  hierarchyAccessLabel,
  presentation,
  className,
  compact,
}: {
  ownershipLine?: string;
  badge?: ResourceOwnershipBadgeKind | null;
  hierarchyAccessLabel?: PipelineHierarchyAccessLabel | null;
  presentation?: ResourceOwnershipPresentationClient | null;
  className?: string;
  compact?: boolean;
}) {
  const line = presentation?.ownershipLine ?? ownershipLine ?? "";
  const badgeKind = presentation?.badge ?? badge ?? null;
  const hierarchyLabel =
    presentation?.hierarchyAccessLabel ?? hierarchyAccessLabel ?? null;
  if (!line.trim()) return null;
  return (
    <p
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground",
        compact ? "text-[11px]" : "text-xs",
        className,
      )}
    >
      <span className="min-w-0 truncate font-medium text-foreground/90">
        {line}
      </span>
      {badgeKind ? <ResourceOwnershipBadge badge={badgeKind} /> : null}
      {hierarchyLabel ? (
        <HierarchyAccessBadge label={hierarchyLabel} />
      ) : null}
    </p>
  );
}
