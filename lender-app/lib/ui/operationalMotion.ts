/**
 * Phase 18.3 — unified operational motion language (presentation only).
 * Calm, ease-out dominant; no spring-heavy behavior.
 */

import { cn } from "@/lib/cn";

/** Target bands from phase charter (ms). */
export const OP_MOTION_MS = {
  /** Fast interactions: hover, opacity, chevrons — 120–160ms */
  fast: 140,
  /** Structural: expand/collapse, row emphasis — 180–240ms */
  structural: 200,
  /** Drawers / sheets — 240–320ms */
  drawer: 280,
} as const;

export const OP_MOTION_EASE_OUT = "ease-out";
export const OP_MOTION_EASE_DECEL = "ease-dlc-standard-decelerate";

const reduceMotion = "motion-reduce:transition-none motion-reduce:transform-none";

/** Hover, focus ring, micro color shifts. */
export const opMotionFastTransition = cn(
  "transition-[color,background-color,opacity,box-shadow,border-color]",
  `duration-[${OP_MOTION_MS.fast}ms]`,
  OP_MOTION_EASE_OUT,
  reduceMotion,
);

/** Disclosure panels, chevrons, row metadata. */
export const opMotionStructuralTransition = cn(
  "transition-[grid-template-rows,opacity,max-height,transform]",
  `duration-[${OP_MOTION_MS.structural}ms]`,
  OP_MOTION_EASE_OUT,
  reduceMotion,
);

/** Sheets, filter drawer, overlay panels. */
export const opMotionDrawerTransition = cn(
  "transition-[transform,opacity]",
  `duration-[${OP_MOTION_MS.drawer}ms]`,
  OP_MOTION_EASE_OUT,
  reduceMotion,
);

/** Chevron rotation — down-axis (header disclosures). */
export function opMotionChevronDownClass(expanded: boolean): string {
  return cn(
    "h-4 w-4 shrink-0 origin-center",
    opMotionStructuralTransition,
    expanded && "rotate-180",
  );
}

/** Chevron rotation — right-axis (hierarchy rows). */
export function opMotionChevronRightClass(expanded: boolean): string {
  return cn(
    "h-4 w-4 shrink-0 origin-center",
    opMotionStructuralTransition,
    expanded && "rotate-90",
  );
}

/** Grid-based collapse panel (scroll-safe; no animated grid-template-rows). */
export const opMotionCollapseGrid = cn("grid", opMotionStructuralTransition);

export const opMotionCollapseOpen = "grid-rows-[1fr]";
export const opMotionCollapseClosed = "grid-rows-[0fr]";

export const opMotionCollapseInner =
  "min-h-0 overflow-hidden [overflow-anchor:none]";

/** Disclosure body fade — pairs with grid collapse. */
export const opMotionDisclosureBodyClass = cn(
  "min-w-0 space-y-2 border-t border-border/40 pt-2",
  opMotionFastTransition,
);

/** Progressive content appearance (masks layout settle). */
export const opMotionContentAppearClass = cn(
  "opacity-0",
  opMotionStructuralTransition,
  "[animation:op-content-appear_200ms_ease-out_forwards]",
  "motion-reduce:opacity-100 motion-reduce:[animation:none]",
);

/** Optimistic / loading band — matches globals skeleton breathe. */
export const opMotionSkeletonClass =
  "animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none";

/** Bottom sheet enter (mobile filters, etc.). */
export const opMotionSheetPanelClass = cn(
  "relative flex flex-col overflow-hidden rounded-t-dlc-lg border-x border-t bg-background shadow-lg",
  opMotionDrawerTransition,
  "translate-y-0",
);

export const opMotionSheetScrimClass = cn(
  "absolute inset-0 opacity-100",
  opMotionFastTransition,
);
