/**
 * Phase 18.1–18.3 — operational shell design tokens (presentation only).
 * Motion timing: `operationalMotion.ts`. Hover tiers: `operationalHover.ts`.
 */

import { cn } from "@/lib/cn";
import {
  opMotionDisclosureBodyClass,
  opMotionStructuralTransition,
} from "@/lib/ui/operationalMotion";
import {
  opHoverPrimaryClass,
  opHoverTertiaryRevealClass,
} from "@/lib/ui/operationalHover";
import {
  layerZIndexClass,
  overlayScrimClass,
  type ZLayer,
} from "@/lib/ui/layering";

export {
  Z_LAYER,
  layerZIndexClass,
  layerZIndexStyle,
  overlayScrimClass,
  type ZLayer,
  type OverlaySurfaceVariant,
} from "@/lib/ui/layering";

/** Spacing rhythm for operational lists and toolbars (18.3 cadence). */
export const OP_SPACING = {
  rowGap: "gap-2",
  rowPaddingX: "px-2.5",
  rowMinH: "min-h-10",
  rowPy: "py-1.5",
  toolbarGap: "gap-2",
  toolbarPadding: "p-3",
  sectionGap: "gap-4",
  disclosurePad: "pt-2",
  chipGap: "gap-1",
  iconGap: "gap-1.5",
} as const;

/** Standard sticky / chrome header height (matches compressed file chrome). */
export const OP_HEADER_HEIGHT_CLASS = "h-9 min-h-9";

/** Compact toolbar control height. */
export const OP_TOOLBAR_CONTROL_CLASS = cn(
  OP_HEADER_HEIGHT_CLASS,
  "shrink-0 rounded-md border border-border/50 bg-background text-sm shadow-sm",
);

/** Soft borders — menus, cards, toolbars (calm 18.3). */
export const OP_BORDER_SOFT = "border-border/40";

/** Row hover — tiered primary (no layout shift). */
export const OP_ROW_HOVER_CLASS = opHoverPrimaryClass;

/** Disclosure expand/collapse timing. */
export const OP_DISCLOSURE_TRANSITION = opMotionStructuralTransition;

/** Disclosure panel inner band. */
export const OP_DISCLOSURE_BODY = opMotionDisclosureBodyClass;

/** Low-contrast divider — section breaks without aggression. */
export const OP_DIVIDER_CALM = "border-border/35";

/** Muted text tiers. */
export const OP_TEXT_PRIMARY = "text-sm font-semibold text-foreground";
export const OP_TEXT_SECONDARY = "text-xs text-muted-foreground";
export const OP_TEXT_TERTIARY =
  "text-[11px] leading-tight text-muted-foreground/70";

/** Icon action sizing — desktop compact, mobile touch-safe via globals. */
export const OP_ACTION_ICON_CLASS = cn(
  "h-8 w-8 shrink-0 p-0 text-muted-foreground",
  "hover:bg-muted/80 hover:text-foreground",
  "max-md:min-h-[var(--dlc-touch-target-min)] max-md:min-w-[var(--dlc-touch-target-min)]",
  "max-md:h-11 max-md:w-11 max-md:touch-manipulation",
);

/** Opaque anchored overlay panel (dropdowns, popovers, inbox). */
export function operationalOverlayPanelClass(className?: string): string {
  return cn(
    "isolate overflow-hidden border bg-background text-foreground shadow-xl",
    OP_BORDER_SOFT,
    "[background-color:rgb(var(--bg))]",
    className,
  );
}

export function operationalOverlayDropdownClass(className?: string): string {
  return cn(
    operationalOverlayPanelClass(),
    "rounded-dlc-md py-1",
    className,
  );
}

export function operationalZIndexClass(layer: ZLayer): string {
  return layerZIndexClass(layer);
}

/** Tertiary row metadata — hidden on desktop until row hover/focus. */
export function operationalTertiaryRevealClass(className?: string): string {
  return opHoverTertiaryRevealClass(className);
}
