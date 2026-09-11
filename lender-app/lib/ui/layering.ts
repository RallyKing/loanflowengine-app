/**
 * Phase 15 Step 15 — canonical overlay z-index tokens (single source).
 * Use `layerZIndexStyle` / `overlaySurfaceClass` instead of ad-hoc `z-50` or translucent panels.
 */

export const Z_LAYER = {
  HEADER: 20,
  POPOVER: 35,
  DROPDOWN: 38,
  /** Sheet / bottom-sheet panels. Menu dimmers use `SHELL_Z.overlay` (above bottomNav). */
  SHEET: 40,
  /** Record inspectors — above workspace chrome, below modals/command palette. */
  INSPECTOR: 45,
  /** Legacy alias: same tier as inspector (pipeline side surfaces). */
  SIDEBAR: 45,
  /**
   * Detached block “window-in-window” panels — above workspace/inspectors,
   * below blocking modals / command palette. No scrim; background stays interactive.
   */
  FLOATING_WINDOW: 46,
  /** Help center — below command palette and toast. */
  HELP: 48,
  MODAL: 50,
  COMMAND_PALETTE: 52,
  /**
   * Masterpage chrome menus (Updates, Alerts) — must sit above sticky list
   * toolbars that still use ad-hoc Tailwind `z-40` / `z-50`.
   */
  CHROME_MENU: 53,
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
  FLOATING_WINDOW: "--dlc-z-floating-window",
  HELP: "--dlc-z-help",
  MODAL: "--dlc-z-modal",
  COMMAND_PALETTE: "--dlc-z-command-palette",
  CHROME_MENU: "--dlc-z-chrome-menu",
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
 * Opaque overlay surfaces — no bleed-through. Scrims are light dim only (no blur).
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

/**
 * Light dim behind blocking modals / command palette — no blur.
 * Prefer readability of background content over heavy obscuring.
 */
export function overlayScrimClass(): string {
  return "bg-[var(--dlc-scrim,rgb(15_23_42_/0.18))]";
}
