"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useShellMotionReady } from "@/components/layout/ShellMotionReadyContext";
import type { MasterScrollCompression } from "@/hooks/useMasterScrollCompression";

type MasterHeaderShellProps = {
  children: ReactNode;
  compression: MasterScrollCompression;
  prefersReducedMotion: boolean;
  /** Phase 24.4P — no scroll-linked transform/opacity on pipeline surfaces. */
  layoutLocked?: boolean;
  className?: string;
};

/**
 * GPU-composited shell chrome — `transform-origin: top center`, quantized
 * translate from {@link useMasterScrollCompression} (no layout/reflow).
 */
export function MasterHeaderShell({
  children,
  compression,
  prefersReducedMotion,
  layoutLocked = false,
  className,
}: MasterHeaderShellProps) {
  const shellMotionReady = useShellMotionReady();
  const freezeChrome =
    layoutLocked || !shellMotionReady || prefersReducedMotion;
  return (
    <div
      className={cn(
        "will-change-transform",
        freezeChrome && "motion-reduce:transform-none max-md:!transition-none",
        className,
      )}
      style={
        freezeChrome
          ? {
              transform: "none",
              opacity: 1,
              transformOrigin: "center top",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              isolation: "isolate",
              transition: "none",
            }
          : {
              transform: `translate3d(0, ${compression.translateY}px, 0) scale(${compression.scale})`,
              opacity: compression.opacity,
              transformOrigin: "center top",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              isolation: "isolate",
            }
      }
    >
      {children}
    </div>
  );
}
