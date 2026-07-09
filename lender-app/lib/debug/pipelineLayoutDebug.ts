/**
 * Phase 24.4E — layout shift / height / scroll-write forensics (investigation only).
 *
 * Enable:
 *   localStorage.setItem("dlc-pipeline-layout-debug", "1"); location.reload();
 *   — or — /pipeline?pipelineLayoutDebug=1
 *
 * Console: window.__PIPELINE_LAYOUT_DEBUG
 */

export type LayoutShiftRecord = {
  type: "LAYOUT_SHIFT";
  at: number;
  value: number;
  hadRecentInput: boolean;
  sources: Array<{
    node: string | null;
    previousRect: DOMRectReadOnly | null;
    currentRect: DOMRectReadOnly | null;
  }>;
};

export type HeightChangeRecord = {
  type: "HEIGHT_CHANGED";
  at: number;
  key: string;
  selector: string;
  oldHeight: number;
  newHeight: number;
  delta: number;
};

export type ScrollWriteRecord = {
  type: "SCROLL_WRITE";
  at: number;
  api: "scrollTop" | "scrollTo" | "scrollIntoView" | "scrollLeft";
  target: string;
  args: unknown;
  stack: string;
};

export type ComponentRemountRecord = {
  type: "COMPONENT_REMOUNT";
  at: number;
  component: string;
  instanceKey: string;
  mountGeneration: number;
  isRemount: boolean;
};

export type PipelineLayoutDebugEvent =
  | LayoutShiftRecord
  | HeightChangeRecord
  | ScrollWriteRecord
  | ComponentRemountRecord;

export type PipelineLayoutDebugSnapshot = {
  enabled: boolean;
  scrollAnchorOff: boolean;
  layoutShiftCount: number;
  heightChangeCount: number;
  scrollWriteCount: number;
  remountCount: number;
  recentEvents: PipelineLayoutDebugEvent[];
  watchedHeights: Array<{ key: string; selector: string; height: number }>;
};

const STORAGE_KEY = "dlc-pipeline-layout-debug";
const MAX_EVENTS = 300;

const HEIGHT_WATCH_TARGETS: Array<{ key: string; selector: string }> = [
  { key: "pipeline-page-root", selector: "[data-pipeline-page-root]" },
  { key: "pipeline-hub-hierarchy", selector: "[data-pipeline-hub-hierarchy]" },
  {
    key: "pipeline-hub-hierarchy-row",
    selector: "[data-pipeline-hub-hierarchy] > section",
  },
  {
    key: "pipeline-filter-card",
    selector: "[data-pipeline-page-root] .rounded-xl.border.shadow-sm",
  },
  {
    key: "pipeline-hub-toolbar",
    selector: "[data-pipeline-page-root] [data-pipeline-hub-filter-toolbar]",
  },
  { key: "pipeline-board-scroll", selector: '[data-testid="pipeline-board-scroll"]' },
  { key: "app-main-scroll", selector: "[data-app-main-scroll]" },
];

function isPipelinePath(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/pipeline" || p.startsWith("/pipeline/");
}

export function isPipelineLayoutDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!isPipelinePath()) return false;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(window.location.search);
  return (
    q.get("pipelineLayoutDebug") === "1" ||
    q.get("pipelineLayoutDebug") === "true"
  );
}

function shortNode(el: Element | null | undefined): string | null {
  if (!el) return null;
  const parts = [el.tagName.toLowerCase()];
  if (el.id) parts.push(`#${el.id}`);
  const tid = el.getAttribute("data-testid");
  if (tid) parts.push(`[data-testid=${tid}]`);
  const row = el.getAttribute("data-pipeline-row");
  if (row) parts.push(`[data-pipeline-row=${row.slice(0, 8)}…]`);
  return parts.join("");
}

function stackSnippet(): string {
  return (new Error().stack ?? "")
    .split("\n")
    .slice(2, 10)
    .map((l) => l.trim())
    .join(" ← ");
}

let origScrollTopDesc: PropertyDescriptor | undefined;
let origScrollLeftDesc: PropertyDescriptor | undefined;
let origScrollIntoView: Element["scrollIntoView"] | null = null;
let origScrollTo: typeof window.scrollTo | null = null;

class PipelineLayoutDebugController {
  enabled = false;
  scrollAnchorOff = false;
  private events: PipelineLayoutDebugEvent[] = [];
  private layoutObserver: PerformanceObserver | null = null;
  private resizeObservers: ResizeObserver[] = [];
  private heightMap = new Map<string, number>();
  private patched = false;

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.observeLayoutShifts();
    this.observeHeights();
    this.patchScrollWrites();
    console.info(
      "[PIPELINE_LAYOUT_DEBUG] enabled — window.__PIPELINE_LAYOUT_DEBUG.snapshot()",
    );
  }

  disable(): void {
    this.enabled = false;
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    for (const ro of this.resizeObservers) ro.disconnect();
    this.resizeObservers = [];
    this.unpatchScrollWrites();
    this.setScrollAnchorOff(false);
  }

  clear(): void {
    this.events = [];
  }

  private push(event: PipelineLayoutDebugEvent): void {
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    const label =
      event.type === "LAYOUT_SHIFT"
        ? `CLS ${event.value.toFixed(4)}`
        : event.type === "HEIGHT_CHANGED"
          ? `${event.key} ${event.oldHeight}→${event.newHeight}`
          : event.type === "SCROLL_WRITE"
            ? `${event.api} ${event.target}`
            : `${event.component}#${event.instanceKey} gen=${event.mountGeneration}`;
    console.info(`[PIPELINE_LAYOUT_DEBUG] ${event.type} ${label}`);
  }

  logComponentRemount(payload: Omit<ComponentRemountRecord, "type" | "at">): void {
    if (!this.enabled) return;
    this.push({
      type: "COMPONENT_REMOUNT",
      at: Date.now(),
      ...payload,
    });
  }

  private observeLayoutShifts(): void {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      this.layoutObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType !== "layout-shift") continue;
          const ls = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
            sources?: Array<{
              node?: Node;
              previousRect?: DOMRectReadOnly;
              currentRect?: DOMRectReadOnly;
            }>;
          };
          this.push({
            type: "LAYOUT_SHIFT",
            at: Date.now(),
            value: ls.value ?? 0,
            hadRecentInput: Boolean(ls.hadRecentInput),
            sources: (ls.sources ?? []).map((s) => ({
              node:
                s.node instanceof Element ? shortNode(s.node) : String(s.node),
              previousRect: s.previousRect ?? null,
              currentRect: s.currentRect ?? null,
            })),
          });
        }
      });
      this.layoutObserver.observe({ type: "layout-shift", buffered: true });
    } catch (e) {
      console.warn("[PIPELINE_LAYOUT_DEBUG] layout-shift observer failed", e);
    }
  }

  private observeHeights(): void {
    if (typeof ResizeObserver === "undefined") return;
    for (const { key, selector } of HEIGHT_WATCH_TARGETS) {
      const attach = (el: Element) => {
        const h = el.getBoundingClientRect().height;
        this.heightMap.set(key, h);
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const newH =
              entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            const oldH = this.heightMap.get(key) ?? newH;
            if (Math.abs(newH - oldH) < 1) continue;
            this.heightMap.set(key, newH);
            this.push({
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
      };

      const el = document.querySelector(selector);
      if (el) {
        attach(el);
        continue;
      }
      if (key !== "pipeline-hub-hierarchy-row") continue;
      const mo = new MutationObserver(() => {
        document.querySelectorAll(selector).forEach((row) => {
          if (row.getAttribute("data-pld-ro")) return;
          row.setAttribute("data-pld-ro", "1");
          attach(row);
        });
      });
      const root = document.querySelector("[data-pipeline-hub-hierarchy]");
      if (root) {
        mo.observe(root, { childList: true, subtree: true });
        document.querySelectorAll(selector).forEach((row) => {
          row.setAttribute("data-pld-ro", "1");
          attach(row);
        });
      }
    }
  }

  private patchScrollWrites(): void {
    if (this.patched || typeof window === "undefined") return;
    this.patched = true;

    origScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoViewPatched(
      this: Element,
      arg?: boolean | ScrollIntoViewOptions,
    ) {
      if (pipelineLayoutDebugController.enabled) {
        pipelineLayoutDebugController.push({
          type: "SCROLL_WRITE",
          at: Date.now(),
          api: "scrollIntoView",
          target: shortNode(this) ?? "unknown",
          args: arg ?? null,
          stack: stackSnippet(),
        });
      }
      return origScrollIntoView!.call(this, arg);
    };

    origScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => {
      if (pipelineLayoutDebugController.enabled) {
        pipelineLayoutDebugController.push({
          type: "SCROLL_WRITE",
          at: Date.now(),
          api: "scrollTo",
          target: "window",
          args,
          stack: stackSnippet(),
        });
      }
      return origScrollTo!(...args);
    }) as typeof window.scrollTo;

    const proto = Element.prototype as HTMLElement & Element;
    origScrollTopDesc = Object.getOwnPropertyDescriptor(proto, "scrollTop");
    if (origScrollTopDesc?.set && origScrollTopDesc.get) {
      Object.defineProperty(proto, "scrollTop", {
        configurable: true,
        enumerable: origScrollTopDesc.enumerable,
        get() {
          return origScrollTopDesc!.get!.call(this);
        },
        set(v: number) {
          if (pipelineLayoutDebugController.enabled) {
            pipelineLayoutDebugController.push({
              type: "SCROLL_WRITE",
              at: Date.now(),
              api: "scrollTop",
              target: shortNode(this as Element) ?? "element",
              args: v,
              stack: stackSnippet(),
            });
          }
          origScrollTopDesc!.set!.call(this, v);
        },
      });
    }

    origScrollLeftDesc = Object.getOwnPropertyDescriptor(proto, "scrollLeft");
    if (origScrollLeftDesc?.set && origScrollLeftDesc.get) {
      Object.defineProperty(proto, "scrollLeft", {
        configurable: true,
        enumerable: origScrollLeftDesc.enumerable,
        get() {
          return origScrollLeftDesc!.get!.call(this);
        },
        set(v: number) {
          if (pipelineLayoutDebugController.enabled) {
            pipelineLayoutDebugController.push({
              type: "SCROLL_WRITE",
              at: Date.now(),
              api: "scrollLeft",
              target: shortNode(this as Element) ?? "element",
              args: v,
              stack: stackSnippet(),
            });
          }
          origScrollLeftDesc!.set!.call(this, v);
        },
      });
    }
  }

  private unpatchScrollWrites(): void {
    if (!this.patched) return;
    if (origScrollIntoView) Element.prototype.scrollIntoView = origScrollIntoView;
    if (origScrollTo) window.scrollTo = origScrollTo;
    const proto = Element.prototype;
    if (origScrollTopDesc) {
      Object.defineProperty(proto, "scrollTop", origScrollTopDesc);
    }
    if (origScrollLeftDesc) {
      Object.defineProperty(proto, "scrollLeft", origScrollLeftDesc);
    }
    this.patched = false;
  }

  setScrollAnchorOff(off: boolean): void {
    this.scrollAnchorOff = off;
    document.documentElement.toggleAttribute(
      "data-pipeline-layout-debug-anchor-off",
      off,
    );
    console.info(
      `[PIPELINE_LAYOUT_DEBUG] scroll anchor test: overflow-anchor none on hierarchy = ${off}`,
    );
  }

  recentShifts(): LayoutShiftRecord[] {
    return this.events.filter(
      (e): e is LayoutShiftRecord => e.type === "LAYOUT_SHIFT",
    );
  }

  snapshot(): PipelineLayoutDebugSnapshot {
    return {
      enabled: this.enabled,
      scrollAnchorOff: this.scrollAnchorOff,
      layoutShiftCount: this.events.filter((e) => e.type === "LAYOUT_SHIFT")
        .length,
      heightChangeCount: this.events.filter((e) => e.type === "HEIGHT_CHANGED")
        .length,
      scrollWriteCount: this.events.filter((e) => e.type === "SCROLL_WRITE")
        .length,
      remountCount: this.events.filter((e) => e.type === "COMPONENT_REMOUNT")
        .length,
      recentEvents: [...this.events],
      watchedHeights: HEIGHT_WATCH_TARGETS.map(({ key, selector }) => ({
        key,
        selector,
        height: Math.round(this.heightMap.get(key) ?? 0),
      })),
    };
  }
}

export const pipelineLayoutDebugController = new PipelineLayoutDebugController();

export type PipelineLayoutDebugGlobal = {
  enabled: boolean;
  snapshot: () => PipelineLayoutDebugSnapshot;
  recentShifts: () => LayoutShiftRecord[];
  clear: () => void;
  enable: () => void;
  disable: () => void;
  /** Step 5 — test only; toggles overflow-anchor:none on hierarchy root */
  enableScrollAnchorOff: () => void;
  disableScrollAnchorOff: () => void;
};

export function installPipelineLayoutDebugGlobal(): void {
  if (typeof window === "undefined") return;
  const api: PipelineLayoutDebugGlobal = {
    get enabled() {
      return pipelineLayoutDebugController.enabled;
    },
    snapshot: () => pipelineLayoutDebugController.snapshot(),
    recentShifts: () => pipelineLayoutDebugController.recentShifts(),
    clear: () => pipelineLayoutDebugController.clear(),
    enable: () => pipelineLayoutDebugController.enable(),
    disable: () => pipelineLayoutDebugController.disable(),
    enableScrollAnchorOff: () =>
      pipelineLayoutDebugController.setScrollAnchorOff(true),
    disableScrollAnchorOff: () =>
      pipelineLayoutDebugController.setScrollAnchorOff(false),
  };
  (
    window as Window & { __PIPELINE_LAYOUT_DEBUG?: PipelineLayoutDebugGlobal }
  ).__PIPELINE_LAYOUT_DEBUG = api;
}

declare global {
  interface Window {
    __PIPELINE_LAYOUT_DEBUG?: PipelineLayoutDebugGlobal;
  }
}
