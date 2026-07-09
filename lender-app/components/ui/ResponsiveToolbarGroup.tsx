"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { OP_SPACING } from "@/lib/ui/operationalTokens";
import { OP_TOOLBAR_DIVIDER } from "@/lib/ui/operationalElegance";

export type ToolbarGroupPriority = "primary" | "secondary" | "tertiary";

const priorityVisibility: Record<ToolbarGroupPriority, string> = {
  /** Always visible — search, projection, primary CTA. */
  primary: "flex",
  /** Collapse on phone; visible from `sm`. */
  secondary: "hidden sm:flex",
  /** Collapse on tablet; visible from `lg`. */
  tertiary: "hidden lg:flex",
};

type ResponsiveToolbarGroupProps = {
  children: ReactNode;
  priority?: ToolbarGroupPriority;
  /** Visual separator before this group (desktop). */
  showDividerBefore?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Progressive toolbar collapse — keeps hub/header rows from overlapping on narrow viewports.
 */
export function ResponsiveToolbarGroup({
  children,
  priority = "secondary",
  showDividerBefore = false,
  className,
  "aria-label": ariaLabel,
}: ResponsiveToolbarGroupProps) {
  return (
    <>
      {showDividerBefore ? <span className={OP_TOOLBAR_DIVIDER} aria-hidden /> : null}
      <div
        className={cn(
          "min-w-0 flex-wrap items-center",
          OP_SPACING.toolbarGap,
          priorityVisibility[priority],
          priority === "primary" ? "flex" : undefined,
          className,
        )}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </>
  );
}
