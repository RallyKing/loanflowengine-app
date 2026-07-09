/**
 * Elevation registry — shadows only; z-index lives in `overlayStack.ts`.
 * Mirrors `app/globals.css` `--dlc-elevation-*`.
 */
export const elevationVar = {
  0: "--dlc-elevation-0",
  1: "--dlc-elevation-1",
  2: "--dlc-elevation-2",
  3: "--dlc-elevation-3",
  4: "--dlc-elevation-4",
  5: "--dlc-elevation-5",
} as const;

export type ElevationLevel = keyof typeof elevationVar;

/** Tailwind arbitrary shadow: `shadow-[var(--dlc-elevation-n)]` */
export function elevationShadowClass(level: ElevationLevel): string {
  return `shadow-[var(${elevationVar[level]})]`;
}
