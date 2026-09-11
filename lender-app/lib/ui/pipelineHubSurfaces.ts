/**
 * Pipeline hub visual surfaces — colors, radii, elevation, type weight only.
 * Do not put padding / margin / gap here (layout rhythm is locked).
 */

import { cn } from "@/lib/cn";

/** Shared motion for hover/focus chrome (respects reduced-motion via globals). */
export const hubSurfaceMotionClass =
  "transition-[box-shadow,border-color,background-color,color] duration-dlc-short2 ease-dlc-standard";

/** Page title — clearer hierarchy without size change on mobile. */
export const hubPageTitleClass =
  "text-xl font-semibold tracking-tight text-foreground md:text-2xl";

export const hubPageSubtitleClass =
  "hidden text-sm font-normal text-muted-foreground/90 md:block";

/** Primary filter / search island. */
export const hubFilterChromeClass = cn(
  "relative z-20 isolate min-w-0 max-w-full",
  "rounded-dlc-xl border border-border/55 bg-dlc-surface-high shadow-dlc-2",
);

export const hubFilterToolbarClass = cn(
  "relative shrink-0 border-b border-border/45",
  "bg-dlc-surface-high/95 backdrop-blur-md",
);

/** Recessed filters panel inside the chrome. */
export const hubFiltersPanelInnerClass = cn(
  "rounded-dlc-lg border border-border/50 bg-dlc-surface-low/55 shadow-dlc-1",
);

/** Sticky parent-stage band (list hub). */
export const hubStageHeaderClass = cn(
  "sticky top-0 z-[1]",
  "border-t border-border/50 bg-dlc-surface-highest/85 backdrop-blur-md",
  "dark:bg-dlc-surface-highest/70",
);

/** Nested stage chip inside entity cards. */
export const hubStageHeaderNestedClass = cn(
  "rounded-dlc-sm border border-border/45 bg-dlc-surface-low/70",
);

export const hubStageTitleClass =
  "min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export const hubStageCountClass =
  "font-medium normal-case tracking-normal text-muted-foreground/75";

/** Loan / file row card shell (keep border-2 width callers already use). */
export const hubLoanCardClass = cn(
  "rounded-dlc-md border-2 border-border/45 bg-dlc-surface-high shadow-dlc-1",
  hubSurfaceMotionClass,
  "hover:border-border/70 hover:shadow-dlc-2",
);

export const hubLoanCardFocusedClass =
  "ring-2 ring-primary/25 ring-offset-1 ring-offset-background";

/** Mobile density card. */
export const hubMobileFileCardClass = cn(
  "rounded-dlc-lg border border-border/55 bg-dlc-surface-high shadow-dlc-1",
  hubSurfaceMotionClass,
  "active:bg-dlc-surface-low/40",
);

/** Entity / projection focus section shell. */
export const hubEntitySectionClass = cn(
  "rounded-dlc-lg border-2 border-border/50 bg-dlc-surface-high shadow-dlc-1",
  hubSurfaceMotionClass,
);

/** Board column. */
export const hubBoardColumnClass = cn(
  "flex min-h-0 w-72 shrink-0 flex-col",
  "rounded-dlc-lg border-2 border-border/50 bg-dlc-surface-low/40",
  hubSurfaceMotionClass,
);

export const hubBoardColumnHeaderClass = cn(
  "flex items-center gap-2 border-b-2 border-border/45",
  "bg-dlc-surface-high/95 px-3 py-2 backdrop-blur-sm",
);

export const hubBoardCardClass = cn(
  "cursor-pointer rounded-dlc-md border border-border/55 bg-dlc-surface-high p-3 shadow-dlc-1",
  hubSurfaceMotionClass,
  "hover:border-primary/35 hover:shadow-dlc-2",
);

/** Compact pills / chips. */
export const hubQuietPillClass = cn(
  "inline-flex max-w-[10rem] items-center gap-1 truncate",
  "rounded-dlc-full border border-border/45 bg-dlc-surface-low/60",
  "px-2 py-0.5 text-[11px] text-muted-foreground",
);

export const hubNotesChipClass = cn(
  "relative z-[1] inline-flex shrink-0 items-center gap-0.5 rounded-dlc-full",
  "border border-border/50 bg-dlc-surface-low/70 px-1.5 py-0.5",
  "text-[10px] font-medium tabular-nums text-muted-foreground",
  hubSurfaceMotionClass,
  "hover:border-border/80 hover:bg-dlc-surface hover:text-foreground",
);

export const hubIconQuietClass = "text-muted-foreground/80";
export const hubIconAccentClass = "text-primary/75";

/** Header action buttons (Licenses / More) — visual only. */
export const hubHeaderGhostBtnClass = cn(
  "hidden h-9 items-center justify-center gap-2 rounded-dlc-md border border-border/60",
  "bg-dlc-surface-high px-4 text-sm font-medium shadow-dlc-1 md:inline-flex",
  hubSurfaceMotionClass,
  "hover:border-primary/40 hover:bg-dlc-surface-low/50 hover:shadow-dlc-2",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);

export const hubHeaderMoreBtnClass = cn(
  "flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-dlc-md",
  "border border-border/60 bg-dlc-surface-high px-3 text-sm font-medium shadow-dlc-1",
  "marker:content-none [&::-webkit-details-marker]:hidden",
);

export const hubHeaderNewBtnClass = cn(
  "flex h-9 cursor-pointer list-none items-center justify-center gap-1.5 rounded-dlc-md",
  "border border-primary/90 bg-primary px-4 text-sm font-medium text-primary-foreground shadow-dlc-2",
  "marker:content-none [&::-webkit-details-marker]:hidden",
  hubSurfaceMotionClass,
  "hover:brightness-[1.03]",
);
