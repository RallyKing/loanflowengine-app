"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "compact";

/**
 * Non-crashing shell when live data or permissions are unavailable.
 */
export function DegradedModeShell({
  title,
  description,
  children,
  variant = "default",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  variant?: Variant;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-50",
        variant === "compact" ? "p-4 text-sm" : "p-6 text-sm",
      )}
    >
      <p className="font-semibold">{title}</p>
      {description ? (
        <p className="mt-2 text-muted-foreground dark:text-amber-100/85">{description}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
