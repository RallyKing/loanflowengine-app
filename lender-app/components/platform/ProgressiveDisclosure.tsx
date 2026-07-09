"use client";

import { type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { motionUtilityClass, type MotionClass } from "@/lib/platform-framework";

/**
 * Progressive disclosure primitive — use for optional/advanced blocks without new modal surface.
 * Prefer `motionClass="productive"` on data-dense screens.
 */
export function ProgressiveDisclosure({
  title,
  children,
  defaultOpen = false,
  motionClass = "productive",
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  motionClass?: MotionClass;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div
      data-dlc-progressive="section"
      className={cn("min-w-0 rounded-lg border border-border/60 bg-muted/5 p-2", className)}
    >
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          motionUtilityClass[motionClass],
        )}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0">{title}</span>
        <span className="tabular-nums text-muted-foreground" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div
          id={regionId}
          role="region"
          className="mt-2 min-w-0 border-t border-border/40 pt-2"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
