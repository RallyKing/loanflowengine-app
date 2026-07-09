"use client";

import { useEffect, useState } from "react";
import { designBreakpoints } from "@/lib/design-system/tokens";

export type NavigationBreakpointMode = "mobile" | "tablet" | "desktop";

function modeFromWidth(w: number): NavigationBreakpointMode {
  if (w >= designBreakpoints.lg) return "desktop";
  if (w >= designBreakpoints.md) return "tablet";
  return "mobile";
}

/**
 * Three-way shell breakpoint: mobile (&lt;768), tablet (768–1023), desktop (≥1024).
 */
export function useNavigationBreakpoint(): NavigationBreakpointMode {
  const [mode, setMode] = useState<NavigationBreakpointMode>("desktop");

  useEffect(() => {
    const read = () => setMode(modeFromWidth(window.innerWidth));
    read();
    const mqMd = window.matchMedia(`(min-width: ${designBreakpoints.md}px)`);
    const mqLg = window.matchMedia(`(min-width: ${designBreakpoints.lg}px)`);
    const on = () => read();
    mqMd.addEventListener("change", on);
    mqLg.addEventListener("change", on);
    window.addEventListener("resize", on);
    return () => {
      mqMd.removeEventListener("change", on);
      mqLg.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  return mode;
}
