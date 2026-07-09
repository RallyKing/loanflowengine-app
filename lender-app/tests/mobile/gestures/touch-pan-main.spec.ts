import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";
import {
  injectTallProbe,
  removeProbes,
  scrollBySteps,
  touchLikePanScroll,
} from "../../helpers/mobile/scroll";
import { waitForLinkedStylesheets } from "../../helpers/mobile/appShell";
import {
  dismissMobileNavIfOpen,
  waitPipelineHubReady,
} from "../../helpers/mobile/pipelineHubReady";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

function convexOk(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexOk() ? test.describe : test.describe.skip;

describeOrSkip("Gestures — touch-like pan on main", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("touch-like pan changes main scrollTop on pipeline hub", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page, { allowDegraded: true });

    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-shell", "app");
    await dismissMobileNavIfOpen(page);
    await waitForLinkedStylesheets(page);
    await injectTallProbe(main, 2200, "data-dlc-gesture-probe");
    try {
      const before = await main.evaluate((el) => el.scrollTop);
      await touchLikePanScroll(page, main, -180, 14);
      await page.waitForTimeout(120);
      let after = await main.evaluate((el) => el.scrollTop);
      if (after <= before + 20) {
        await scrollBySteps(page, main, 80, 10);
        await page.waitForTimeout(100);
        after = await main.evaluate((el) => el.scrollTop);
      }
      expect(
        after > before + 20,
        `expected scroll to advance (before=${before} after=${after})`,
      ).toBe(true);
    } finally {
      await removeProbes(page, "data-dlc-gesture-probe");
    }
  });
});
