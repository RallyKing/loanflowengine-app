/**
 * Phase 18.2 — hierarchy visual rhythm (presentation only).
 * Subtle rails and spacing — guided structure, not file-explorer chrome.
 */

import { cn } from "@/lib/cn";
import { opMotionStructuralTransition } from "@/lib/ui/operationalMotion";

/** Client tier — root cluster. */
export const HIERARCHY_CLIENT_CLUSTER_CLASS =
  "rounded-lg border-2 border-border/55 bg-dlc-surface/20 shadow-dlc-1";

/** Project tier — nested under client. */
export const HIERARCHY_PROJECT_RAIL_CLASS =
  cn(
    "ml-3 border-l-4 border-border/50 pl-2 group-hover/hub-client:border-primary/35",
    opMotionStructuralTransition,
  );

/** Loan/file tier — nested under project. */
export const HIERARCHY_LOAN_RAIL_CLASS =
  "ml-3 border-l-2 border-primary/25 pl-2";

/** Expansion chevron — shared motion (18.3). */
export const HIERARCHY_CHEVRON_CLASS =
  "h-4 w-4 shrink-0 text-muted-foreground";

export function hierarchyChevronClass(expanded: boolean): string {
  return cn(
    HIERARCHY_CHEVRON_CLASS,
    opMotionStructuralTransition,
    expanded && "rotate-90",
  );
}
