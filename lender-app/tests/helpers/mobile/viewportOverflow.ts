import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export type ViewportOverflowMetrics = {
  label: string;
  innerWidth: number;
  clientWidth: number;
  scrollWidth: number;
  visualViewportScale: number | null;
  viewportMeta: string | null;
};

/** Allow subpixel / rounding; flag real horizontal overflow. */
export function assertNoHorizontalOverflow(
  label: string,
  scrollWidth: number,
  clientWidth: number,
): void {
  expect(
    scrollWidth,
    `${label}: scrollWidth (${scrollWidth}) should not exceed clientWidth (${clientWidth})`,
  ).toBeLessThanOrEqual(clientWidth + 2);
}

export async function collectViewportOverflowMetrics(
  page: Page,
  label: string,
): Promise<ViewportOverflowMetrics> {
  return page.evaluate((viewportLabel) => {
    const el = document.documentElement;
    const meta = document.querySelector('meta[name="viewport"]');
    const vv = window.visualViewport;
    return {
      label: viewportLabel,
      innerWidth: window.innerWidth,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      visualViewportScale: vv?.scale ?? null,
      viewportMeta: meta?.getAttribute("content") ?? null,
    };
  }, label);
}

export async function assertDocumentFitsViewport(
  page: Page,
  label: string,
): Promise<ViewportOverflowMetrics> {
  const metrics = await collectViewportOverflowMetrics(page, label);
  assertNoHorizontalOverflow(
    `${label} documentElement`,
    metrics.scrollWidth,
    metrics.clientWidth,
  );
  expect(
    metrics.clientWidth,
    `${label}: document clientWidth should match innerWidth`,
  ).toBe(metrics.innerWidth);
  expect(
    metrics.visualViewportScale ?? 1,
    `${label}: visual viewport scale should be 1 (no browser zoom-out)`,
  ).toBeGreaterThanOrEqual(0.99);
  expect(metrics.visualViewportScale ?? 1).toBeLessThanOrEqual(1.01);
  return metrics;
}
