import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import { collectViewportOverflowMetrics } from "../helpers/mobile/viewportOverflow";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = PROD && workspaceSessionReady();

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Phase 24.3B — mobile input focus zoom (prod)", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
  });

  test("viewport meta does not disable pinch zoom", async ({ page }) => {
    const meta = await page.evaluate(() =>
      document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    );
    expect(meta).toMatch(/width=device-width/i);
    expect(meta).not.toMatch(/user-scalable=no/i);
    expect(meta).not.toMatch(/maximum-scale=1\b/i);
  });

  test("tasks search focus keeps visualViewport scale at 1", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("textbox", { name: /search tasks/i }).first();
    await expect(search).toBeVisible({ timeout: 60_000 });
    await search.focus();
    await page.waitForTimeout(400);
    const focused = await collectViewportOverflowMetrics(page, "tasks-search-focus");
    expect(focused.visualViewportScale ?? 1).toBeGreaterThanOrEqual(0.99);
    expect(focused.visualViewportScale ?? 1).toBeLessThanOrEqual(1.01);
    const fontPx = await search.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontPx).toBeGreaterThanOrEqual(16);
    await search.blur();
    await page.waitForTimeout(300);
    const blurred = await collectViewportOverflowMetrics(page, "tasks-search-blur");
    expect(blurred.visualViewportScale ?? 1).toBeLessThanOrEqual(1.01);
  });

  test("global search focus keeps visualViewport scale at 1", async ({ page }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid='app-masterpage-chrome']")).toBeVisible({
      timeout: 60_000,
    });
    const openSearch = page.getByRole("button", { name: /search/i }).first();
    await openSearch.click();
    const query = page.getByRole("textbox", { name: /search query/i });
    await expect(query).toBeVisible({ timeout: 15_000 });
    await query.focus();
    await page.waitForTimeout(400);
    const metrics = await collectViewportOverflowMetrics(page, "palette-search-focus");
    expect(metrics.visualViewportScale ?? 1).toBeLessThanOrEqual(1.01);
    const fontPx = await query.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(fontPx).toBeGreaterThanOrEqual(16);
  });
});
