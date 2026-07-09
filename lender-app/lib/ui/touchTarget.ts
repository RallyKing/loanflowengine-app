import { cn } from "@/lib/cn";

/**
 * Mobile touch targets — Apple HIG 44×44px minimum hit area.
 * Uses CSS var `--dlc-touch-target-min` from `globals.css` (media-query only).
 */
export const touchTargetMinClass =
  "max-md:min-h-[var(--dlc-touch-target-min)] max-md:min-w-[var(--dlc-touch-target-min)] max-md:touch-manipulation";

/** Icon-only controls: enforce 44px box on mobile without growing desktop chrome. */
export const touchTargetIconClass = cn(
  touchTargetMinClass,
  "max-md:h-11 max-md:w-11 max-md:shrink-0",
);
