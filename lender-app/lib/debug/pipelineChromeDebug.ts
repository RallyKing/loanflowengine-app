/**
 * Phase 24.4F — pipeline static chrome debug (temporary).
 * Console: window.__PIPELINE_CHROME_DEBUG()
 */

import { isPipelineSurfaceRoute } from "@/lib/navigation/isPipelineSurfaceRoute";

let mobileChromeScrollListeners = 0;
let mobileChromeIntersectionObservers = 0;

export function pipelineChromeDebugRegisterScrollListener(delta: number): void {
  mobileChromeScrollListeners = Math.max(0, mobileChromeScrollListeners + delta);
}

export function pipelineChromeDebugRegisterIntersectionObserver(
  delta: number,
): void {
  mobileChromeIntersectionObservers = Math.max(
    0,
    mobileChromeIntersectionObservers + delta,
  );
}

export type PipelineChromeDebugSnapshot = {
  path: string;
  mobileFocusEnabled: boolean;
  mobileCompactEnabled: boolean;
  bottomNavHidden: boolean;
  topChromeHidden: boolean;
  scrollListeners: number;
  intersectionObservers: number;
};

function navLooksHidden(nav: Element | null): boolean {
  if (!nav) return false;
  if (nav.getAttribute("aria-hidden") === "true") return true;
  const cs = getComputedStyle(nav);
  if (parseFloat(cs.opacity) < 0.05) return true;
  const t = cs.transform;
  if (t && t !== "none") {
    const m = t.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
    if (m) {
      const ty = parseFloat(m[1]);
      if (Math.abs(ty) > 40) return true;
    }
    if (t.includes("matrix3d")) {
      const parts = t.replace("matrix3d(", "").replace(")", "").split(",");
      const ty = parseFloat(parts[13]?.trim() ?? "0");
      if (Math.abs(ty) > 40) return true;
    }
  }
  return false;
}

function topChromeLooksHidden(header: Element | null): boolean {
  if (!header) return false;
  if (header.getAttribute("aria-hidden") === "true") return true;
  const cs = getComputedStyle(header);
  if (parseFloat(cs.opacity) < 0.05) return true;
  if (cs.display === "none" || cs.visibility === "hidden") return true;
  const rect = header.getBoundingClientRect();
  if (rect.height < 2 && rect.bottom < 0) return true;
  return false;
}

export function pipelineChromeDebugSnapshot(): PipelineChromeDebugSnapshot {
  if (typeof window === "undefined") {
    return {
      path: "",
      mobileFocusEnabled: false,
      mobileCompactEnabled: false,
      bottomNavHidden: false,
      topChromeHidden: false,
      scrollListeners: 0,
      intersectionObservers: 0,
    };
  }

  const nav = document.querySelector('nav[aria-label="Primary"]');
  const header = document.querySelector('[data-testid="app-masterpage-chrome"]');

  return {
    path: window.location.pathname,
    mobileFocusEnabled: document.documentElement.hasAttribute(
      "data-dlc-mobile-focus",
    ),
    mobileCompactEnabled: document.documentElement.hasAttribute(
      "data-dlc-mobile-compact",
    ),
    bottomNavHidden: navLooksHidden(nav),
    topChromeHidden: topChromeLooksHidden(header),
    scrollListeners: mobileChromeScrollListeners,
    intersectionObservers: mobileChromeIntersectionObservers,
  };
}

export type PipelineChromeDebugGlobal = () => PipelineChromeDebugSnapshot;

export function installPipelineChromeDebugGlobal(): void {
  if (typeof window === "undefined") return;
  (
    window as Window & { __PIPELINE_CHROME_DEBUG?: PipelineChromeDebugGlobal }
  ).__PIPELINE_CHROME_DEBUG = pipelineChromeDebugSnapshot;
}

export function isPipelineChromeDebugRoute(): boolean {
  if (typeof window === "undefined") return false;
  return isPipelineSurfaceRoute(window.location.pathname);
}

declare global {
  interface Window {
    __PIPELINE_CHROME_DEBUG?: PipelineChromeDebugGlobal;
  }
}
