import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

/**
 * Visual baselines for mobile Chrome profile (`visual-mobile-pixel` project).
 * Update snapshots: `npx playwright test tests/visual/mobile-shell.spec.ts --project visual-mobile-pixel -u`
 */
test.describe("visual — mobile workspace shell", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!workspaceSessionReady(), "APP_AUTH_USERNAME + APP_AUTH_PASSWORD");
  });

  test("tasks after sign-in", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveScreenshot("mobile-tasks.png", {
      fullPage: true,
      maxDiffPixels: 120,
    });
  });

  test("pipeline hub after sign-in", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Loading pipeline…")).toHaveCount(0, { timeout: 45_000 });
    await expect(page).toHaveScreenshot("mobile-pipeline-hub.png", {
      fullPage: true,
      maxDiffPixels: 160,
    });
  });
});
