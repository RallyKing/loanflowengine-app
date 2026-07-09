import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";
import { expectPipelineHubVisible } from "../../helpers/mobile/pipelineHubReady";

/**
 * Optional: set PERF_SCROLL_MS (e.g. 8000) to bound scroll-handler wall time.
 */
test.describe("Mobile performance — scroll burst wall time", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!process.env.PERF_SCROLL_MS, "Set PERF_SCROLL_MS to enable");
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("main scroll burst completes under budget", async ({ page }) => {
    const budget = Number(process.env.PERF_SCROLL_MS);
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expectPipelineHubVisible(page);
    const main = page.getByTestId("app-main-scroll");
    await main.evaluate((el) => {
      const d = document.createElement("div");
      d.style.height = "2000px";
      d.style.width = "1px";
      (el.querySelector(":scope > div") ?? el).appendChild(d);
    });
    const t0 = Date.now();
    for (let i = 0; i < 40; i += 1) {
      await main.evaluate((el) => el.scrollBy({ top: 40, behavior: "auto" }));
    }
    expect(Date.now() - t0).toBeLessThanOrEqual(budget);
  });
});
