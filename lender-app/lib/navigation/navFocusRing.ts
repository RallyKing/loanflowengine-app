import { cn } from "@/lib/cn";

/** Keyboard focus ring for navigation targets (not pointer-only). */
export const navFocusRingClass = cn(
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);
