/**
 * Phase 18.3 — tiered hover intelligence (desktop); touch-safe fallbacks.
 * Never shifts layout — opacity/transform only on tertiary slots.
 */

import { cn } from "@/lib/cn";
import { opMotionFastTransition } from "@/lib/ui/operationalMotion";

/** Primary row / control hover — background tint only. */
export const opHoverPrimaryClass = cn(
  opMotionFastTransition,
  "hover:bg-dlc-surface-low/45",
  "focus-within:bg-dlc-surface-low/35",
);

/** Action cluster reveal on row hover (no layout shift). */
export function opHoverActionRevealClass(className?: string): string {
  return cn(
    "opacity-100 max-md:opacity-100",
    "md:opacity-0 md:translate-y-px",
    "md:transition-[opacity,transform]",
    "md:duration-[140ms] md:ease-out",
    "md:group-hover/row-shell:opacity-100 md:group-hover/row-shell:translate-y-0",
    "md:group-focus-within/row-shell:opacity-100 md:group-focus-within/row-shell:translate-y-0",
    "motion-reduce:translate-y-0 motion-reduce:transition-none",
    className,
  );
}

/** Secondary metadata — slightly delayed feel via same timing, lower emphasis. */
export function opHoverMetadataRevealClass(className?: string): string {
  return cn(
    opHoverActionRevealClass(),
    "md:text-muted-foreground/90",
    className,
  );
}

/** Tertiary chips / ownership — lowest contrast until hover. */
export function opHoverTertiaryRevealClass(className?: string): string {
  return cn(
    opHoverMetadataRevealClass(),
    "md:opacity-0 md:group-hover/row-shell:opacity-80",
    className,
  );
}
