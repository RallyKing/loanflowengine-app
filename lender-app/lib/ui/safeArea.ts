/**
 * Phase 18.8B — Safe-area + PWA spacing helpers (UI only).
 *
 * Goals:
 * - Centralize safe-area env() usage.
 * - Provide a consistent “floating dock” offset for bottom navigation.
 * - Add PWA-aware extra padding where installed/standalone contexts need it.
 *
 * Notes:
 * - These helpers return CSS strings to avoid fragile runtime parsing of `env(...)`.
 * - Do not introduce additional scroll owners; this is spacing-only.
 */
export type CssLength = string;

/** `env(safe-area-inset-bottom)` with non-negative guard. */
export function safeAreaBottom(): CssLength {
  return "max(0px, env(safe-area-inset-bottom))";
}

/** Phase 24.4P — static bottom inset for pipeline (no dynamic `env()`). */
export function pipelineFrozenSafeAreaBottom(): CssLength {
  return "24px";
}

/** Content pad above bottom nav on pipeline hub when safe-area is frozen. */
export function pipelineFrozenMainBottomPad(): CssLength {
  return "calc(4.25rem + 24px)";
}

/** Tailwind class: ~6rem clearance above global SaaS `MobileBottomNav`. */
export const SAAS_BOTTOM_NAV_MAIN_PAD_CLASS =
  "pb-[max(6rem,calc(4.25rem+env(safe-area-inset-bottom)))]";

/** Frozen pipeline safe-area stand-in (24px bottom). */
export const SAAS_BOTTOM_NAV_MAIN_PAD_FROZEN_MOBILE_CLASS =
  "max-md:pb-[calc(6rem+24px)]";

/** {@link pwaBottomPadding} equivalent with frozen bottom inset. */
export function pipelineFrozenPwaBottomPadding(opts?: {
  basePx?: number;
  gapPx?: number;
}): CssLength {
  const base = Math.max(0, opts?.basePx ?? mobileBottomDockHeight());
  const gap = Math.max(0, opts?.gapPx ?? 8);
  return `calc(${gap}px + ${base}px + 24px)`;
}

/** `env(safe-area-inset-top)` with non-negative guard. */
export function safeAreaTop(): CssLength {
  return "max(0px, env(safe-area-inset-top))";
}

/**
 * Baseline mobile bottom dock height (content padding target).
 * This is a UI budgeting constant, not a measured DOM value.
 */
export function mobileBottomDockHeight(): number {
  return 68;
}

export type StandalonePwaSignals = {
  /** `display-mode: standalone` (Chromium/Android + modern Safari). */
  displayModeStandalone: boolean;
  /** iOS Safari “Add to Home Screen” standalone. */
  iosStandalone: boolean;
};

export function readStandalonePwaSignals(): StandalonePwaSignals {
  if (typeof window === "undefined") {
    return { displayModeStandalone: false, iosStandalone: false };
  }

  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );

  return { displayModeStandalone, iosStandalone };
}

export function isStandalonePwa(): boolean {
  const s = readStandalonePwaSignals();
  return s.displayModeStandalone || s.iosStandalone;
}

/**
 * Bottom padding for surfaces that need to stay clear of:
 * - bottom navigation dock (when present)
 * - gesture safe-area
 * - installed PWA system UI bars
 */
export function pwaBottomPadding(opts?: {
  /** Base padding budget in px (nav height / footer chrome). */
  basePx?: number;
  /** Extra breathing room above the viewport edge in px. */
  gapPx?: number;
  /** Extra padding in standalone PWA contexts. */
  pwaExtraPx?: number;
}): CssLength {
  const base = Math.max(0, opts?.basePx ?? mobileBottomDockHeight());
  const gap = Math.max(0, opts?.gapPx ?? 8);
  const pwaExtra = Math.max(0, opts?.pwaExtraPx ?? 8);

  const extra = isStandalonePwa() ? gap + pwaExtra : gap;
  // Content clearance: nav height + optional gap + safe-area (nav also pads safe-area internally).
  return `calc(${extra}px + ${base}px + env(safe-area-inset-bottom))`;
}

/**
 * CSS `bottom` for fixed bottom navigation.
 * Phase 24.3A: flush to viewport (`0`); safe-area lives inside the nav shell.
 * Optional keyboard lift only — no float gap below the bar.
 */
export function bottomNavFixedBottom(opts?: {
  keyboardInsetBottomPx?: number;
}): CssLength {
  const keyboard = Math.max(0, opts?.keyboardInsetBottomPx ?? 0);
  return keyboard > 0 ? `${keyboard}px` : "0px";
}

/** @deprecated Prefer `bottomNavFixedBottom` for MobileBottomNav. */
export function bottomDockOffset(opts?: {
  gapPx?: number;
  pwaExtraPx?: number;
  keyboardInsetBottomPx?: number;
}): CssLength {
  return bottomNavFixedBottom({
    keyboardInsetBottomPx: opts?.keyboardInsetBottomPx,
  });
}

