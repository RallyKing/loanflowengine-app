"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useOperationalFocusReturn } from "@/lib/ui/operationalFocus";
import {
  operationalOverlayPanelClass,
  operationalZIndexClass,
  overlayScrimClass,
  type ZLayer,
} from "@/lib/ui/operationalTokens";
import { OverlayShell, type OverlayShellAlign } from "@/components/ui/OverlayShell";
import type { OverlaySurfaceVariant } from "@/lib/ui/layering";

type OperationalOverlayShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  layer?: ZLayer;
  align?: OverlayShellAlign;
  surface?: OverlaySurfaceVariant;
  wrapPanel?: boolean;
  panelClassName?: string;
  scrimClassName?: string;
  className?: string;
  role?: "dialog" | "alertdialog";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "data-testid"?: string;
};

/**
 * Phase 18.1 — modal / sheet shell with opaque panel tokens (no scrim bleed).
 */
export function OperationalOverlayShell(props: OperationalOverlayShellProps) {
  const {
    panelClassName,
    scrimClassName,
    open,
    ...rest
  } = props;
  useOperationalFocusReturn(open);
  return (
    <OverlayShell
      {...rest}
      open={open}
      scrimClassName={cn(overlayScrimClass(), scrimClassName)}
      panelClassName={cn(
        operationalOverlayPanelClass("rounded-dlc-lg"),
        panelClassName,
      )}
    />
  );
}

type OperationalAnchoredPanelProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  role?: "dialog" | "menu" | "listbox";
  "aria-label"?: string;
  "data-testid"?: string;
  layer?: ZLayer;
};

/** Fixed-position panel (portaled menus) — opaque surface + z token class. */
export function OperationalAnchoredPanel({
  children,
  className,
  style,
  role = "dialog",
  "aria-label": ariaLabel,
  "data-testid": testId,
  layer = "DROPDOWN",
}: OperationalAnchoredPanelProps) {
  return (
    <div
      data-operational-anchored-panel
      data-testid={testId}
      role={role}
      aria-label={ariaLabel}
      className={cn(
        operationalOverlayPanelClass("rounded-dlc-md"),
        operationalZIndexClass(layer),
        className,
      )}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
