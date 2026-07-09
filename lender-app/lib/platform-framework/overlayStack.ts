/**
 * Overlay governance — z-order tiers and optional stack discipline.
 *
 * **Policy:** New overlays (drawers, dialogs, inspect panels) SHOULD pick a tier from
 * `OVERLAY_Z_BASE` instead of ad-hoc `z-*`. Some legacy shells (e.g. `RecordInspectorShell`)
 * may still use fixed `z-30`; migrate when touching those files.
 *
 * @see `RecordInspectorShell` — canonical inspector; uses tier `inspector`.
 */

import { Z_LAYER } from "@/lib/ui/layering";

/** Aligned with `Z_LAYER` in `@/lib/ui/layering` (Phase 17.1). */
export const OVERLAY_Z_BASE = {
  popover: Z_LAYER.POPOVER,
  sheet: Z_LAYER.SHEET,
  inspector: Z_LAYER.INSPECTOR,
  help: Z_LAYER.HELP,
  modal: Z_LAYER.MODAL,
  commandPalette: Z_LAYER.COMMAND_PALETTE,
  toast: Z_LAYER.TOAST,
  productTour: Z_LAYER.PRODUCT_TOUR,
} as const;

export type OverlayTier = keyof typeof OVERLAY_Z_BASE;

let stackDepth = 0;

/** Call when opening a nested overlay; pair with `releaseOverlayZOffset`. */
export function acquireOverlayZOffset(): number {
  stackDepth += 1;
  return stackDepth;
}

export function releaseOverlayZOffset(): void {
  stackDepth = Math.max(0, stackDepth - 1);
}

export function peekNextOverlayZ(tier: OverlayTier): number {
  return OVERLAY_Z_BASE[tier] + stackDepth;
}

export function zIndexStyle(tier: OverlayTier): { zIndex: number } {
  return { zIndex: peekNextOverlayZ(tier) };
}
