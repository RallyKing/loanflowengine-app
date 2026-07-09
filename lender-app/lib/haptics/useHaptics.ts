"use client";

import { useCallback } from "react";

export type HapticStyle = "selection" | "light" | "medium";

/**
 * Navigator.vibrate when available — capability-based, no user-agent branching.
 * Silently no-ops where the API is absent or blocked.
 */
export function useHaptics() {
  return useCallback((style: HapticStyle) => {
    if (typeof navigator === "undefined") return;
    const vibrate = navigator.vibrate?.bind(navigator);
    if (!vibrate) return;
    try {
      if (style === "selection") vibrate(12);
      else if (style === "light") vibrate(18);
      else vibrate([22, 12, 22]);
    } catch {
      /* blocked or unsupported pattern */
    }
  }, []);
}
