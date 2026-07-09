import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";
import { waitForAppShellBodyScrollLock } from "../../helpers/mobile/appShell";

test.describe("Layout — AppChrome main scroll owner", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("body is overflow locked; app main is the vertical scrollport", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/tasks", { waitUntil: "load" });
    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible({ timeout: 30_000 });
    await waitForAppShellBodyScrollLock(page);

    const { bodyOY, mainOY } = await page.evaluate(() => ({
      bodyOY: getComputedStyle(document.body).overflowY,
      mainOY: getComputedStyle(
        document.querySelector("main[data-testid='app-main-scroll']")!,
      ).overflowY,
    }));

    expect(
      ["hidden", "clip"].includes(bodyOY),
      `body overflow-y was "${bodyOY}" — expected hidden|clip for app shell (restart next start after build if stylesheet 404)`,
    ).toBe(true);
    expect(mainOY === "auto" || mainOY === "scroll").toBe(true);
  });
});
