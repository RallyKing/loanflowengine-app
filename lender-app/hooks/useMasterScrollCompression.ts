"use client";

import { useEffect, useRef, useState } from "react";
import type { NavShell } from "@/lib/navigation/useResponsiveNavLayout";

export type MasterScrollCompression = {
  /** Raw scroll progress 0–1 */
  compression: number;
  /** Subpixel-safe translate (px), negative = upward */
  translateY: number;
  /** Uniform scale */
  scale: number;
  /** Shell row opacity (trust band) */
  opacity: number;
};

const COMPRESSION_NEUTRAL: MasterScrollCompression = {
  compression: 0,
  translateY: 0,
  scale: 1,
  opacity: 1,
};

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Ken Perlin's smootherstep — zero first derivative at edges (less “threshold” feel). */
function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * One listener on `[data-app-main-scroll]` — shared curve for SaaS + classic.
 * No route-specific listeners; workspace-delegated routes disable follow.
 */
export function useMasterScrollCompression(opts: {
  shell: NavShell;
  scrollDelegatedToWorkspace: boolean;
  prefersReducedMotion: boolean;
  enabled?: boolean;
}): MasterScrollCompression {
  const {
    shell,
    scrollDelegatedToWorkspace,
    prefersReducedMotion,
    enabled = true,
  } = opts;

  const [out, setOut] = useState<MasterScrollCompression>(COMPRESSION_NEUTRAL);
  const targetRef = useRef(0);
  const currentRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const range =
    shell === "mobile" ? 64 : shell === "tablet" ? 88 : shell === "desktop" ? 112 : 112;

  useEffect(() => {
    // Mobile already has compact/focus behavior via MobileChromeController. Keep
    // the master header visually stable there so scroll-linked shell motion does
    // not register as layout instability on production mobile browsers.
    if (
      !enabled ||
      scrollDelegatedToWorkspace ||
      prefersReducedMotion ||
      shell === "mobile"
    ) {
      setOut(COMPRESSION_NEUTRAL);
      return;
    }
    const main = document.querySelector<HTMLElement>("[data-app-main-scroll]");
    if (!main || main.dataset.mainScrollMode === "workspace-delegated") {
      setOut(COMPRESSION_NEUTRAL);
      return;
    }

    const readTarget = () => smootherstep(0, range, main.scrollTop);

    const applyVisual = (cRaw: number) => {
      const eased = easeOutCubic(cRaw);
      /* Subpixel translate (no rounding) — avoids perceptible “steps” on direction reversals. */
      const translate = -5.25 * eased;
      const scale = 1 - 0.022 * eased;
      const opacity = 0.968 + 0.032 * (1 - eased);
      setOut({
        compression: cRaw,
        translateY: translate,
        scale,
        opacity,
      });
    };

    const tick = () => {
      rafRef.current = null;
      const target = targetRef.current;
      const current = currentRef.current;
      const next = current + (target - current) * 0.26;
      currentRef.current =
        Math.abs(target - next) < 1e-5 ? target : next;
      const c = currentRef.current;
      applyVisual(c);
      if (Math.abs(target - currentRef.current) > 1.5e-4) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    const onScroll = () => {
      targetRef.current = readTarget();
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    targetRef.current = readTarget();
    currentRef.current = targetRef.current;
    applyVisual(currentRef.current);

    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, shell, scrollDelegatedToWorkspace, prefersReducedMotion, range]);

  return out;
}
