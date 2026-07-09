import { cn } from "@/lib/cn";

/** Shared nav surface motion; omits transitions when reduced motion is requested. */
export function navMotionTransition(prefersReducedMotion: boolean) {
  return cn(
    !prefersReducedMotion &&
      "transition-[transform,opacity,width,margin] duration-dlc-short2 ease-dlc-standard",
    prefersReducedMotion && "transition-none",
  );
}
