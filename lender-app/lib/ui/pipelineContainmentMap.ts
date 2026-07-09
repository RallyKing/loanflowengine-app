/**
 * Phase 18.8H — scroll / clipping ownership map helpers (dev diagnostics).
 * Call from console: `window.__DLC_CONFIRM_DEBUG__?.inspect()` after open confirm.
 */

export type ContainmentNodeReport = {
  selector: string;
  scrollOwner: string | null;
  clippingParent: string | null;
  layer: string | null;
  overflow: string;
  rectWidth: number;
};

const MARKERS = [
  "[data-global-overlay-root]",
  "[data-app-main-scroll]",
  "[data-pipeline-page-root]",
  "[data-pipeline-hub-list]",
  "[data-pipeline-hub-hierarchy]",
  "[data-pipeline-workspace-scroll]",
  ".hub-row-action-rail",
] as const;

export function mapPipelineContainment(): ContainmentNodeReport[] {
  if (typeof document === "undefined") return [];
  return MARKERS.map((selector) => {
    const el = document.querySelector(selector);
    if (!el) {
      return {
        selector,
        scrollOwner: null,
        clippingParent: null,
        layer: null,
        overflow: "missing",
        rectWidth: 0,
      };
    }
    const html = el as HTMLElement;
    const cs = getComputedStyle(el);
    return {
      selector,
      scrollOwner: el.getAttribute("data-scroll-owner"),
      clippingParent: el.getAttribute("data-clipping-parent"),
      layer: el.getAttribute("data-layer"),
      overflow: `${cs.overflowX}/${cs.overflowY}`,
      rectWidth: html.getBoundingClientRect().width,
    };
  });
}
