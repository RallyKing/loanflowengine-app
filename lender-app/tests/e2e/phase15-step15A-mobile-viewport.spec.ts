import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import {
  assertDocumentFitsViewport,
  assertNoHorizontalOverflow,
} from "../helpers/mobile/viewportOverflow";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = PROD && workspaceSessionReady();

const VIEWPORTS = [
  { width: 320, height: 568, label: "320x568" },
  { width: 375, height: 812, label: "375x812" },
  { width: 390, height: 844, label: "390x844" },
  { width: 414, height: 896, label: "414x896" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 1024, height: 768, label: "1024x768" },
] as const;

async function dismissMobileNavIfOpen(page: import("@playwright/test").Page) {
  const close = page.getByRole("button", { name: "Close menu" });
  for (let i = 0; i < 6; i += 1) {
    const vis = await close.isVisible().catch(() => false);
    if (!vis) return;
    try {
      await close.click({ force: true, timeout: 5_000 });
    } catch {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(200);
  }
}

async function waitPipelineLoaded(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading pipeline…")).toHaveCount(0, {
    timeout: 45_000,
  });
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Phase 15 Step 15A — mobile viewport stabilization (prod)", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid='app-masterpage-chrome']")).toBeVisible({
      timeout: 60_000,
    });
  });

  test("canonical viewport meta allows pinch zoom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const meta = await page.evaluate(() =>
      document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    );
    expect(meta).toBeTruthy();
    expect(meta).toMatch(/width=device-width/i);
    expect(meta).toMatch(/initial-scale=1/i);
    expect(meta).toMatch(/viewport-fit=cover/i);
    expect(meta).not.toMatch(/user-scalable=no/i);
    expect(meta).not.toMatch(/maximum-scale=1\b/i);
  });

  for (const vp of VIEWPORTS) {
    test(`document width locked @ ${vp.label}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await dismissMobileNavIfOpen(page);
      await waitPipelineLoaded(page);

      const metrics = await assertDocumentFitsViewport(page, vp.label);
      testInfo.annotations.push({
        type: "viewport-metrics",
        description: JSON.stringify(metrics),
      });

      // Below md: main should not grow past the viewport (no page-level bleed).
      // At tablet+, pipeline table/grid may scroll horizontally inside <main> by design.
      if (vp.width < 768) {
        const main = page.getByTestId("app-main-scroll");
        await expect(main).toBeVisible({ timeout: 15_000 });
        const mainMetrics = await main.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        assertNoHorizontalOverflow(
          `${vp.label} app-main-scroll`,
          mainMetrics.scrollWidth,
          mainMetrics.clientWidth,
        );
      }

      const chrome = page.locator("[data-testid='app-masterpage-chrome']");
      const chromeBox = await chrome.boundingBox();
      expect(chromeBox).toBeTruthy();
      expect(chromeBox!.width).toBeLessThanOrEqual(vp.width + 2);
      expect(chromeBox!.x).toBeGreaterThanOrEqual(-1);

      const hubShell = page.locator("[data-testid='pipeline-hub-hierarchy-shell']");
      if ((await hubShell.count()) > 0) {
        const hubMetrics = await hubShell.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        assertNoHorizontalOverflow(
          `${vp.label} pipeline-hub-hierarchy-shell`,
          hubMetrics.scrollWidth,
          hubMetrics.clientWidth,
        );
      }
    });
  }

  test("notifications dropdown stays within viewport @ 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);

    const bell = page.locator("[data-testid='notifications-bell']");
    if ((await bell.count()) === 0) {
      test.skip(true, "No notifications bell in this session");
    }
    await bell.click();
    const panel = page.locator("[data-testid='notifications-inbox-panel']");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    const box = await panel.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(-2);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 2);
    await assertDocumentFitsViewport(page, "notifications-open");
    await page.keyboard.press("Escape");
  });

  test("search palette stays within viewport @ 375x812", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);

    const openSearch = page.getByRole("button", { name: "Open search" });
    if (!(await openSearch.isVisible().catch(() => false))) {
      test.skip(true, "Search trigger not visible");
    }
    await openSearch.click();
    const dialog = page.getByRole("dialog", { name: "Global search" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 2);
    await assertDocumentFitsViewport(page, "search-palette-open");
    await page.keyboard.press("Escape");
  });
});
