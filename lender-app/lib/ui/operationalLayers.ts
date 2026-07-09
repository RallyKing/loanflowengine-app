/**
 * Phase 18.8C — operational overlay layer map (UI only).
 *
 * This intentionally *does not* replace the canonical numeric tiers in
 * `lib/ui/layering.ts` / `lib/ui/layerTokens.ts`. It provides a single import
 * for stabilization work so call-sites stop inventing ad-hoc z-index values.
 */

import { Z_LAYER, layerZIndexStyle, type ZLayer } from "@/lib/ui/layering";
import { SHELL_Z, shellZIndexStyle, type ShellLayer } from "@/lib/ui/layerTokens";

export const OP_LAYERS = {
  /** App chrome */
  header: "HEADER" as const satisfies ZLayer,
  /** Popovers/tooltips */
  popover: "POPOVER" as const satisfies ZLayer,
  /** Dropdown menus */
  dropdown: "DROPDOWN" as const satisfies ZLayer,
  /** Sheets (filter drawers, mobile sheets) */
  sheet: "SHEET" as const satisfies ZLayer,
  /** Record inspectors (task/lender) */
  inspector: "INSPECTOR" as const satisfies ZLayer,
  /** Modal dialogs (confirm, command palette) */
  modal: "MODAL" as const satisfies ZLayer,
  /** Destructive delete/archive confirms (global overlay root) */
  destructiveConfirm: "DESTRUCTIVE_CONFIRM" as const satisfies ZLayer,
  /** Toast */
  toast: "TOAST" as const satisfies ZLayer,
} as const;

export type OperationalLayerKey = keyof typeof OP_LAYERS;

export function operationalLayerStyle(key: OperationalLayerKey) {
  return layerZIndexStyle(OP_LAYERS[key]);
}

export { Z_LAYER, layerZIndexStyle, type ZLayer };

/**
 * Shell-adjacent tiers (header/bottom nav/etc). Prefer these for fixed chrome.
 * Kept separate from `Z_LAYER` to avoid conflating “overlay panel tiers” with “shell chrome tiers”.
 */
export const OP_SHELL_LAYERS: Record<ShellLayer, number> = SHELL_Z;
export { shellZIndexStyle, type ShellLayer };

