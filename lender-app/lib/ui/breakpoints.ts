/**
 * Single source of truth for responsive shell breakpoints.
 * Aligns with Tailwind defaults (see `tailwind.config.ts` — we do not redefine
 * `theme.screens` here to avoid dual config drift; keep these values in sync).
 */

/** Matches Tailwind `md` — primary mobile/desktop boundary for shell chrome. */
export const SCREEN_MD_MIN = 768;
/** Matches Tailwind `lg`. */
export const SCREEN_LG_MIN = 1024;
/** Matches Tailwind `xl` — nav “desktop shell” (sidebar + main). */
export const SCREEN_XL_MIN = 1280;
/** Matches Tailwind `2xl` — ultrawide / extra canvas. */
export const SCREEN_2XL_MIN = 1536;

export type ShellBreakpointBand = "phone" | "tablet" | "laptop" | "desktop" | "ultrawide";

export const SHELL_BREAKPOINTS = {
  phoneMax: SCREEN_MD_MIN - 1,
  tabletMin: SCREEN_MD_MIN,
  tabletMax: SCREEN_XL_MIN - 1,
  laptopMin: SCREEN_LG_MIN,
  laptopMax: SCREEN_XL_MIN - 1,
  desktopMin: SCREEN_XL_MIN,
  desktopMax: SCREEN_2XL_MIN - 1,
  ultrawideMin: SCREEN_2XL_MIN,
} as const;

/** Whole-pixel width classification (matches common shell behavior). */
export function shellBandFromWidth(cssPxWidth: number): ShellBreakpointBand {
  const w = Math.max(0, Math.round(cssPxWidth));
  if (w < SCREEN_MD_MIN) return "phone";
  if (w < SCREEN_LG_MIN) return "tablet";
  if (w < SCREEN_XL_MIN) return "laptop";
  if (w < SCREEN_2XL_MIN) return "desktop";
  return "ultrawide";
}

/** `matchMedia` query for min-width (client only). */
export function minWidthMediaQuery(minPx: number): string {
  return `(min-width: ${minPx}px)`;
}
