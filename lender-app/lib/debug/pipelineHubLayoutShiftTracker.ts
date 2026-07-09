/**
 * Phase 24.4I — real-time height shift tracker for `/pipeline` hub list.
 *
 * Observes every descendant of `[data-pipeline-hub-list]` via ResizeObserver.
 * After each element's first measured height, any ≥1px change logs:
 *   console.warn("[LAYOUT SHIFT DETECTED]", …, "Old:", n, "New:", m)
 */

import { useEffect, type RefObject } from "react";

const WARN_PREFIX = "[LAYOUT SHIFT DETECTED]";

function reactOwnerLabel(el: Element): string | null {
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  if (!fiberKey) return null;
  type FiberNode = { type?: unknown; return?: FiberNode };
  let fiber = (el as Element & Record<string, FiberNode | undefined>)[fiberKey];
  const seen = new Set<string>();
  while (fiber) {
    const t = fiber.type;
    if (typeof t === "function") {
      const fn = t as { displayName?: string; name?: string };
      const name = fn.displayName || fn.name;
      if (name && !seen.has(name)) {
        seen.add(name);
        return name;
      }
    }
    fiber = fiber.return;
  }
  return null;
}

function describeShiftTarget(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()];
  if (el.id) parts.push(`#${el.id}`);
  const testId = el.getAttribute("data-testid");
  if (testId) parts.push(`data-testid=${testId}`);
  const hubComponent = el.getAttribute("data-pipeline-hub-component");
  if (hubComponent) parts.push(`component=${hubComponent}`);
  const pipelineRow = el.getAttribute("data-pipeline-row");
  if (pipelineRow) parts.push(`file=${pipelineRow.slice(0, 12)}`);
  const owner = reactOwnerLabel(el);
  if (owner) parts.push(`react=${owner}`);
  return parts.join(" ");
}

export type PipelineHubLayoutShiftTrackerStats = {
  observedElements: number;
  shiftWarnings: number;
};

class PipelineHubLayoutShiftTrackerController {
  private heights = new WeakMap<Element, number>();
  private observed = new WeakSet<Element>();
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private root: HTMLElement | null = null;
  shiftWarnings = 0;

  attach(root: HTMLElement): void {
    this.detach();
    this.root = root;
    this.heights = new WeakMap();
    this.observed = new WeakSet();
    this.shiftWarnings = 0;

    if (typeof ResizeObserver === "undefined") {
      console.warn(`${WARN_PREFIX} ResizeObserver unavailable`);
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const newH =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        const oldH = this.heights.get(el);
        if (oldH === undefined) {
          this.heights.set(el, newH);
          continue;
        }
        if (Math.abs(newH - oldH) < 1) continue;
        this.heights.set(el, newH);
        this.shiftWarnings += 1;
        console.warn(
          WARN_PREFIX,
          describeShiftTarget(el),
          el,
          "Old:",
          Math.round(oldH),
          "New:",
          Math.round(newH),
          `Δ${Math.round(newH - oldH)}`,
        );
      }
    });

    const observeEl = (node: Element) => {
      if (this.observed.has(node)) return;
      this.observed.add(node);
      this.resizeObserver!.observe(node);
    };

    const walk = (node: Element) => {
      observeEl(node);
      for (const child of node.children) walk(child);
    };

    walk(root);

    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (!(added instanceof Element)) continue;
          walk(added);
        }
      }
    });
    this.mutationObserver.observe(root, { childList: true, subtree: true });

    console.info(
      `${WARN_PREFIX} tracker active on`,
      root,
      "— scroll the hub; shifts log as warnings.",
    );
  }

  detach(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.root = null;
  }

  stats(): PipelineHubLayoutShiftTrackerStats {
    return {
      observedElements: this.root
        ? this.root.querySelectorAll("*").length + 1
        : 0,
      shiftWarnings: this.shiftWarnings,
    };
  }
}

export const pipelineHubLayoutShiftTracker =
  new PipelineHubLayoutShiftTrackerController();

export type PipelineHubLayoutShiftTrackerGlobal = {
  stats: () => PipelineHubLayoutShiftTrackerStats;
  restart: () => void;
};

export function installPipelineHubLayoutShiftTrackerGlobal(): void {
  if (typeof window === "undefined") return;
  const api: PipelineHubLayoutShiftTrackerGlobal = {
    stats: () => pipelineHubLayoutShiftTracker.stats(),
    restart: () => {
      const root = document.querySelector<HTMLElement>(
        '[data-pipeline-hub-list="hierarchy"]',
      );
      if (root) pipelineHubLayoutShiftTracker.attach(root);
    },
  };
  (
    window as Window & {
      __PIPELINE_HUB_LAYOUT_SHIFT_TRACKER?: PipelineHubLayoutShiftTrackerGlobal;
    }
  ).__PIPELINE_HUB_LAYOUT_SHIFT_TRACKER = api;
}

export function usePipelineHubLayoutShiftTracker(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Re-attach when the list shell mounts or content swaps (loading → hierarchy). */
  attachKey: unknown = null,
): void {
  useEffect(() => {
    if (!enabled) return;
    installPipelineHubLayoutShiftTrackerGlobal();
    const root = containerRef.current;
    if (!root) return;
    pipelineHubLayoutShiftTracker.attach(root);
    return () => pipelineHubLayoutShiftTracker.detach();
  }, [containerRef, enabled, attachKey]);
}

declare global {
  interface Window {
    __PIPELINE_HUB_LAYOUT_SHIFT_TRACKER?: PipelineHubLayoutShiftTrackerGlobal;
  }
}
