/**
 * Phase 18.2 — hierarchy visual rhythm (presentation only).
 * Subtle rails and spacing — guided structure, not file-explorer chrome.
 * Spacing tokens here are historical; do not add new pad/gap for polish passes.
 */

import { cn } from "@/lib/cn";
import { opMotionStructuralTransition } from "@/lib/ui/operationalMotion";
import { hubSurfaceMotionClass } from "@/lib/ui/pipelineHubSurfaces";

/** Client tier — root cluster. */
export const HIERARCHY_CLIENT_CLUSTER_CLASS = cn(
  "rounded-dlc-lg border-2 border-border/50 bg-dlc-surface-high shadow-dlc-1",
  hubSurfaceMotionClass,
  "hover:border-border/70 hover:shadow-dlc-2",
);

/** Project tier — nested under client. */
export const HIERARCHY_PROJECT_RAIL_CLASS = cn(
  "ml-3 border-l-4 border-border/45 pl-2 group-hover/hub-client:border-primary/40",
  opMotionStructuralTransition,
);

/** Loan/file tier — nested under project. */
export const HIERARCHY_LOAN_RAIL_CLASS =
  "ml-3 border-l-2 border-primary/30 pl-2";

/** Expansion chevron — shared motion (18.3). */
export const HIERARCHY_CHEVRON_CLASS =
  "h-4 w-4 shrink-0 text-muted-foreground/85";

export function hierarchyChevronClass(expanded: boolean): string {
  return cn(
    HIERARCHY_CHEVRON_CLASS,
    opMotionStructuralTransition,
    expanded && "rotate-90",
  );
}
