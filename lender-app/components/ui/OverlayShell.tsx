"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  layerZIndexStyle,
  overlayScrimClass,
  overlaySurfaceClass,
  type OverlaySurfaceVariant,
  type ZLayer,
} from "@/lib/ui/layering";

export type OverlayShellAlign = "center" | "bottom-sheet";

type OverlayShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Scrim + root stacking tier (default modal). */
  layer?: ZLayer;
  align?: OverlayShellAlign;
  /** Panel surface variant when using default panel wrapper. */
  surface?: OverlaySurfaceVariant;
  /** When false, children must include their own panel (full custom layout). */
  wrapPanel?: boolean;
  panelClassName?: string;
  scrimClassName?: string;
  className?: string;
  /** When `wrapPanel={false}`, classes for the custom content wrapper (default small dialog width). */
  contentClassName?: string;
  role?: "dialog" | "alertdialog";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "data-testid"?: string;
};

/**
 * Unified modal / bottom-sheet shell: scrim, escape, click-outside, z-index tokens.
 */
export function OverlayShell({
  open,
  onClose,
  children,
  layer = "MODAL",
  align = "center",
  surface = "modal-panel",
  wrapPanel = true,
  panelClassName,
  scrimClassName,
  className,
  contentClassName,
  role = "dialog",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "data-testid": testId,
}: OverlayShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className={cn(
        "fixed inset-0 flex p-4",
        align === "center" && "items-center justify-center",
        align === "bottom-sheet" && "items-end justify-center sm:items-center",
        className,
      )}
      style={layerZIndexStyle(layer)}
      data-testid={testId}
      role="presentation"
      onClick={onClose}
    >
      <button
        type="button"
        className={cn(
          "absolute inset-0 cursor-default backdrop-blur-[2px]",
          overlayScrimClass(),
          scrimClassName,
        )}
        aria-label="Close"
        tabIndex={-1}
      />
      {wrapPanel ? (
        <div
          role={role}
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={cn(
            overlaySurfaceClass(surface),
            "relative w-full max-w-md rounded-dlc-lg",
            // Bottom sheet: keep panel bounded; children own internal sticky footers/scroll regions.
            align === "bottom-sheet" && "max-h-[min(90dvh,640px)] overflow-y-hidden",
            panelClassName,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : (
        <div
          className={cn(
            "relative mx-auto w-full shrink-0",
            contentClassName ?? "max-w-[min(100%,28rem)]",
            align === "bottom-sheet" && "max-md:max-h-[min(92dvh,720px)]",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
