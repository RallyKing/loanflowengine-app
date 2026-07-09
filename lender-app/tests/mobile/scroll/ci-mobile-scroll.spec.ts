import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileCoreProject } from "../../helpers/mobile/projects";
import {
  dismissMobileNavOverlayIfOpen,
  waitForLinkedStylesheets,
} from "../../helpers/mobile/appShell";
import {
  injectTallProbe,
  removeProbes,
  scrollMainBy,
} from "../../helpers/mobile/scroll";

/**
 * Mandatory mobile CI gate: core pair (Pixel 7 + iPhone 14 Pro profiles).
 * Full device matrix: `npm run test:mobile:matrix`.
 */
test.describe("Mobile scroll contract — pipeline hub", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileCoreProject(testInfo.project.name), "Mobile Chrome + Mobile Safari core projects");
    test.skip(!workspaceSessionReady(), "APP_AUTH_USERNAME + APP_AUTH_PASSWORD required");
  });

  test("app main scrollport fits viewport and can scroll", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "load" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "load" });
    if (page.url().includes("/sign-in")) {
      await signInWorkspaceSession(page);
      await page.goto("/pipeline", { waitUntil: "load" });
    }
    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-shell", "app");
    await waitForLinkedStylesheets(page);
    await dismissMobileNavOverlayIfOpen(page);
    /** Tall block inside `main > div` (see `injectTallProbe`) — same strategy as `touch-pan-main.spec`. */
    await injectTallProbe(main, 2400, "data-ci-scroll-probe");
    try {
      await expect
        .poll(() => main.evaluate((m) => m.scrollHeight - m.clientHeight), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0);

      const before = await main.evaluate((el) => el.scrollTop);
      await scrollMainBy(main, 380, 10);
      await expect
        .poll(() => main.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(before + 20);

      const touchAction = await main.evaluate((el) => getComputedStyle(el).touchAction);
      expect(touchAction, "main uses vertical touch pan for stable mobile scroll").toBe(
        "pan-y",
      );
      const webkitMomentum = await main.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("-webkit-overflow-scrolling"),
      );
      /* Mobile Safari reports `touch`; Chromium-based mobile often omits the property. */
      expect(
        webkitMomentum === "touch" || webkitMomentum === "",
        `-webkit-overflow-scrolling: expected touch or unset, got "${webkitMomentum}"`,
      ).toBe(true);
    } finally {
      await removeProbes(page, "data-ci-scroll-probe");
    }
  });
});
