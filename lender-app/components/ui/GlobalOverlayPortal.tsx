"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getGlobalOverlayPortalTarget } from "@/lib/ui/globalOverlayRoot";

type GlobalOverlayPortalProps = {
  children: ReactNode;
  enabled?: boolean;
};

/**
 * Portals children directly into `#dlc-global-overlay-root` (no wrapper box).
 * Avoids `display: contents` / nested stacking contexts that can trap layout.
 */
export function GlobalOverlayPortal({
  children,
  enabled = true,
}: GlobalOverlayPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;
    setTarget(getGlobalOverlayPortalTarget());
  }, [enabled]);

  if (!enabled || !target) return null;

  return createPortal(children, target);
}
