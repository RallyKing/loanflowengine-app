"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { OP_MOTION_MS } from "@/lib/ui/operationalMotion";

type OperationalContentRevealProps = {
  children: ReactNode;
  className?: string;
  /** Delay one frame so layout can settle before fade. */
  deferFrame?: boolean;
  /** Phase 24.4I — skip opacity transition (immediate full opacity). */
  instant?: boolean;
};

/** Masks layout settle — perceived responsiveness without data changes. */
export function OperationalContentReveal({
  children,
  className,
  deferFrame = true,
  instant = false,
}: OperationalContentRevealProps) {
  const [visible, setVisible] = useState(!deferFrame || instant);

  useEffect(() => {
    if (!deferFrame || instant) return;
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [deferFrame, instant]);

  if (instant) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn(
        "transition-opacity ease-out motion-reduce:transition-none",
        `duration-[${OP_MOTION_MS.structural}ms]`,
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
