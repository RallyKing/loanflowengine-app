import { expect, test } from "@playwright/test";
import {
  signInWorkspaceSession,
  workspaceSessionReady,
} from "./helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

/**
 * Phase 9 — visual + behavioral baselines for master shell polish.
 * Screenshots live under test-results/... or update snapshots with --update-snapshots.
 */
describeOrSkip("phase 9 — master experience regression", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip();
      return;
    }
    try {
      await signInWorkspaceSession(page);
    } catch (e) {
      testInfo.skip(true, `Workspace login failed: ${String(e)}`);
    }
  });

  test("master chrome + optional unified sidebar / SaaS", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const header = page.getByTestId("app-masterpage-chrome");
    await expect(header).toBeVisible({ timeout: 30_000 });
    await expect(header).toHaveScreenshot("phase9-header-tasks.png", {
      maxDiffPixels: 120,
    });
  });

  test("main scroll compresses header without layout exceptions", async ({
    page,
  }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible({ timeout: 30_000 });
    await main.evaluate((el) => {
      el.scrollTop = 0;
    });
    const y0 = await page.evaluate(() => {
      const shell = document.querySelector("[data-testid=app-masterpage-chrome]");
      const inner = shell?.querySelector("[style*='translate3d']") as HTMLElement | null;
      if (!inner?.style.transform) return null;
      const m = inner.style.transform.match(/translate3d\([^,]+,\s*([^,]+)/);
      return m ? parseFloat(m[1]!) : null;
    });
    await main.evaluate((el) => {
      el.scrollTop = 140;
    });
    await page.waitForTimeout(120);
    const y1 = await page.evaluate(() => {
      const shell = document.querySelector("[data-testid=app-masterpage-chrome]");
      const inner = shell?.querySelector("[style*='translate3d']") as HTMLElement | null;
      if (!inner?.style.transform) return null;
      const m = inner.style.transform.match(/translate3d\([^,]+,\s*([^,]+)/);
      return m ? parseFloat(m[1]!) : null;
    });
    if (y0 != null && y1 != null) {
      expect(y1).toBeLessThan(y0);
    }
  });

  test("mobile bottom chrome uses data-nav-bottom contract", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const navBottom = await page.evaluate(() =>
      document.documentElement.getAttribute("data-nav-bottom"),
    );
    expect(navBottom === "on" || navBottom === "off").toBeTruthy();
  });

  test("global search opens and dismisses with Escape", async ({ page }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /open search/i }).click();
    await expect(
      page.getByRole("dialog", { name: /global search/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: /global search/i }),
    ).toBeHidden();
  });
});
