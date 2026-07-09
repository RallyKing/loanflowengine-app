import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";
import {
  attachLayoutShiftCollector,
  resetLayoutShiftCollector,
  readLayoutShiftScore,
} from "../../helpers/mobile/layout-shift";
import { expectPipelineHubVisible } from "../../helpers/mobile/pipelineHubReady";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexOk(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexOk() ? test.describe : test.describe.skip;

describeOrSkip("Scroll stability — cumulative layout shift (CLS)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("pipeline hub main scroll keeps CLS under budget", async ({ page }) => {
    await attachLayoutShiftCollector(page);
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expectPipelineHubVisible(page, { allowDegraded: true });
    const main = page.getByTestId("app-main-scroll");
    await page.waitForTimeout(400);
    await resetLayoutShiftCollector(page);

    await main.evaluate((el) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-dlc-cls-probe", "");
      probe.style.height = "2800px";
      probe.style.width = "1px";
      probe.style.flexShrink = "0";
      const inner = el.querySelector(":scope > div") ?? el;
      inner.appendChild(probe);
    });

    for (let i = 0; i < 28; i += 1) {
      await main.evaluate((el) => el.scrollBy({ top: 70, behavior: "auto" }));
      if (i % 5 === 0) await page.waitForTimeout(12);
    }

    const score = await readLayoutShiftScore(page);
    await page.evaluate(() => {
      document.querySelectorAll("[data-dlc-cls-probe]").forEach((n) => n.remove());
    });

    /* CLS is best-effort in automation (fonts, images). Fail only on obvious thrash. */
    expect(score).toBeLessThan(0.35);
  });
});
