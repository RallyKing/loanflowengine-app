"use client";

import { useEffect, useState } from "react";

/**
 * Phase 18.8F — destructive confirm presentation mode (desktop modal vs mobile sheet).
 * Uses `md` (768px) so desktop never inherits bottom-sheet positioning.
 */

export type DestructiveConfirmPresentation = "desktop-modal" | "mobile-sheet";

export function useDestructiveConfirmPresentation(): DestructiveConfirmPresentation {
  const [presentation, setPresentation] =
    useState<DestructiveConfirmPresentation>("desktop-modal");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      setPresentation(mq.matches ? "desktop-modal" : "mobile-sheet");
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return presentation;
}
