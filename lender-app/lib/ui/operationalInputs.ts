/**
 * Phase 18.5 — tactile data entry + micro-control tokens (presentation only).
 */

import { cn } from "@/lib/cn";
import { MOBILE_SAFE_FORM_FONT_CLASS } from "@/lib/ui/mobileInputZoom";
import { OP_SCAN_TERTIARY } from "@/lib/ui/operationalElegance";
import { OP_MOTION_MS } from "@/lib/ui/operationalMotion";
import { opMotionFastTransition } from "@/lib/ui/operationalMotion";

const motion = `duration-[${OP_MOTION_MS.fast}ms] ease-out motion-reduce:transition-none`;

/** Locked control height — read and edit modes align. */
export const OP_CONTROL_HEIGHT_CLASS = "min-h-10 h-10 sm:min-h-10 sm:h-10";

/** Calm focus — low-opacity primary, no harsh offset ring stack. */
export const OP_INPUT_FOCUS_CLASS = cn(
  "focus-visible:border-primary/45 focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0",
);

export const OP_INPUT_HOVER_CLASS =
  "hover:border-border/50 hover:bg-dlc-surface-low/30";

/** High-contrast list / toolbar search fields (Phase 35.2). */
export function opSearchFieldClass(options?: {
  compact?: boolean;
  className?: string;
}): string {
  return cn(
    options?.compact
      ? "min-h-8 h-8 sm:min-h-8 sm:h-8"
      : OP_CONTROL_HEIGHT_CLASS,
    "w-full rounded-dlc-sm border border-border/60",
    "bg-dlc-surface-low font-bold text-foreground",
    "dark:bg-dlc-surface-low/80",
    MOBILE_SAFE_FORM_FONT_CLASS,
    "leading-normal shadow-none",
    opMotionFastTransition,
    "hover:border-border/55 hover:bg-dlc-surface-low",
    "placeholder:font-bold placeholder:text-foreground/70",
    "dark:placeholder:text-foreground/60",
    OP_INPUT_FOCUS_CLASS,
    "disabled:cursor-not-allowed disabled:opacity-[0.48]",
    options?.className,
  );
}

/** Inner input for bordered search rows (⌘K palette, help panel). */
export function opSearchOverlayInputClass(options?: {
  className?: string;
}): string {
  return cn(
    "min-w-0 flex-1 bg-transparent py-2 font-bold text-foreground outline-none",
    MOBILE_SAFE_FORM_FONT_CLASS,
    "placeholder:font-bold placeholder:text-foreground/70",
    "dark:placeholder:text-foreground/60",
    options?.className,
  );
}

/** Wrapper row behind overlay search inputs. */
export const OP_SEARCH_OVERLAY_ROW_CLASS = cn(
  "flex items-center gap-2 rounded-dlc-sm border border-border/60",
  "bg-dlc-surface-low px-2.5 dark:bg-dlc-surface-low/80",
);

/** Standard text/select/textarea field. */
export function opInputFieldClass(options?: {
  error?: boolean;
  className?: string;
}): string {
  return cn(
    OP_CONTROL_HEIGHT_CLASS,
    "w-full rounded-dlc-sm border border-border/40 bg-background px-3 py-0",
    MOBILE_SAFE_FORM_FONT_CLASS,
    "leading-normal shadow-none",
    opMotionFastTransition,
    OP_INPUT_HOVER_CLASS,
    "placeholder:text-muted-foreground/60",
    OP_INPUT_FOCUS_CLASS,
    "disabled:cursor-not-allowed disabled:opacity-[0.48]",
    options?.error &&
      "border-destructive/35 focus-visible:border-destructive/50 focus-visible:ring-destructive/15",
    options?.className,
  );
}

/** Sitewide checkbox/radio — pair with `.op-micro-control-wrap` for touch target. */
export const OP_MICRO_CONTROL_CLASS = "op-micro-control";

export const OP_MICRO_CONTROL_WRAP_CLASS = "op-micro-control-wrap";

/** Inline read mode — same box metrics as edit input. */
export const OP_INLINE_DISPLAY_CLASS = cn(
  OP_CONTROL_HEIGHT_CLASS,
  "flex w-full min-w-0 items-center rounded-dlc-sm border border-transparent px-3 py-0",
  "text-left text-sm leading-normal text-foreground",
  opMotionFastTransition,
  "hover:border-border/35 hover:bg-dlc-surface-low/25",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15",
);

export const OP_INLINE_DISPLAY_EMPTY_CLASS =
  "italic text-muted-foreground/55";

/**
 * Inline textarea read mode — grows with wrapped/pre-wrapped content.
 * Do not reuse {@link OP_INLINE_DISPLAY_CLASS} (`h-10`) or multi-line values
 * overflow and stack on siblings inside grid layouts.
 */
export const OP_INLINE_TEXTAREA_DISPLAY_CLASS = cn(
  "flex w-full min-w-0 items-start rounded-dlc-sm border border-transparent px-3 py-2",
  "min-h-[5rem] h-auto text-left text-sm leading-relaxed text-foreground",
  opMotionFastTransition,
  "hover:border-border/35 hover:bg-dlc-surface-low/25",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15",
);

/** Inline edit mode — matches Input height exactly. */
export const OP_INLINE_EDIT_CLASS = cn(
  opInputFieldClass(),
  "shadow-none",
);

export const OP_INLINE_TEXTAREA_CLASS = cn(
  "min-h-[5rem] w-full rounded-dlc-sm border border-border/40 bg-background px-3 py-2",
  MOBILE_SAFE_FORM_FONT_CLASS,
  opMotionFastTransition,
  OP_INPUT_HOVER_CLASS,
  "placeholder:text-muted-foreground/60",
  OP_INPUT_FOCUS_CLASS,
);

export const OP_INLINE_SAVED_CLASS =
  "ring-1 ring-emerald-500/35 transition-shadow duration-[140ms] ease-out";

export const OP_INLINE_ERROR_RING_CLASS =
  "border-destructive/40 ring-1 ring-destructive/15";

export const OP_INLINE_ERROR_TEXT_CLASS =
  "mt-1 text-xs text-destructive/85";

/** Fade-in for inline save affordances (no layout pop). */
export const OP_INLINE_ACTIONS_CLASS = cn(
  "flex items-center gap-1 opacity-0 transition-opacity duration-[140ms] ease-out",
  "group-focus-within/inline-edit:opacity-100 group-hover/inline-edit:opacity-100",
  "motion-reduce:opacity-100",
);

/** Workspace interior island — open regions without heavy boxing. */
export const OP_WORKSPACE_ISLAND = cn(
  "rounded-xl bg-dlc-surface-low/30",
  "px-4 py-4 sm:px-5 sm:py-5",
  "border-0 shadow-none",
);

/** Section title inside workspaces. */
export const OP_WORKSPACE_SECTION_TITLE = cn(
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground/75",
);

export const OP_WORKSPACE_SECTION_SUBTITLE = OP_SCAN_TERTIARY;

export const OP_WORKSPACE_DIVIDER = "border-t border-border/25";
