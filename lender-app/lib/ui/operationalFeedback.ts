/**
 * Phase 18.6 — contextual feedback tokens (toasts, batch bar, loading masks).
 * Presentation only — does not alter mutations or data flow.
 */

import { cn } from "@/lib/cn";
import { OP_MOTION_MS } from "@/lib/ui/operationalMotion";
import { operationalOverlayPanelClass } from "@/lib/ui/operationalTokens";

/** Floating batch bar slide-up (~200ms ease-out). */
export const OP_BATCH_BAR_MOTION = cn(
  "transition-[transform,opacity]",
  `duration-[${OP_MOTION_MS.structural}ms] ease-out`,
  "motion-reduce:transition-none",
);

export const OP_BATCH_BAR_SURFACE = cn(
  operationalOverlayPanelClass("rounded-dlc-lg shadow-lg"),
  "border-border/40 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/90",
);

/** Mobile: clear shorter flush bottom nav + minimal home pad. Desktop: standard inset. */
export const OP_BATCH_BAR_POSITION = cn(
  "fixed left-1/2 z-[var(--dlc-z-sheet,40)] w-[min(100%,42rem)] -translate-x-1/2 px-3",
  "bottom-[max(4.75rem,calc(3.25rem+max(2px,calc(env(safe-area-inset-bottom,0px)-28px))))]",
  "md:bottom-6",
);

export const OP_BATCH_BAR_ENTERED = "translate-y-0 opacity-100";
export const OP_BATCH_BAR_EXITED = "translate-y-full opacity-0 pointer-events-none";

/** Toast stack — neutral calm surfaces. */
export const OP_TOAST_SURFACE = cn(
  operationalOverlayPanelClass("rounded-dlc-md shadow-md"),
  "border-border/40 bg-background/95 backdrop-blur-md",
);

export const OP_TOAST_TITLE = "text-sm font-semibold leading-snug text-foreground";
export const OP_TOAST_DESCRIPTION = "text-xs leading-snug text-muted-foreground/85";

export const OP_TOAST_DESTRUCTIVE = cn(
  "border-destructive/25 bg-destructive/[0.06]",
  "[&_[data-toast-title]]:text-destructive/90",
);

export const OP_TOAST_SUCCESS = cn(
  "border-emerald-500/20 bg-emerald-500/[0.05]",
  "[&_[data-toast-title]]:text-foreground",
);

/** Inline field mask during mutation (non-blocking). */
export const OP_FIELD_MUTATING_CLASS = cn(
  "relative opacity-60 transition-opacity duration-[140ms] ease-out",
  "motion-reduce:opacity-80",
);

export const OP_INLINE_SYNC_TEXT =
  "text-[11px] font-medium text-muted-foreground/60";

export const OP_INLINE_SYNC_SPINNER = cn(
  "h-3 w-3 shrink-0 animate-spin text-muted-foreground/50 motion-reduce:animate-none",
);

/** Skeleton geometry — low contrast, no layout flash. */
export const OP_SKELETON_ROW_CLASS = cn(
  "dlc-surface-skeleton h-10 w-full rounded-dlc-sm",
);

export const OP_SKELETON_BLOCK_CLASS = cn(
  "dlc-surface-skeleton rounded-dlc-md",
);

export const OP_SKELETON_TEXT_CLASS = cn(
  "dlc-surface-skeleton h-3 rounded",
);
