/**
 * Prevent mobile browser focus-zoom on form controls.
 *
 * iOS Safari zooms when an editable control’s computed font-size is below 16px.
 * Use mobile-first 16px (`text-base`), allow smaller typography from `md` up.
 *
 * Permanent CSS backstop: unlayered `font-size: 16px !important` in `app/globals.css`
 * (must stay outside `@layer` — a prior `:where()` + `@layer components` floor lost to
 * Tailwind `text-xs` / `text-sm` and reintroduced zoom).
 */

/** Tailwind: 16px on viewports below `md`, 14px (`text-sm`) on desktop. */
export const MOBILE_SAFE_FORM_FONT_CLASS = "text-base md:text-sm";

/** Minimum computed size on mobile (px). */
export const MOBILE_INPUT_MIN_FONT_PX = 16;
