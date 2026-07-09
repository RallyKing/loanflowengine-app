import type { Page } from "@playwright/test";

/** Injected before navigation to accumulate Layout Instability API scores. */
export function layoutShiftCollectorSource(): string {
  return `
(() => {
  const state = { score: 0, hadRecentInputSkips: 0, samples: /** @type {{t:number,v:number,tag?:string}[]} */ ([]) };
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const ls = /** @type {LayoutShift} */ (e);
        if (ls.hadRecentInput) {
          state.hadRecentInputSkips += 1;
          continue;
        }
        state.score += ls.value;
        if (state.samples.length < 32) {
          const src = ls.sources && ls.sources[0];
          const tag =
            src && src.node && /** @type {Element} */ (src.node).tagName
              ? /** @type {Element} */ (src.node).tagName
              : undefined;
          state.samples.push({ t: ls.startTime, v: ls.value, tag });
        }
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch (_) { /* unsupported */ }
  window.__dlcLs = state;
})(); 
`;
}

export async function attachLayoutShiftCollector(page: Page): Promise<void> {
  await page.addInitScript({ content: layoutShiftCollectorSource() });
}

export async function resetLayoutShiftCollector(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __dlcLs?: {
        score: number;
        hadRecentInputSkips: number;
        samples: Array<{ t: number; v: number }>;
      };
    };
    if (!w.__dlcLs) return;
    w.__dlcLs.score = 0;
    w.__dlcLs.hadRecentInputSkips = 0;
    w.__dlcLs.samples = [];
  });
}

export async function readLayoutShiftScore(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __dlcLs?: { score: number } };
    return w.__dlcLs?.score ?? 0;
  });
}

export async function readLayoutShiftDebug(page: Page): Promise<{
  score: number;
  samples: Array<{ t: number; v: number; tag?: string }>;
}> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __dlcLs?: {
        score: number;
        samples: Array<{ t: number; v: number; tag?: string }>;
      };
    };
    return {
      score: w.__dlcLs?.score ?? 0,
      samples: w.__dlcLs?.samples ?? [],
    };
  });
}
