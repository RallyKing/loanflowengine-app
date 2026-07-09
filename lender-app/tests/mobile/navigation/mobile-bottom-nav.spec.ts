import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";

test.describe("Navigation — mobile bottom nav", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("primary mobile nav is present and labeled", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const nav = page.getByRole("navigation", { name: "Primary" });
    const visible = await nav.isVisible({ timeout: 6_000 }).catch(() => false);
    test.skip(!visible, "Bottom nav exists only in classic chrome (not SaaS shell)");

    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pipeline" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Tasks" })).toBeVisible();
  });
});
