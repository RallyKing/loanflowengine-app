/**
 * Phase 24.4C — opt-in pipeline scroll forensics (investigation only).
 *
 * Enable:
 *   localStorage.setItem("dlc-pipeline-scroll-debug", "1"); location.reload();
 *   — or — ?pipelineScrollDebug=1 on any /pipeline URL
 *
 * Console: window.PIPELINE_SCROLL_DEBUG
 */

export type PipelineScrollDebugSnapshot = {
  enabled: boolean;
  route: string;
  activeScrollContainer: ScrollContainerInfo | null;
  nestedScrollContainers: ScrollContainerInfo[];
  stickyElements: PositionedElementInfo[];
  fixedElements: PositionedElementInfo[];
  watchedRoots: WatchedRootInfo[];
  virtualization: VirtualizationInfo;
  scrollApiCallCount: number;
  scrollCorrectionCount: number;
  heightChangeCount: number;
  recentEvents: PipelineScrollDebugEvent[];
};

export type ScrollContainerInfo = {
  tag: string;
  id: string | null;
  testId: string | null;
  selector: string;
  overflowY: string;
  overflowX: string;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  isPrimary: boolean;
};

export type PositionedElementInfo = {
  tag: string;
  testId: string | null;
  selector: string;
  top: string;
  zIndex: string;
  rect: { top: number; height: number };
};

export type WatchedRootInfo = {
  key: string;
  selector: string;
  height: number;
  lastChangeAt: number | null;
};

export type VirtualizationInfo = {
  library: "@tanstack/react-virtual" | "none" | "unknown";
  activeOnPage: boolean;
  visibleRowEstimate: number | null;
  translateYRowNodes: number;
  paddingSpacerRows: number;
};

export type PipelineScrollDebugEvent =
  | {
      type: "SCROLL_CORRECTION_DETECTED";
      at: number;
      container: string;
      previous: number;
      current: number;
      delta: number;
      userScrolling: boolean;
    }
  | {
      type: "HEIGHT_CHANGED";
      at: number;
      key: string;
      selector: string;
      oldHeight: number;
      newHeight: number;
      delta: number;
    }
  | {
      type: "SCROLL_API_CALL";
      at: number;
      api: "scrollIntoView" | "scrollTo" | "scrollTop" | "scrollLeft";
      target: string;
      args: unknown;
      stack: string;
    }
  | {
      type: "VISIBLE_ROW_COUNT";
      at: number;
      count: number;
      translateYNodes: number;
      paddingSpacers: number;
    };

const STORAGE_KEY = "dlc-pipeline-scroll-debug";
const MAX_EVENTS = 200;
const CORRECTION_THRESHOLD_PX = 3;
const SCROLL_SAMPLE_MS = 16;

const WATCH_ROOTS: Array<{ key: string; selector: string }> = [
  { key: "pipeline-page-root", selector: "[data-pipeline-page-root]" },
  { key: "pipeline-hub-hierarchy", selector: "[data-pipeline-hub-hierarchy]" },
  { key: "pipeline-hub-list", selector: '[data-pipeline-hub-list="hierarchy"]' },
  { key: "pipeline-board-scroll", selector: '[data-testid="pipeline-board-scroll"]' },
  {
    key: "pipeline-hub-orientation",
    selector: '[data-testid="pipeline-hub-orientation"]',
  },
  { key: "pipeline-filter-card", selector: "[data-pipeline-page-root] .rounded-xl.border" },
  { key: "app-main-scroll", selector: "[data-app-main-scroll]" },
  { key: "pipeline-workspace-scroll", selector: "[data-pipeline-workspace-scroll]" },
];

function isPipelinePath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/pipeline" || p.startsWith("/pipeline/");
}

export function isPipelineScrollDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!isPipelinePath()) return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(window.location.search);
  return q.get("pipelineScrollDebug") === "1" || q.get("pipelineScrollDebug") === "true";
}

function shortSelector(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()];
  const id = el.id?.trim();
  if (id) parts.push(`#${id}`);
  const tid = el.getAttribute("data-testid");
  if (tid) parts.push(`[data-testid=${tid}]`);
  const owner = el.getAttribute("data-scroll-owner");
  if (owner) parts.push(`[data-scroll-owner=${owner}]`);
  return parts.join("");
}

function stackSnippet(): string {
  const err = new Error();
  const lines = (err.stack ?? "")
    .split("\n")
    .slice(2, 8)
    .map((l) => l.trim());
  return lines.join(" ← ");
}

function isScrollContainer(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  const oy = style.overflowY;
  const ox = style.overflowX;
  const scrollableY =
    (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
  const scrollableX =
    (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
  return scrollableY || scrollableX;
}

function describeScrollContainer(el: HTMLElement): ScrollContainerInfo {
  const style = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    testId: el.getAttribute("data-testid"),
    selector: shortSelector(el),
    overflowY: style.overflowY,
    overflowX: style.overflowX,
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    isPrimary:
      el.matches("[data-app-main-scroll]") ||
      el.matches("[data-pipeline-workspace-scroll]"),
  };
}

function scanScrollContainers(): ScrollContainerInfo[] {
  const root = document.querySelector("[data-pipeline-page-root]") ?? document.body;
  const out: ScrollContainerInfo[] = [];
  const walk = (el: Element) => {
    if (el instanceof HTMLElement && isScrollContainer(el)) {
      out.push(describeScrollContainer(el));
    }
    for (const c of el.children) walk(c);
  };
  walk(root);
  const workspace = document.querySelector<HTMLElement>(
    "[data-pipeline-workspace-scroll]",
  );
  if (workspace && !out.some((o) => o.selector.includes("pipeline-workspace-scroll"))) {
    out.push(describeScrollContainer(workspace));
  }
  const main = document.querySelector<HTMLElement>("[data-app-main-scroll]");
  if (main && !out.some((o) => o.selector.includes("app-main-scroll"))) {
    out.push(describeScrollContainer(main));
  }
  return out;
}

function scanPositioned(kind: "sticky" | "fixed"): PositionedElementInfo[] {
  const out: PositionedElementInfo[] = [];
  const root = document.querySelector("[data-pipeline-page-root]") ?? document.body;
  const walk = (el: Element) => {
    if (el instanceof HTMLElement) {
      const pos = getComputedStyle(el).position;
      if (pos === kind) {
        const r = el.getBoundingClientRect();
        out.push({
          tag: el.tagName.toLowerCase(),
          testId: el.getAttribute("data-testid"),
          selector: shortSelector(el),
          top: getComputedStyle(el).top,
          zIndex: getComputedStyle(el).zIndex,
          rect: { top: Math.round(r.top), height: Math.round(r.height) },
        });
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(root);
  const header = document.querySelector<HTMLElement>(
    '[data-testid="app-masterpage-chrome"]',
  );
  if (header && getComputedStyle(header).position === kind) {
    const r = header.getBoundingClientRect();
    out.push({
      tag: header.tagName.toLowerCase(),
      testId: header.getAttribute("data-testid"),
      selector: shortSelector(header),
      top: getComputedStyle(header).top,
      zIndex: getComputedStyle(header).zIndex,
      rect: { top: Math.round(r.top), height: Math.round(r.height) },
    });
  }
  return out;
}

function detectVirtualization(): VirtualizationInfo {
  const translateNodes = document.querySelectorAll(
    '[style*="translateY("], [style*="translate3d"]',
  );
  const paddingSpacers = document.querySelectorAll(
    "tr.pointer-events-none td[style*='height']",
  );
  const cardVirtual = document.querySelector(
    "[data-pipeline-hub-hierarchy] .absolute.left-0.top-0",
  );
  const active =
    paddingSpacers.length > 0 ||
    translateNodes.length > 3 ||
    cardVirtual != null;
  return {
    library: active ? "@tanstack/react-virtual" : "none",
    activeOnPage: active,
    visibleRowEstimate: paddingSpacers.length > 0 ? paddingSpacers.length : null,
    translateYRowNodes: translateNodes.length,
    paddingSpacerRows: paddingSpacers.length,
  };
}

let origScrollIntoView: Element["scrollIntoView"] | null = null;
let origScrollTo: typeof window.scrollTo | null = null;

class PipelineScrollDebugController {
  enabled = false;
  recentEvents: PipelineScrollDebugEvent[] = [];
  scrollApiCallCount = 0;
  scrollCorrectionCount = 0;
  heightChangeCount = 0;
  private roEntries = new Map<string, { el: Element; height: number }>();
  private resizeObservers: ResizeObserver[] = [];
  private rafId: number | null = null;
  private lastMainScroll = 0;
  private lastWindowScroll = 0;
  private lastWorkspaceScroll = 0;
  private lastBoardScroll = 0;
  private userScrolling = false;
  private scrollEndTimer: ReturnType<typeof setTimeout> | null = null;
  private patched = false;

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.patchScrollApis();
    this.attachScrollListeners();
    this.attachResizeObservers();
    this.startScrollSampler();
    console.info(
      "[PIPELINE_SCROLL_DEBUG] enabled — call PIPELINE_SCROLL_DEBUG.snapshot()",
    );
    this.logEvent({
      type: "VISIBLE_ROW_COUNT",
      at: Date.now(),
      ...this.countVisibleRows(),
    });
  }

  disable(): void {
    this.enabled = false;
    this.unpatchScrollApis();
    for (const ro of this.resizeObservers) ro.disconnect();
    this.resizeObservers = [];
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    if (this.scrollEndTimer) clearTimeout(this.scrollEndTimer);
  }

  private pushEvent(event: PipelineScrollDebugEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > MAX_EVENTS) {
      this.recentEvents.length = MAX_EVENTS;
    }
    const label =
      event.type === "SCROLL_CORRECTION_DETECTED"
        ? `Δ${event.delta}px on ${event.container}`
        : event.type === "HEIGHT_CHANGED"
          ? `${event.key} ${event.oldHeight}→${event.newHeight}`
          : event.type === "SCROLL_API_CALL"
            ? `${event.api} ${event.target}`
            : `rows=${event.count}`;
    console.info(`[PIPELINE_SCROLL_DEBUG] ${event.type} ${label}`);
  }

  logEvent(event: PipelineScrollDebugEvent): void {
    this.pushEvent(event);
  }

  private countVisibleRows(): {
    count: number;
    translateYNodes: number;
    paddingSpacers: number;
  } {
    const hierarchy = document.querySelector("[data-pipeline-hub-hierarchy]");
    const fileRows = hierarchy
      ? hierarchy.querySelectorAll('[data-pipeline-row], [data-testid*="pipeline-hub"]')
      : document.querySelectorAll("[data-pipeline-row]");
    const translateYNodes = document.querySelectorAll('[style*="translateY("]').length;
    const paddingSpacers = document.querySelectorAll(
      "tr.pointer-events-none td[style*='height']",
    ).length;
    return {
      count: fileRows.length,
      translateYNodes,
      paddingSpacers,
    };
  }

  private patchScrollApis(): void {
    if (this.patched || typeof window === "undefined") return;
    this.patched = true;
    origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoViewPatched(
      this: Element,
      arg?: boolean | ScrollIntoViewOptions,
    ) {
      const ctrl = pipelineScrollDebugController;
      if (ctrl.enabled) {
        ctrl.scrollApiCallCount += 1;
        ctrl.logEvent({
          type: "SCROLL_API_CALL",
          at: Date.now(),
          api: "scrollIntoView",
          target: shortSelector(this),
          args: arg ?? null,
          stack: stackSnippet(),
        });
      }
      return origScrollIntoView!.call(this, arg);
    };

    origScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => {
      if (this.enabled) {
        this.scrollApiCallCount += 1;
        this.logEvent({
          type: "SCROLL_API_CALL",
          at: Date.now(),
          api: "scrollTo",
          target: "window",
          args,
          stack: stackSnippet(),
        });
      }
      return origScrollTo!(...args);
    }) as typeof window.scrollTo;
  }

  private unpatchScrollApis(): void {
    if (!this.patched) return;
    if (origScrollIntoView) {
      Element.prototype.scrollIntoView = origScrollIntoView;
    }
    if (origScrollTo) {
      window.scrollTo = origScrollTo;
    }
    this.patched = false;
  }

  private markUserScroll(): void {
    this.userScrolling = true;
    if (this.scrollEndTimer) clearTimeout(this.scrollEndTimer);
    this.scrollEndTimer = setTimeout(() => {
      this.userScrolling = false;
    }, 150);
  }

  private attachScrollListeners(): void {
    const main = document.querySelector("[data-app-main-scroll]");
    main?.addEventListener("scroll", () => this.markUserScroll(), { passive: true });
    const ws = document.querySelector("[data-pipeline-workspace-scroll]");
    ws?.addEventListener("scroll", () => this.markUserScroll(), { passive: true });
    window.addEventListener("scroll", () => this.markUserScroll(), { passive: true });
  }

  private attachResizeObservers(): void {
    if (typeof ResizeObserver === "undefined") return;
    for (const { key, selector } of WATCH_ROOTS) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const height = el.getBoundingClientRect().height;
      this.roEntries.set(key, { el, height });
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const newH = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          const prev = this.roEntries.get(key);
          if (!prev) continue;
          const oldH = prev.height;
          if (Math.abs(newH - oldH) < 1) continue;
          prev.height = newH;
          this.heightChangeCount += 1;
          this.logEvent({
            type: "HEIGHT_CHANGED",
            at: Date.now(),
            key,
            selector,
            oldHeight: Math.round(oldH),
            newHeight: Math.round(newH),
            delta: Math.round(newH - oldH),
          });
        }
      });
      ro.observe(el);
      this.resizeObservers.push(ro);
    }
  }

  private startScrollSampler(): void {
    const tick = () => {
      if (!this.enabled) return;
      const main = document.querySelector<HTMLElement>("[data-app-main-scroll]");
      const ws = document.querySelector<HTMLElement>(
        "[data-pipeline-workspace-scroll]",
      );
      const board = document.querySelector<HTMLElement>(
        '[data-testid="pipeline-board-scroll"]',
      );

      const mainTop = main?.scrollTop ?? 0;
      const winY = window.scrollY;
      const wsTop = ws?.scrollTop ?? 0;
      const boardLeft = board?.scrollLeft ?? 0;

      this.checkCorrection("main.scrollTop", this.lastMainScroll, mainTop, main);
      this.checkCorrection("window.scrollY", this.lastWindowScroll, winY, null);
      this.checkCorrection(
        "workspace.scrollTop",
        this.lastWorkspaceScroll,
        wsTop,
        ws,
      );
      this.checkCorrection(
        "board.scrollLeft",
        this.lastBoardScroll,
        boardLeft,
        board,
        true,
      );

      this.lastMainScroll = mainTop;
      this.lastWindowScroll = winY;
      this.lastWorkspaceScroll = wsTop;
      this.lastBoardScroll = boardLeft;

      if (Math.random() < 0.05) {
        const rows = this.countVisibleRows();
        this.logEvent({
          type: "VISIBLE_ROW_COUNT",
          at: Date.now(),
          count: rows.count,
          translateYNodes: rows.translateYNodes,
          paddingSpacers: rows.paddingSpacers,
        });
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private checkCorrection(
    label: string,
    prev: number,
    next: number,
    el: HTMLElement | null,
    allowDuringUserScroll = false,
  ): void {
    const delta = next - prev;
    if (Math.abs(delta) < CORRECTION_THRESHOLD_PX) return;
    if (prev === 0 && next > 0 && this.userScrolling) return;
    const backward = delta < 0 && this.userScrolling && !allowDuringUserScroll;
    const forwardJump = delta > 40 && !this.userScrolling;
    const microBackward = delta < -CORRECTION_THRESHOLD_PX && this.userScrolling;
    if (!forwardJump && !microBackward && !allowDuringUserScroll) return;
    if (microBackward || forwardJump) {
      this.scrollCorrectionCount += 1;
      this.logEvent({
        type: "SCROLL_CORRECTION_DETECTED",
        at: Date.now(),
        container: label,
        previous: prev,
        current: next,
        delta,
        userScrolling: this.userScrolling,
      });
    }
    void el;
  }

  snapshot(): PipelineScrollDebugSnapshot {
    const containers = scanScrollContainers();
    const primary =
      containers.find((c) => c.isPrimary) ??
      containers.find((c) => c.selector.includes("app-main-scroll")) ??
      null;
    return {
      enabled: this.enabled,
      route: typeof window !== "undefined" ? window.location.pathname : "",
      activeScrollContainer: primary,
      nestedScrollContainers: containers.filter((c) => !c.isPrimary),
      stickyElements: scanPositioned("sticky"),
      fixedElements: scanPositioned("fixed"),
      watchedRoots: WATCH_ROOTS.map(({ key, selector }) => {
        const entry = this.roEntries.get(key);
        const el = document.querySelector(selector);
        return {
          key,
          selector,
          height: Math.round(
            entry?.height ?? el?.getBoundingClientRect().height ?? 0,
          ),
          lastChangeAt:
            this.recentEvents.find(
              (e) => e.type === "HEIGHT_CHANGED" && e.key === key,
            )?.at ?? null,
        };
      }),
      virtualization: detectVirtualization(),
      scrollApiCallCount: this.scrollApiCallCount,
      scrollCorrectionCount: this.scrollCorrectionCount,
      heightChangeCount: this.heightChangeCount,
      recentEvents: [...this.recentEvents],
    };
  }

  /** Manual bisect helper — logs which sticky strip is present (does not mutate DOM). */
  bisectStickyCandidates(): Array<{ selector: string; testId: string | null; rect: DOMRect }> {
    return scanPositioned("sticky").map((s) => {
      const el = document.querySelector(s.selector);
      return {
        selector: s.selector,
        testId: s.testId,
        rect: el?.getBoundingClientRect() ?? new DOMRect(),
      };
    });
  }

  clearEvents(): void {
    this.recentEvents = [];
    this.scrollApiCallCount = 0;
    this.scrollCorrectionCount = 0;
    this.heightChangeCount = 0;
  }
}

export const pipelineScrollDebugController = new PipelineScrollDebugController();

export type PipelineScrollDebugGlobal = {
  enabled: boolean;
  snapshot: () => PipelineScrollDebugSnapshot;
  enable: () => void;
  disable: () => void;
  clearEvents: () => void;
  bisectStickyCandidates: () => ReturnType<
    PipelineScrollDebugController["bisectStickyCandidates"]
  >;
  scan: () => PipelineScrollDebugSnapshot;
};

export function installPipelineScrollDebugGlobal(): void {
  if (typeof window === "undefined") return;
  const api: PipelineScrollDebugGlobal = {
    get enabled() {
      return pipelineScrollDebugController.enabled;
    },
    snapshot: () => pipelineScrollDebugController.snapshot(),
    scan: () => pipelineScrollDebugController.snapshot(),
    enable: () => pipelineScrollDebugController.enable(),
    disable: () => pipelineScrollDebugController.disable(),
    clearEvents: () => pipelineScrollDebugController.clearEvents(),
    bisectStickyCandidates: () =>
      pipelineScrollDebugController.bisectStickyCandidates(),
  };
  (window as Window & { PIPELINE_SCROLL_DEBUG?: PipelineScrollDebugGlobal }).PIPELINE_SCROLL_DEBUG =
    api;
}

declare global {
  interface Window {
    PIPELINE_SCROLL_DEBUG?: PipelineScrollDebugGlobal;
  }
}
