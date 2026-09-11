/**

 * Phase 18.8B — Safe-area + PWA spacing helpers (UI only).

 *

 * Goals:

 * - Centralize safe-area env() usage.

 * - Aggressive flush bottom nav: paint to `bottom: 0`; icons sit into the

 *   home-indicator zone with only a *minimal* pad (≪ full ~34px inset).

 * - Content spacers clear the shorter visual dock (not the old full inset).

 *

 * Notes:

 * - These helpers return CSS strings to avoid fragile runtime parsing of `env(...)`.

 * - Do not introduce additional scroll owners; this is spacing-only.

 */

export type CssLength = string;



/**

 * Minimal bottom pad for `MobileBottomNav` — bank-grade flush into the home

 * indicator. On a ~34px iPhone inset this is ~6px (not the full band).

 * Never stack rem / `pb-6` / frozen 24px on top.

 *

 * Formula: `max(2px, inset − 28px)` → ~0–8px perceived empty under glyphs.

 */

export const NAV_HOME_INDICATOR_PAD_CSS =

  "max(2px, calc(env(safe-area-inset-bottom, 0px) - 28px))" as const;



/** @see NAV_HOME_INDICATOR_PAD_CSS — sole bottom padding on MobileBottomNav. */

export function safeAreaBottom(): CssLength {

  return NAV_HOME_INDICATOR_PAD_CSS;

}



/**

 * Full `env(safe-area-inset-bottom)` — sheets/modals that must clear the

 * gesture bar entirely. Not for the primary bottom nav chrome.

 */

export function safeAreaBottomFull(): CssLength {

  return "max(0px, env(safe-area-inset-bottom, 0px))";

}



/**

 * @deprecated Nav chrome must use live {@link safeAreaBottom}. Kept for any

 * legacy content clearance callers; prefer env()-based spacer classes.

 */

export function pipelineFrozenSafeAreaBottom(): CssLength {

  return safeAreaBottom();

}



/** Content pad above flush bottom nav (icon budget + minimal home pad). */

export function pipelineFrozenMainBottomPad(): CssLength {

  return `calc(3.25rem + ${NAV_HOME_INDICATOR_PAD_CSS})`;

}



/** Tailwind class: clearance above global SaaS `MobileBottomNav`. */

export const SAAS_BOTTOM_NAV_MAIN_PAD_CLASS =

  "pb-[max(5.5rem,calc(3.25rem+max(2px,calc(env(safe-area-inset-bottom,0px)-28px))))]";



/** Mobile main pad — same flush home pad as unlocked (no frozen 24px stack). */

export const SAAS_BOTTOM_NAV_MAIN_PAD_FROZEN_MOBILE_CLASS =

  "max-md:pb-[max(5.5rem,calc(3.25rem+max(2px,calc(env(safe-area-inset-bottom,0px)-28px))))]";



/** {@link pwaBottomPadding} — always uses flush nav home pad. */

export function pipelineFrozenPwaBottomPadding(opts?: {

  basePx?: number;

  gapPx?: number;

}): CssLength {

  return pwaBottomPadding(opts);

}



/** `env(safe-area-inset-top)` with non-negative guard. */

export function safeAreaTop(): CssLength {

  return "max(0px, env(safe-area-inset-top))";

}



/**

 * Master AppChrome header — clear iPhone status bar / notch under

 * `viewport-fit=cover`. Padding on the `<header>`; inner row heights stay fixed.

 * Use on `max-md` only (desktop has no inset conflict with OS chrome).

 */

export const MASTER_HEADER_SAFE_TOP_PAD_CLASS =

  "max-md:pt-[max(0px,env(safe-area-inset-top,0px))]";



/**

 * Mobile SaaS slide-out drawer brand header — clear Dynamic Island / status bar

 * while the green `aside` still paints edge-to-edge under the OS chrome.

 */

export const MOBILE_DRAWER_SAFE_TOP_PAD_CLASS =

  "max-md:pt-[max(0.5rem,env(safe-area-inset-top,0px))]";



/** Unlocked mobile master header max height = single row (3.5rem) + safe top. */

export const MASTER_HEADER_SAFE_TOP_MAX_H_UNLOCKED_CLASS =

  "max-md:max-h-[calc(3.5rem+env(safe-area-inset-top,0px))]";



/** Locked pipeline master header height = 4rem content + safe top. */

export const MASTER_HEADER_SAFE_TOP_H_LOCKED_CLASS =

  "max-md:h-[calc(4rem+env(safe-area-inset-top,0px))] max-md:min-h-[calc(4rem+env(safe-area-inset-top,0px))] max-md:max-h-[calc(4rem+env(safe-area-inset-top,0px))]";



/**

 * Pipeline file Vaul sheet (`max-md` only — matches when the snap sheet mounts).

 * Exactly one `env(safe-area-inset-top)` for Dynamic Island / status bar, plus a

 * small fixed breath so dense chrome (stage pill) stays tappable. Do not also pad

 * the snap header.

 */

export const WORKSPACE_SHEET_SAFE_TOP_PAD_CLASS =

  "max-md:pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]";



/**

 * Tail spacer inside `[data-pipeline-workspace-scroll]` so last blocks clear the

 * fixed file-route bottom nav. Icon dock ≈ pt-1 + min-h-10 (~2.75rem) + flush

 * home pad (~2–8px). Safe-area once (nav uses the same minimal pad).

 */

export const FILE_WORKSPACE_BOTTOM_NAV_SPACER_CLASS =

  "h-[calc(3.25rem+max(2px,calc(env(safe-area-inset-bottom,0px)-28px)))]";



/** Hub / AppChrome `<main>` spacer — taller list clearance + flush home pad. */

export const GLOBAL_BOTTOM_NAV_SPACER_CLASS =

  "h-[calc(6.25rem+max(2px,calc(env(safe-area-inset-bottom,0px)-28px)))]";



/**

 * Baseline mobile bottom dock height (content padding target).

 * This is a UI budgeting constant, not a measured DOM value.

 * Flush era: icon hit (~40) + top breath — home pad is separate via env().

 */

export function mobileBottomDockHeight(): number {

  return 52;

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

 * - gesture safe-area (flush / minimal — matches MobileBottomNav)

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

  // Content clearance: nav height + optional gap + flush home pad (not full inset).

  return `calc(${extra}px + ${base}px + ${NAV_HOME_INDICATOR_PAD_CSS})`;

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


