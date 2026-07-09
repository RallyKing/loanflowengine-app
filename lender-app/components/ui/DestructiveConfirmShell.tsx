"use client";

/**
 * Phase 18.9 — destructive confirm: body-level global overlay root, dominant z-index,
 * viewport-centered desktop panel (immune to row/table flex constraints).
 */

import { useLayoutEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  layerZIndexStyle,
  overlayScrimClass,
} from "@/lib/ui/layering";
import type { DestructiveConfirmPresentation } from "@/lib/ui/useDestructiveConfirmPresentation";
import { GlobalOverlayPortal } from "@/components/ui/GlobalOverlayPortal";
import { traceConfirmOverlayOpen } from "@/lib/ui/confirmOverlayDebug";

const DESTRUCTIVE_LAYER = "DESTRUCTIVE_CONFIRM" as const;

type DestructiveConfirmShellProps = {
  open: boolean;
  onClose: () => void;
  presentation: DestructiveConfirmPresentation;
  children: ReactNode;
  "data-testid"?: string;
};

export function DestructiveConfirmShell({
  open,
  onClose,
  presentation,
  children,
  "data-testid": testId,
}: DestructiveConfirmShellProps) {
  const isDesktop = presentation === "desktop-modal";

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) traceConfirmOverlayOpen(testId);
  }, [open, testId]);

  if (!open) return null;

  const scrim = (
    <button
      type="button"
      className={cn(
        "absolute inset-0 cursor-default backdrop-blur-[3px]",
        overlayScrimClass(),
        isDesktop ? "bg-black/45" : "bg-black/50",
      )}
      aria-label="Close"
      tabIndex={-1}
      onClick={onClose}
    />
  );

  const panelClass = cn(
    "isolate flex w-full max-w-[90vw] flex-col overflow-hidden border border-border/60 bg-background shadow-dlc-3",
    "[background-color:var(--dlc-surface-container-highest)]",
    isDesktop
      ? cn(
          "dlc-destructive-confirm-desktop",
          "w-[min(640px,90vw)] min-w-[min(100%,400px)] max-w-[90vw]",
          "max-h-[min(82vh,760px)] rounded-dlc-xl",
        )
      : cn(
          "dlc-destructive-confirm-sheet",
          "relative max-h-[min(88dvh,640px)]",
          "rounded-t-dlc-xl pb-[max(0px,env(safe-area-inset-bottom))]",
        ),
  );

  const overlay = isDesktop ? (
    <div
      className="pointer-events-auto fixed inset-0 isolate grid place-items-center p-4 sm:p-8"
      style={layerZIndexStyle(DESTRUCTIVE_LAYER)}
      data-testid={testId}
      data-destructive-confirm-root
      data-destructive-confirm-portaled="true"
      data-presentation="desktop-modal"
      data-layer="destructive-confirm"
      role="presentation"
    >
      {scrim}
      <div
        data-destructive-confirm-host
        data-presentation="desktop-modal"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  ) : (
    <div
      className="pointer-events-auto fixed inset-0 isolate flex flex-col justify-end"
      style={layerZIndexStyle(DESTRUCTIVE_LAYER)}
      data-testid={testId}
      data-destructive-confirm-root
      data-destructive-confirm-portaled="true"
      data-presentation="mobile-sheet"
      data-layer="destructive-confirm"
      role="presentation"
    >
      {scrim}
      <div className="relative z-[1] w-full max-w-full shrink-0">
        <div
          data-destructive-confirm-host
          data-presentation="mobile-sheet"
          className={panelClass}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return <GlobalOverlayPortal enabled={open}>{overlay}</GlobalOverlayPortal>;
}
