/**
 * Single source for shell motion — durations and curves feed Tailwind arbitrary
 * classes and inline `transition` where needed. No duplicate magic numbers in layout.
 */

import { cn } from "@/lib/cn";

export const motionMs = {
  /** Mobile chrome opacity/transform (legacy compact path — prefer master scroll hook) */
  compactChrome: 280,
  /** Reveal inner layers */
  reveal: 320,
  /** Header morph follow-up (CSS only when used) */
  headerMorph: 320,
  /** Bottom nav + tablet focus slide */
  bottomNav: 300,
  /** Search overlay / backdrop */
  searchOverlay: 260,
  /** Drawer / dock position */
  drawer: 280,
  /** Desktop sidebar expand / collapse width */
  sidebarRail: 300,
  /** Desktop sidebar label/icon crossfade */
  sidebarRailFade: 180,
  /** Color / micro */
  hover: 180,
  /** Bottom sheet “more” panel */
  sheet: 280,
} as const;

export const motionEase = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/** Build arbitrary transition-timing-function for Tailwind arbitrary slot. */
function te(ease: string): string {
  return `[transition-timing-function:${ease}]`;
}

/**
 * Precomposed Tailwind class strings (static at build time — values from motionMs).
 */
export const shellMotionTw = {
  mobileCompactOpacityTransform: cn(
    "max-md:transition-[opacity,transform]",
    `max-md:duration-[${motionMs.compactChrome}ms]`,
    te(motionEase.decelerate),
    "max-md:motion-reduce:transition-none",
  ),
  mobileRevealInner: cn(
    "max-md:transition-[opacity,transform]",
    `max-md:duration-[${motionMs.reveal}ms]`,
    te(motionEase.decelerate),
    "max-md:motion-reduce:transition-none max-md:motion-reduce:duration-0",
  ),
  bottomNavSlide: cn(
    "max-md:transition-[transform,opacity]",
    `max-md:duration-[${motionMs.bottomNav}ms]`,
    te(motionEase.standard),
    "max-md:motion-reduce:transition-none",
  ),
  tabletFocusSlide: cn(
    "md:max-xl:transition-[transform,opacity]",
    `md:max-xl:duration-[${motionMs.bottomNav}ms]`,
    te(motionEase.standard),
    "md:max-xl:motion-reduce:transition-none",
  ),
  navLinkTone: cn(
    "transition-[color,background-color,opacity]",
    `duration-[${motionMs.hover}ms]`,
    te(motionEase.standard),
    "motion-reduce:transition-none",
  ),
  /** Dense chrome: tablet search pill width — keep in sync with GlobalSearchPalette. */
  tabletSearchTrigger: cn(
    "motion-safe:overflow-hidden motion-safe:transition-[max-width,padding,gap]",
    "motion-safe:duration-300 motion-safe:ease-out",
    "motion-reduce:transition-none",
  ),
  searchBackdrop: cn(
    "transition-[opacity,backdrop-filter]",
    `duration-[${motionMs.searchOverlay}ms]`,
    te(motionEase.standard),
    "motion-reduce:transition-none",
  ),
  sheetBody: cn(
    "transition-[transform,opacity]",
    `duration-[${motionMs.sheet}ms]`,
    te(motionEase.decelerate),
    "motion-reduce:transition-none",
  ),
  drawerTranslate: cn(
    "max-md:transition-transform",
    `max-md:duration-[${motionMs.drawer}ms]`,
    te(motionEase.standard),
    "max-md:motion-reduce:transition-none",
  ),
  /** Desktop left nav width — keep SaasSidebar + collapsed rail in sync. */
  sidebarRailWidth: cn(
    "md:transition-[width,min-width,max-width,border-color]",
    // Static class names so Tailwind JIT always emits them (matches motionMs.sidebarRail).
    "md:duration-300",
    te(motionEase.standard),
    "md:motion-reduce:transition-none",
  ),
  sidebarRailFade: cn(
    "md:transition-opacity",
    // Static — matches motionMs.sidebarRailFade (~180ms).
    "md:duration-200",
    te(motionEase.standard),
    "md:motion-reduce:transition-none",
  ),
  workspaceDockChip: cn(
    "motion-safe:transition-[transform,opacity,background-color]",
    `motion-safe:duration-[${motionMs.hover}ms]`,
    te(motionEase.standard),
    "motion-safe:motion-reduce:transition-none",
    "motion-safe:active:scale-[0.98]",
  ),
} as const;

export function shellTransformTransitionClass(reducedMotion: boolean): string {
  if (reducedMotion) return "transition-none";
  return cn(
    "transition-[opacity,transform]",
    `duration-[${motionMs.headerMorph}ms]`,
    te(motionEase.decelerate),
  );
}
