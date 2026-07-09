import { cn } from "@/lib/cn";

/**
 * Three governed motion classes (productive / standard / emphasized).
 * Prefer Tailwind utilities below that map to `globals.css` `.dlc-motion-*`.
 *
 * **Product feedback:** Prefer calm state transitions (opacity, border tint,
 * concise `role="status"` copy). Avoid celebratory or high-amplitude motion on
 * finance workflows — see project governance / trust constraints.
 */

export type MotionClass = "productive" | "standard" | "emphasized";

export const motionUtilityClass: Record<MotionClass, string> = {
  productive: "dlc-motion-productive",
  standard: "dlc-motion-standard",
  emphasized: "dlc-motion-emphasized",
};

const MOTION_TRANSITION: Record<MotionClass, string> = {
  productive:
    "motion-safe:transition-[opacity,transform] motion-safe:duration-[var(--dlc-motion-duration-short1)] motion-safe:ease-[var(--dlc-motion-easing-standard)]",
  standard:
    "motion-safe:transition-[opacity,transform] motion-safe:duration-[var(--dlc-motion-duration-short2)] motion-safe:ease-[var(--dlc-motion-easing-standard)]",
  emphasized:
    "motion-safe:transition-[opacity,transform] motion-safe:duration-[var(--dlc-motion-duration-medium1)] motion-safe:ease-[var(--dlc-motion-easing-emphasized)]",
};

/** Prefer `motionUtilityClass` for JIT safety; this duplicates transition tokens in Tailwind. */
export function motionTransitionClass(
  tier: MotionClass,
  className?: string,
): string {
  return cn(MOTION_TRANSITION[tier], className);
}
