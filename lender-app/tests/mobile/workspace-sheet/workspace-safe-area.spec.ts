import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { convexConfigured, openAnyPipelineFileWorkspace } from "./_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("workspace sheet — safe area padding", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("file route uses one top safe-area and a single bottom nav spacer", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const metrics = await page.evaluate(() => {
      const sheet = document.querySelector(
        "[data-workspace-sheet-safe-top]",
      ) as HTMLElement | null;
      const spacer = document.querySelector(
        '[data-testid="pipeline-file-bottom-nav-spacer"]',
      ) as HTMLElement | null;
      const header = document.querySelector(
        '[data-testid="pipeline-file-workspace-header"]',
      ) as HTMLElement | null;
      const stage = document.querySelector(
        '[data-testid="pipeline-global-banner-stage"]',
      ) as HTMLElement | null;
      const scrollLead = document.querySelector(
        "[data-pipeline-workspace-scroll] > div.min-w-0",
      ) as HTMLElement | null;

      const sheetPt = sheet ? getComputedStyle(sheet).paddingTop : "0";
      const spacerH = spacer?.getBoundingClientRect().height ?? 0;
      const headerTop = header?.getBoundingClientRect().top ?? -1;
      const stageTop = stage?.getBoundingClientRect().top ?? -1;
      const scrollLeadPb = scrollLead
        ? getComputedStyle(scrollLead).paddingBottom
        : "0";

      return {
        sheetPtPx: parseFloat(sheetPt) || 0,
        spacerH,
        headerTop,
        stageTop,
        scrollLeadPbPx: parseFloat(scrollLeadPb) || 0,
        hasSafeTopAttr: Boolean(sheet),
        hasSpacer: Boolean(spacer),
      };
    });

    testInfo.annotations.push({
      type: "safe-area-metrics",
      description: JSON.stringify(metrics),
    });

    expect(metrics.hasSafeTopAttr).toBe(true);
    expect(metrics.hasSpacer).toBe(true);

    // Playwright desktop Chrome usually reports 0 safe-area; still require the
    // pad rule to be present (0 is valid) and chrome to sit below sheet top.
    expect(metrics.sheetPtPx).toBeGreaterThanOrEqual(0);
    expect(metrics.headerTop).toBeGreaterThanOrEqual(metrics.sheetPtPx - 1);

    // Stage / title must not sit under a non-zero simulated top inset when present.
    expect(metrics.stageTop).toBeGreaterThan(0);

    // File spacer ≈ 4.5rem (+ safe-area). Cap well below the old 8rem dead band.
    expect(metrics.spacerH).toBeGreaterThanOrEqual(64);
    expect(metrics.spacerH).toBeLessThanOrEqual(120);

    // Scroll-lead must not add a second safe-area bottom pad (only small rhythm).
    expect(metrics.scrollLeadPbPx).toBeLessThanOrEqual(16);
  });
});
