import type { Page } from "@playwright/test";

export type ScrollPortDiag = {
  tag: string;
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
};

/** List candidate vertical scrollports inside `[data-app-main-scroll]` for debugging nested scroll. */
export async function diagnoseMainNestedScrollports(page: Page): Promise<ScrollPortDiag[]> {
  return page.evaluate(() => {
    const main = document.querySelector(
      "main[data-testid='app-main-scroll']",
    ) as HTMLElement | null;
    if (!main) return [];
    const out: ScrollPortDiag[] = [];
    const walk = (root: Element) => {
      for (const el of root.querySelectorAll("*")) {
        if (!(el instanceof HTMLElement)) continue;
        const st = getComputedStyle(el);
        if (st.overflowY !== "auto" && st.overflowY !== "scroll") continue;
        if (el.scrollHeight <= el.clientHeight + 4) continue;
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute("data-testid");
        out.push({
          tag: testId ? `${tag}[data-testid=${testId}]` : tag,
          overflowY: st.overflowY,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
        });
      }
    };
    walk(main);
    return out;
  });
}

export async function diagnoseStickyInPipelineShell(page: Page): Promise<{
  stickyTop: number | null;
  mainTop: number | null;
  gap: number | null;
} | null> {
  return page.evaluate(() => {
    const scrollPort = document.querySelector(
      "[data-testid='pipeline-workspace-scroll']",
    ) as HTMLElement | null ??
      (document.querySelector(
        "main[data-testid='app-main-scroll']",
      ) as HTMLElement | null);
    const header = document.querySelector(
      "[data-pipeline-file-workspace-shell] header[role='banner']",
    ) as HTMLElement | null;
    if (!scrollPort || !header) return null;
    const mr = scrollPort.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    return {
      stickyTop: hr.top,
      mainTop: mr.top,
      gap: Math.abs(hr.top - mr.top),
    };
  });
}
