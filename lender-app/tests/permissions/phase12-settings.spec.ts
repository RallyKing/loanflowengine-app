import { test, expect } from "@playwright/test";
import { signInWorkspaceSession, workspaceSessionReady } from "../helpers/workspace-auth";

test.describe("Phase 12 permissions UI", () => {
  test.skip(
    !workspaceSessionReady(),
    "No workspace login credentials configured for Playwright.",
  );

  test("settings exposes team management panel", async ({ page }) => {
    test.setTimeout(120_000);
    await signInWorkspaceSession(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.location.hash = "teamManagement";
    });
    await page.getByTestId("team-management-panel").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("team-management-panel")).toBeVisible({
      timeout: 90_000,
    });
  });
});
