"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  NAV_BREAKPOINT_MD,
  NAV_BREAKPOINT_XL,
  NAV_LANDSCAPE_NARROW_PX,
  NAV_SHORT_VIEWPORT_PX,
} from "@/lib/navigation/responsiveNavConstants";

export type NavShell = "mobile" | "tablet" | "desktop";

export type DensityBucket = "standard" | "high";

export type OrientationMode = "portrait" | "landscape";

/** Raw signals from window / visualViewport / media queries. */
export type ViewportNavSignals = {
  innerWidth: number;
  innerHeight: number;
  usableWidth: number;
  usableHeight: number;
  /** Bottom obstruction from visual viewport (e.g. on-screen keyboard). */
  keyboardInsetBottom: number;
  orientation: OrientationMode;
  densityBucket: DensityBucket;
  prefersReducedMotion: boolean;
};

export type ResponsiveNavLayout = ViewportNavSignals & {
  shell: NavShell;
  /** SaaS / desktop: left rail column (icon or expanded). */
  useNavigationRail: boolean;
  /** Sidebar can collapse to icon rail. */
  useCollapsibleRail: boolean;
  /** Primary thumb bar (mobile; tablet when hybrid). */
  useBottomNavigation: boolean;
  /** Classic header strip — hidden when tablet uses bottom primary to avoid duplicate wayfinding. */
  useTabletContextStrip: boolean;
};

const SERVER_SNAPSHOT: ViewportNavSignals = {
  innerWidth: 1280,
  innerHeight: 800,
  usableWidth: 1280,
  usableHeight: 800,
  keyboardInsetBottom: 0,
  orientation: "landscape",
  densityBucket: "standard",
  prefersReducedMotion: false,
};

function viewportSignalsEqual(a: ViewportNavSignals, b: ViewportNavSignals) {
  return (
    a.innerWidth === b.innerWidth &&
    a.innerHeight === b.innerHeight &&
    a.usableWidth === b.usableWidth &&
    a.usableHeight === b.usableHeight &&
    a.keyboardInsetBottom === b.keyboardInsetBottom &&
    a.orientation === b.orientation &&
    a.densityBucket === b.densityBucket &&
    a.prefersReducedMotion === b.prefersReducedMotion
  );
}

/** Last returned client snapshot — `useSyncExternalStore` requires stable referential equality when values are unchanged. */
let clientViewportSnapshot: ViewportNavSignals | null = null;

/** Phase 24.4Q — pipeline routes: no resize/visualViewport listeners; static snapshot. */
let pipelineViewportFreezeActive = false;
let pipelineViewportFrozenSnapshot: ViewportNavSignals | null = null;

export function isPipelineViewportNavSignalsFrozen(): boolean {
  return pipelineViewportFreezeActive;
}

export function setPipelineViewportNavSignalsFrozen(frozen: boolean): void {
  if (typeof window === "undefined") return;
  if (frozen) {
    unlockViewportNavSignalsForHydration();
    clientViewportSnapshot = null;
    pipelineViewportFrozenSnapshot = readSignals();
    pipelineViewportFreezeActive = true;
    return;
  }
  pipelineViewportFreezeActive = false;
  pipelineViewportFrozenSnapshot = null;
  clientViewportSnapshot = null;
  readSignals();
  emitViewportSignals();
}

/**
 * Until this flips false, `useViewportNavSignals` mirrors {@link SERVER_SNAPSHOT}
 * on the client so the first commit matches SSR / `getServerSnapshot`, then
 * `unlockViewportNavSignalsForHydration` (ResponsiveNavProvider layout effect)
 * applies real window metrics before paint — avoids a desktop→mobile shell flip
 * that scores as massive CLS on mobile Playwright.
 */
let viewportSignalsLocked = true;
let viewportStoreVersion = 0;
const viewportListeners = new Set<() => void>();

function emitViewportSignals(): void {
  viewportStoreVersion += 1;
  for (const l of viewportListeners) l();
}

/**
 * Call once from `ResponsiveNavProvider` `useLayoutEffect` (after SSR).
 * Idempotent.
 */
export function unlockViewportNavSignalsForHydration(): void {
  if (typeof window === "undefined") return;
  if (!viewportSignalsLocked) return;
  viewportSignalsLocked = false;
  clientViewportSnapshot = null;
  readSignals();
  emitViewportSignals();
}

/** Whole pixels — damp visualViewport subpixel / scroll jitter that was churning snapshots. */
function layoutPx(n: number): number {
  return Math.round(Math.max(0, n));
}

function readSignals(): ViewportNavSignals {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  const vv = window.visualViewport;
  const usableWidth = layoutPx(vv?.width ?? window.innerWidth);
  const usableHeight = layoutPx(vv?.height ?? window.innerHeight);
  const keyboardInsetBottom = vv
    ? layoutPx(
        Math.max(0, window.innerHeight - vv.height - (vv.offsetTop ?? 0)),
      )
    : 0;

  const landscape = window.matchMedia("(orientation: landscape)").matches;

  let densityBucket: DensityBucket = "standard";
  try {
    if (window.matchMedia("(min-resolution: 2.5dppx)").matches) {
      densityBucket = "high";
    } else if (window.devicePixelRatio >= 2.5) {
      densityBucket = "high";
    }
  } catch {
    if (window.devicePixelRatio >= 2.5) densityBucket = "high";
  }

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const next: ViewportNavSignals = {
    innerWidth: layoutPx(window.innerWidth),
    innerHeight: layoutPx(window.innerHeight),
    usableWidth,
    usableHeight,
    keyboardInsetBottom,
    orientation: landscape ? "landscape" : "portrait",
    densityBucket,
    prefersReducedMotion,
  };

  if (
    clientViewportSnapshot !== null &&
    viewportSignalsEqual(clientViewportSnapshot, next)
  ) {
    return clientViewportSnapshot;
  }
  clientViewportSnapshot = next;
  return next;
}

function subscribeViewportSignals(onChange: () => void) {
  viewportListeners.add(onChange);

  if (pipelineViewportFreezeActive) {
    return () => {
      viewportListeners.delete(onChange);
    };
  }

  let debounceTimer: number | null = null;
  const scheduleDebounced = () => {
    if (viewportSignalsLocked) return;
    if (debounceTimer != null) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      const prev = clientViewportSnapshot ?? SERVER_SNAPSHOT;
      requestAnimationFrame(() => {
        clientViewportSnapshot = null;
        const next = readSignals();
        if (!viewportSignalsEqual(prev, next)) {
          emitViewportSignals();
        }
      });
    }, 80);
  };

  window.addEventListener("resize", scheduleDebounced);
  window.visualViewport?.addEventListener("resize", scheduleDebounced);
  window.visualViewport?.addEventListener("scroll", scheduleDebounced);

  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqOrient = window.matchMedia("(orientation: landscape)");
  const mqRes =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(min-resolution: 2.5dppx)")
      : null;

  mqReduce.addEventListener("change", scheduleDebounced);
  mqOrient.addEventListener("change", scheduleDebounced);
  mqRes?.addEventListener("change", scheduleDebounced);

  return () => {
    viewportListeners.delete(onChange);
    if (debounceTimer != null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    window.removeEventListener("resize", scheduleDebounced);
    window.visualViewport?.removeEventListener("resize", scheduleDebounced);
    window.visualViewport?.removeEventListener("scroll", scheduleDebounced);
    mqReduce.removeEventListener("change", scheduleDebounced);
    mqOrient.removeEventListener("change", scheduleDebounced);
    mqRes?.removeEventListener("change", scheduleDebounced);
  };
}

function getServerSnapshot(): ViewportNavSignals {
  return SERVER_SNAPSHOT;
}

function getViewportSignalsSnapshot(): ViewportNavSignals {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (viewportSignalsLocked) return SERVER_SNAPSHOT;
  if (pipelineViewportFreezeActive && pipelineViewportFrozenSnapshot) {
    return pipelineViewportFrozenSnapshot;
  }
  return readSignals();
}

export function useViewportNavSignals(): ViewportNavSignals {
  return useSyncExternalStore(
    subscribeViewportSignals,
    () => {
      void viewportStoreVersion;
      return getViewportSignalsSnapshot();
    },
    getServerSnapshot,
  );
}

export function deriveResponsiveNavLayout(
  s: ViewportNavSignals,
  tabletBottomNavEnabled: boolean,
): ResponsiveNavLayout {
  const vw = s.usableWidth;
  const vh = s.usableHeight;

  const shell: NavShell =
    vw < NAV_BREAKPOINT_MD
      ? "mobile"
      : vw < NAV_BREAKPOINT_XL
        ? "tablet"
        : "desktop";

  const useNavigationRail = shell !== "mobile";
  const useCollapsibleRail = shell !== "mobile";

  const compactLandscapeTablet =
    shell === "tablet" &&
    s.orientation === "landscape" &&
    vw < NAV_LANDSCAPE_NARROW_PX;

  const shortViewport = vh < NAV_SHORT_VIEWPORT_PX;

  const useBottomNavigation =
    shell === "mobile" ||
    (shell === "tablet" &&
      (tabletBottomNavEnabled || shortViewport || compactLandscapeTablet));

  const useTabletContextStrip =
    shell === "tablet" && !useBottomNavigation;

  return {
    ...s,
    shell,
    useNavigationRail,
    useCollapsibleRail,
    useBottomNavigation,
    useTabletContextStrip,
  };
}

export function useResponsiveNavLayout(
  tabletBottomNavEnabled: boolean,
): ResponsiveNavLayout {
  const signals = useViewportNavSignals();
  return useMemo(
    () => deriveResponsiveNavLayout(signals, tabletBottomNavEnabled),
    [signals, tabletBottomNavEnabled],
  );
}
