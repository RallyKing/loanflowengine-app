"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { touchTargetIconClass } from "@/lib/ui/touchTarget";
import {
  opMotionChevronDownClass,
  opMotionChevronRightClass,
  opMotionCollapseClosed,
  opMotionCollapseGrid,
  opMotionCollapseInner,
  opMotionCollapseOpen,
  opMotionDisclosureBodyClass,
} from "@/lib/ui/operationalMotion";

type OperationalDisclosureToggleProps = {
  expanded: boolean;
  onToggle: () => void;
  labelCollapsed?: string;
  labelExpanded?: string;
  className?: string;
  testId?: string;
  /** Header band uses down chevron; hierarchy rows use right. */
  axis?: "down" | "right";
};

/**
 * Phase 18.3 — normalized disclosure toggle (chevron + timing).
 */
export function OperationalDisclosureToggle({
  expanded,
  onToggle,
  labelCollapsed = "Show details",
  labelExpanded = "Hide details",
  className,
  testId,
  axis = "down",
}: OperationalDisclosureToggleProps) {
  const Chevron = axis === "right" ? ChevronRight : ChevronDown;
  const chevronClass =
    axis === "right"
      ? opMotionChevronRightClass(expanded)
      : opMotionChevronDownClass(expanded);

  return (
    <Tooltip content={expanded ? labelExpanded : labelCollapsed}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-8 shrink-0 p-0 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          touchTargetIconClass,
          className,
        )}
        data-testid={testId}
        aria-expanded={expanded}
        aria-label={expanded ? labelExpanded : labelCollapsed}
        onClick={onToggle}
      >
        <Chevron className={chevronClass} aria-hidden />
      </Button>
    </Tooltip>
  );
}

type OperationalDisclosurePanelProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Preserve scroll anchor during collapse (grid 0fr pattern). */
  preserveScrollAnchor?: boolean;
};

/**
 * Animated disclosure body — grid collapse, consistent fade rhythm.
 */
export function OperationalDisclosurePanel({
  open,
  children,
  className,
  testId,
  preserveScrollAnchor = true,
}: OperationalDisclosurePanelProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        opMotionCollapseGrid,
        open ? opMotionCollapseOpen : opMotionCollapseClosed,
        className,
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          opMotionCollapseInner,
          preserveScrollAnchor && "[overflow-anchor:none]",
        )}
      >
        <div
          className={cn(
            opMotionDisclosureBodyClass,
            !open && "pointer-events-none opacity-0",
            open && "opacity-100",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Inline row chevron (no button chrome). */
export function OperationalDisclosureChevron({
  expanded,
  axis = "right",
  className,
}: {
  expanded: boolean;
  axis?: "down" | "right";
  className?: string;
}) {
  const Chevron = axis === "right" ? ChevronRight : ChevronDown;
  const chevronClass =
    axis === "right"
      ? opMotionChevronRightClass(expanded)
      : opMotionChevronDownClass(expanded);

  return <Chevron className={cn(chevronClass, className)} aria-hidden />;
}
