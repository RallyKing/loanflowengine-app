/**
 * Phase 18.8H — runtime overlay containment diagnostics.
 * Enable in production: NEXT_PUBLIC_DLC_CONFIRM_DEBUG=1
 */

import { GLOBAL_OVERLAY_ROOT_ID } from "@/lib/ui/globalOverlayRoot";
import { mapPipelineContainment } from "@/lib/ui/pipelineContainmentMap";

export type ConfirmOverlayAncestorReport = {
  tag: string;
  id: string | null;
  className: string;
  overflow: string;
  overflowX: string;
  overflowY: string;
  contain: string;
  transform: string;
  filter: string;
  perspective: string;
  willChange: string;
  position: string;
  zIndex: string;
  width: number;
  rectWidth: number;
};

export type ConfirmOverlayDebugReport = {
  at: string;
  hostFound: boolean;
  mountParent: {
    tag: string;
    id: string | null;
    isBody: boolean;
    isGlobalOverlayRoot: boolean;
    isAppChrome: boolean;
    isRowActionRail: boolean;
  } | null;
  hostRect: DOMRect | null;
  computedWidth: string | null;
  computedZIndex: string | null;
  nearestOverflowAncestor: ConfirmOverlayAncestorReport | null;
  nearestTransformAncestor: ConfirmOverlayAncestorReport | null;
  nearestContainAncestor: ConfirmOverlayAncestorReport | null;
  ancestryChain: ConfirmOverlayAncestorReport[];
};

export type ConfirmOverlayDebugApi = {
  inspect: (selector?: string) => ConfirmOverlayDebugReport;
  mapContainment: () => ReturnType<typeof mapPipelineContainment>;
  log: (label?: string) => void;
  isEnabled: () => boolean;
};

function ancestorReport(el: Element): ConfirmOverlayAncestorReport {
  const cs = getComputedStyle(el);
  const html = el as HTMLElement;
  const rect = html.getBoundingClientRect?.();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: typeof el.className === "string" ? el.className.slice(0, 120) : "",
    overflow: cs.overflow,
    overflowX: cs.overflowX,
    overflowY: cs.overflowY,
    contain: cs.contain,
    transform: cs.transform,
    filter: cs.filter,
    perspective: cs.perspective,
    willChange: cs.willChange,
    position: cs.position,
    zIndex: cs.zIndex,
    width: html.offsetWidth ?? 0,
    rectWidth: rect?.width ?? 0,
  };
}

function findNearest(
  start: Element | null,
  predicate: (cs: CSSStyleDeclaration, el: Element) => boolean,
): ConfirmOverlayAncestorReport | null {
  let node = start?.parentElement ?? null;
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    if (predicate(cs, node)) return ancestorReport(node);
    node = node.parentElement;
  }
  return null;
}

function buildChain(start: Element | null, max = 12): ConfirmOverlayAncestorReport[] {
  const chain: ConfirmOverlayAncestorReport[] = [];
  let node = start;
  let depth = 0;
  while (node && node !== document.documentElement && depth < max) {
    chain.push(ancestorReport(node));
    node = node.parentElement;
    depth += 1;
  }
  return chain;
}

export function inspectConfirmOverlay(
  selector = "[data-destructive-confirm-host]",
): ConfirmOverlayDebugReport {
  const host = document.querySelector(selector);
  const parent = host?.parentElement ?? null;

  const mountParent = parent
    ? {
        tag: parent.tagName.toLowerCase(),
        id: parent.id || null,
        isBody: parent === document.body,
        isGlobalOverlayRoot: parent.id === GLOBAL_OVERLAY_ROOT_ID,
        isAppChrome: Boolean(parent.closest("[data-app-chrome]")),
        isRowActionRail: Boolean(
          parent.closest(".hub-row-action-rail, [data-hub-row-actions]"),
        ),
      }
    : null;

  const cs = host ? getComputedStyle(host) : null;

  return {
    at: new Date().toISOString(),
    hostFound: Boolean(host),
    mountParent,
    hostRect: host?.getBoundingClientRect() ?? null,
    computedWidth: cs?.width ?? null,
    computedZIndex: cs?.zIndex ?? null,
    nearestOverflowAncestor: findNearest(host, (style) => {
      const ox = style.overflowX;
      const oy = style.overflowY;
      const o = style.overflow;
      return (
        o === "hidden" ||
        o === "clip" ||
        ox === "hidden" ||
        ox === "clip" ||
        oy === "hidden" ||
        oy === "clip"
      );
    }),
    nearestTransformAncestor: findNearest(host, (style) => {
      const t = style.transform;
      return Boolean(t && t !== "none");
    }),
    nearestContainAncestor: findNearest(host, (style) => {
      const c = style.contain;
      return Boolean(c && c !== "none");
    }),
    ancestryChain: buildChain(host),
  };
}

export function confirmDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DLC_CONFIRM_DEBUG === "1"
  );
}

export function installConfirmOverlayDebug(): void {
  if (typeof window === "undefined") return;

  const api: ConfirmOverlayDebugApi = {
    inspect: inspectConfirmOverlay,
    mapContainment: mapPipelineContainment,
    log: (label = "confirm-overlay") => {
      const report = inspectConfirmOverlay();
      console.info(`[${label}]`, report);
    },
    isEnabled: confirmDebugEnabled,
  };

  window.__DLC_CONFIRM_DEBUG__ = api;
}

export function traceConfirmOverlayOpen(testId?: string): void {
  if (!confirmDebugEnabled()) return;
  requestAnimationFrame(() => {
    const report = inspectConfirmOverlay();
    console.info("[dlc-confirm-debug] open", { testId, ...report });
  });
}

declare global {
  interface Window {
    __DLC_CONFIRM_DEBUG__?: ConfirmOverlayDebugApi;
  }
}
