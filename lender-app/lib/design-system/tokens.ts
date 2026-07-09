/**
 * TS mirrors for motion/shape/breakpoints. CSS variables are defined in
 * `app/globals.css` (authoritative at runtime).
 */

export const designBreakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type DesignBreakpoint = keyof typeof designBreakpoints;

/** Durations in ms — mirror CSS `--dlc-motion-duration-*` */
export const motionDuration = {
  instant: 50,
  short1: 100,
  short2: 200,
  medium1: 250,
  medium2: 300,
  long1: 350,
  long2: 450,
} as const;

export const motionEasing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  standardAccelerate: "cubic-bezier(0.3, 0, 1, 1)",
  standardDecelerate: "cubic-bezier(0, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const shape = {
  none: "var(--dlc-shape-corner-none)",
  xs: "var(--dlc-shape-corner-extra-small)",
  sm: "var(--dlc-shape-corner-small)",
  md: "var(--dlc-shape-corner-medium)",
  lg: "var(--dlc-shape-corner-large)",
  xl: "var(--dlc-shape-corner-extra-large)",
  full: "var(--dlc-shape-corner-full)",
} as const;

/** High-density pipeline workspace rhythm — 16px (Tailwind `gap-4` / `space-y-4`). */
export const workspaceSectionGapClass = "gap-4";
export const workspaceSectionSpaceClass = "space-y-4";
