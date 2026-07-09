/**
 * Phase 18.4 — operational elegance tokens (emphasis, scan rhythm, calm color).
 * Presentation only — pairs with operationalTokens + operationalMotion.
 */

import { cn } from "@/lib/cn";
import { opMotionFastTransition } from "@/lib/ui/operationalMotion";

/** Primary entity identity — one dominant title per region. */
export const OP_ENTITY_TITLE =
  "text-sm font-semibold leading-snug tracking-tight text-foreground";

/** Operational status / stage — scannable in <1s. */
export const OP_STATUS_EMPHASIS =
  "text-xs font-medium tabular-nums text-foreground/90";

/** Secondary context — ownership, relationships, time. */
export const OP_SCAN_SECONDARY =
  "text-xs text-muted-foreground/85";

/** Tertiary — IDs, technical labels; never compete with intent. */
export const OP_SCAN_TERTIARY =
  "text-[11px] leading-tight text-muted-foreground/60";

/** Subordinate chips (relationships, tags). */
export const OP_CHIP_SUBORDINATE = cn(
  "inline-flex max-w-full items-center truncate rounded-md border border-border/30",
  "bg-muted/15 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground/80",
  opMotionFastTransition,
);

/** Active filter chip — muted, not saturated primary. */
export const OP_CHIP_FILTER = cn(
  "inline-flex max-w-full items-center gap-1 rounded-full border border-border/35",
  "bg-muted/15 px-2 py-0.5 text-[11px] text-muted-foreground",
  opMotionFastTransition,
);

/** Toolbar segment separator — grouping without heavy borders. */
export const OP_TOOLBAR_DIVIDER = "hidden h-6 w-px shrink-0 bg-border/30 sm:block";

/** Calm empty / zero-data band. */
export const OP_EMPTY_SURFACE = cn(
  "rounded-xl border border-dashed border-border/30 bg-muted/10",
  "px-4 py-10 sm:py-12",
);

/** Destructive isolation — clear but not loud. */
export const OP_DESTRUCTIVE_TEXT =
  "text-destructive/90 hover:text-destructive";

/** Warning — calmer amber. */
export const OP_WARNING_TEXT =
  "text-amber-900/80 dark:text-amber-100/80";

/** Active region focus — where attention should land next. */
export const OP_ACTIVE_REGION_RING =
  "ring-1 ring-primary/15 ring-offset-0";

/** Row nesting rail — flowing hierarchy. */
export function opRowNestRailClass(level: number): string {
  if (level <= 0) return "";
  return cn(
    "border-l border-border/25",
    level === 1 && "ml-2.5 pl-2.5",
    level === 2 && "ml-5 pl-2.5",
    level >= 3 && "ml-7 pl-2.5",
  );
}

/** Softer row stack — grouped flow between siblings. */
export const OP_ROW_GROUP_FLOW = "space-y-0.5";

/** Workspace section breathing — block interiors. */
export const OP_WORKSPACE_SECTION = "space-y-4 sm:space-y-5";

export const OP_WORKSPACE_BLOCK = cn(
  "rounded-xl bg-dlc-surface-low/30 border-0 shadow-none",
  "p-3.5 sm:p-4",
);

/** Overlay / card cohesion — crafted radius + shadow. */
export const OP_SURFACE_COHESION = cn(
  "rounded-dlc-md shadow-sm",
  "border border-border/35",
);

/** Mobile thumb-friendly vertical rhythm. */
export const OP_MOBILE_STACK = "flex flex-col gap-3 max-md:gap-4";

/** Dropdown / menu panel polish. */
export const OP_MENU_PANEL = cn(
  "rounded-dlc-md border border-border/40 bg-background py-1 shadow-md",
  opMotionFastTransition,
);
