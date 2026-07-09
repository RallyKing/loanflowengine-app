"use client";

import { useEffect, useState } from "react";

/**
 * Mobile virtual keyboard shrinks the visual viewport; cap dialog/sheet height so
 * footers and primary actions stay reachable without nested scroll fights.
 */
export function useVisualViewportMaxHeightStyle(enabled: boolean): {
  maxHeight: string | undefined;
} {
  const [px, setPx] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const apply = () => {
      const top = vv.offsetTop ?? 0;
      const avail = Math.max(0, vv.height + top);
      setPx(avail);
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [enabled]);

  if (!enabled || px == null) return { maxHeight: undefined };
  return { maxHeight: `min(94dvh, ${px}px)` };
}
