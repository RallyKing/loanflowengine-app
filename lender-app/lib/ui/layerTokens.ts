/**
 * Z-order for application **chrome** and shell-adjacent overlays.
 * Canonical numeric tiers live in `@/lib/ui/layering` — this module maps shell names.
 */

import {
  OVERLAY_Z_BASE,
  zIndexStyle,
  type OverlayTier,
} from "@/lib/platform-framework";
import { Z_LAYER, layerZIndex, layerZIndexStyle } from "@/lib/ui/layering";

export { Z_LAYER, layerZIndex, layerZIndexStyle, layerZIndexClass } from "@/lib/ui/layering";
export {
  overlaySurfaceClass,
  overlayScrimClass,
  type ZLayer,
  type OverlaySurfaceVariant,
} from "@/lib/ui/layering";

/**
 * Canonical shell stack (single source — prefer `layerZIndexStyle` for new overlays).
 */
export const SHELL_Z = {
  header: Z_LAYER.HEADER,
  contextualTip: 26,
  stickyDock: 28,
  /**
   * Below mobile slideout / menu scrim (`sidebar` 45, drawer `modal` 50).
   * Must stay strictly below those tiers — equal z with menu scrim lets the
   * white dock paint over the dimmer (visible hamburger strip).
   */
  bottomNav: 40,
  tooltip: Z_LAYER.POPOVER,
  /** Dimmer behind mobile SaaS drawer — above bottom nav, below drawer panel. */
  overlay: Z_LAYER.SIDEBAR,
  sidebar: Z_LAYER.SIDEBAR,
  drawer: Z_LAYER.INSPECTOR,
  sheet: OVERLAY_Z_BASE.sheet,
  inspector: Z_LAYER.INSPECTOR,
  modal: Z_LAYER.MODAL,
  helpCenter: Z_LAYER.HELP,
  navAuxiliary: Z_LAYER.TOAST,
  productTourBackdrop: Z_LAYER.PRODUCT_TOUR,
  productTourHighlight: Z_LAYER.PRODUCT_TOUR + 1,
  productTourPopover: Z_LAYER.PRODUCT_TOUR + 2,
  /** @deprecated Use `helpCenter` — kept for call-site migration. */
  helpCenterBackdrop: Z_LAYER.HELP,
  /** @deprecated Panel stacks inside help shell; no separate tier. */
  helpCenterPanel: Z_LAYER.HELP,
} as const;

export type ShellLayer = keyof typeof SHELL_Z;

export function shellZIndexStyle(layer: ShellLayer): { zIndex: number } {
  return { zIndex: SHELL_Z[layer] };
}

export function shellPanelZIndex(
  layer: "sheet" | "modal",
): { zIndex: number } {
  return { zIndex: SHELL_Z[layer] + 1 };
}

export function productOverlayZStyle(tier: OverlayTier): { zIndex: number } {
  return zIndexStyle(tier);
}
