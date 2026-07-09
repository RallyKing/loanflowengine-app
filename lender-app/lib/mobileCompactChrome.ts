import { cn } from "@/lib/cn";
import { motionEase, shellMotionTw } from "@/lib/ui/motionTokens";

/**
 * iOS-style easing token (referenced by scroll-reveal inner for MDN parity).
 * @deprecated Prefer `shellMotionTw` from `@/lib/ui/motionTokens`.
 */
export const mobileNativeEase = teClass(motionEase.decelerate);

function teClass(ease: string): string {
  return `max-md:[transition-timing-function:${ease}]`;
}

/**
 * Mobile chrome: composited-only transitions — timing from `shellMotionTw`.
 */
export const mobileCompactTransition = shellMotionTw.mobileCompactOpacityTransform;

export const mobileChromePaddingExpandedY = "max-md:py-2.5";
export const mobileChromePaddingCompactY = "max-md:py-1";
export const mobileChromePaddingFocusY = "max-md:py-0.5";

export function mobileScrollCollapseGridClass(collapsed: boolean) {
  return cn(
    "max-md:grid max-md:overflow-hidden",
    collapsed ? "max-md:grid-rows-[0fr]" : "max-md:grid-rows-[1fr]",
  );
}

/** GPU-friendly layer — durations from motion tokens only. */
export function mobileScrollRevealInnerClass(collapsed: boolean) {
  return cn(
    "min-h-0 overflow-hidden md:overflow-visible",
    "max-md:origin-top",
    shellMotionTw.mobileRevealInner,
    collapsed
      ? "max-md:pointer-events-none max-md:opacity-0 max-md:-translate-y-2"
      : "max-md:opacity-100 max-md:translate-y-0",
    "md:pointer-events-auto md:opacity-100 md:translate-y-0",
  );
}

export const mobileNavTransformTransition = shellMotionTw.bottomNavSlide;

export const mobileFocusBottomNavHidden =
  "max-md:translate-y-full max-md:opacity-0 max-md:pointer-events-none";

export const mobileFocusBottomNavVisible =
  "max-md:translate-y-0 max-md:opacity-100 max-md:pointer-events-auto";

export const mobileContentBottomPadTransition = "max-md:transition-none";

export const mobileFocusChromeTransition = shellMotionTw.bottomNavSlide;

export function mobileWorkspaceStackClass() {
  return cn("flex flex-col", "gap-4 sm:gap-5");
}
