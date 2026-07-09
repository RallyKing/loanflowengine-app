"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getGlobalOverlayPortalTarget } from "@/lib/ui/globalOverlayRoot";

/**
 * Provider-level portal — mounts confirm UI into `#dlc-global-overlay-root`
 * before DestructiveConfirmShell applies its own layer (belt-and-suspenders).
 */
export function OperationalConfirmOverlayHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTarget(getGlobalOverlayPortalTarget());
  }, []);

  if (!target) return null;

  return createPortal(children, target);
}
