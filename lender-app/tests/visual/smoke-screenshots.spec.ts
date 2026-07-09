import { test, expect } from "@playwright/test";

test.describe("visual — login shell", () => {
  test("sign-in", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveScreenshot("sign-in.png", {
      fullPage: true,
      maxDiffPixels: 200,
    });
  });
});
