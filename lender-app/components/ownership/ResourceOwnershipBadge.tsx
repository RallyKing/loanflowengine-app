"use client";

import { cn } from "@/lib/cn";
import {
  RESOURCE_OWNERSHIP_BADGE_LABEL,
  resourceOwnershipBadgeClass,
  type ResourceOwnershipBadgeKind,
} from "@/lib/resourceOwnershipUi";

export function ResourceOwnershipBadge({
  badge,
  className,
}: {
  badge: ResourceOwnershipBadgeKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        resourceOwnershipBadgeClass(badge),
        className,
      )}
    >
      {RESOURCE_OWNERSHIP_BADGE_LABEL[badge]}
    </span>
  );
}
