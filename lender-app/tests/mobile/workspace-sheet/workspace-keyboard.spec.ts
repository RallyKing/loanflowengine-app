import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { convexConfigured, openAnyPipelineFileWorkspace } from "./_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("workspace sheet — keyboard / focus", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("focusable control inside workspace scroll remains in scrollport", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const ws = page.getByTestId("pipeline-workspace-scroll");
    const focusable = ws
      .locator(
        'button, input, textarea, select, [contenteditable="true"], a[href], [tabindex]:not([tabindex="-1"])',
      )
      .first();
    await expect(focusable).toBeVisible({ timeout: 20_000 });
    await focusable.focus();

    const contained = await ws.evaluate((el) => {
      const active = document.activeElement;
      return !!(active && el.contains(active));
    });
    expect(
      contained,
      "active element after focusing a workspace control should live under workspace scroller",
    ).toBe(true);
  });
});
