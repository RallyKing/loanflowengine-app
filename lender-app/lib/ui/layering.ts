/**
 * Phase 15 Step 15 — canonical overlay z-index tokens (single source).
 * Use `layerZIndexStyle` / `overlaySurfaceClass` instead of ad-hoc `z-50` or translucent panels.
 */

export const Z_LAYER = {
  HEADER: 20,
  POPOVER: 35,
  DROPDOWN: 38,
  /** Mobile bottom nav / sheet scrims sit below this (see `SHELL_Z.bottomNav`). */
  SHEET: 40,
  /** Record inspectors — above workspace chrome, below modals/command palette. */
  INSPECTOR: 45,
  /** Legacy alias: same tier as inspector (pipeline side surfaces). */
  SIDEBAR: 45,
  /** Help center — below command palette and toast. */
  HELP: 48,
  MODAL: 50,
  COMMAND_PALETTE: 52,
  /** Destructive delete/archive confirms — above batch bar + toasts. */
  DESTRUCTIVE_CONFIRM: 65,
  TOAST: 60,
  /** Product tour — above toast; below skip-link focus ring when enhanced. */
  PRODUCT_TOUR: 62,
} as const;

export type ZLayer = keyof typeof Z_LAYER;

/** CSS custom properties wired in `app/globals.css` for Tailwind arbitrary z. */
export const Z_LAYER_CSS_VAR: Record<ZLayer, string> = {
  HEADER: "--dlc-z-header",
  POPOVER: "--dlc-z-popover",
  DROPDOWN: "--dlc-z-dropdown",
  SHEET: "--dlc-z-sheet",
  INSPECTOR: "--dlc-z-inspector",
  SIDEBAR: "--dlc-z-sidebar",
  HELP: "--dlc-z-help",
  MODAL: "--dlc-z-modal",
  COMMAND_PALETTE: "--dlc-z-command-palette",
  DESTRUCTIVE_CONFIRM: "--dlc-z-destructive-confirm",
  TOAST: "--dlc-z-toast",
  PRODUCT_TOUR: "--dlc-z-product-tour",
};

export function layerZIndex(layer: ZLayer): number {
  return Z_LAYER[layer];
}

export function layerZIndexStyle(layer: ZLayer): { zIndex: number } {
  return { zIndex: Z_LAYER[layer] };
}

export function layerZIndexClass(layer: ZLayer): string {
  return `z-[var(${Z_LAYER_CSS_VAR[layer]},${Z_LAYER[layer]})]`;
}

export type OverlaySurfaceVariant =
  | "dropdown"
  | "popover"
  | "modal-panel"
  | "command-panel";

/**
 * Opaque overlay surfaces — no bleed-through. Backdrop blur only on scrims, not menus.
 */
export function overlaySurfaceClass(
  variant: OverlaySurfaceVariant = "dropdown",
): string {
  const base =
    "isolate overflow-hidden border border-border/50 bg-background text-foreground shadow-xl [background-color:rgb(var(--bg))]";
  switch (variant) {
    case "dropdown":
      return `${base} rounded-dlc-md`;
    case "popover":
      return `${base} rounded-dlc-lg`;
    case "modal-panel":
      return "dlc-surface-overlay isolate border border-border bg-background text-foreground [background-color:var(--dlc-surface-container-highest)]";
    case "command-panel":
      return `${base} rounded-dlc-md shadow-[var(--dlc-elevation-4)]`;
  }
}

/** Scrim behind modals / command palette — does not replace panel opacity. */
export function overlayScrimClass(): string {
  return "bg-[var(--dlc-scrim,oklch(0%_0_0_/0.45))]";
}
