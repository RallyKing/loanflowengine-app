"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { layerZIndexStyle, type ZLayer } from "@/lib/ui/layering";
import { operationalOverlayDropdownClass } from "@/lib/ui/operationalTokens";

type PortalOverlayPanelProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Fixed position anchor (viewport coords). */
  position: { top: number; left: number; width?: number };
  layer?: ZLayer;
  className?: string;
  role?: "dialog" | "menu" | "listbox";
  "aria-label"?: string;
  "data-testid"?: string;
};

/**
 * Body-portal dropdown/popover — escapes overflow clipping with opaque surface.
 */
export function PortalOverlayPanel({
  open,
  onClose,
  children,
  position,
  layer = "DROPDOWN",
  className,
  role = "dialog",
  "aria-label": ariaLabel,
  "data-testid": testId,
}: PortalOverlayPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-portal-overlay-panel]")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      data-portal-overlay-panel
      data-testid={testId}
      role={role}
      aria-label={ariaLabel}
      className={cn(operationalOverlayDropdownClass(), className)}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        ...layerZIndexStyle(layer),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
