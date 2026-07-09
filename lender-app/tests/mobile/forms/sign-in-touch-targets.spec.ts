import { test, expect } from "@playwright/test";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";

test.describe("Forms — sign-in touch targets", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("sign-in username field has usable box size", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    const userField = page.getByRole("textbox", { name: /username/i });
    await expect(userField).toBeVisible({ timeout: 15_000 });
    const box = await userField.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });
});
