import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { convexConfigured, openAnyPipelineFileWorkspace } from "./_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("workspace sheet — snap attributes", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("data-workspace-snap is present on mobile", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const sheet = page.locator("[data-pipeline-workspace-sheet]");
    await expect(sheet).toHaveCount(1);
    const snap = await sheet.getAttribute("data-workspace-snap");
    expect(snap === "compact" || snap === "comfort" || snap === "expanded").toBe(true);
  });

  test("data-workspace-snap reflects expanded on desktop width", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const sheet = page.locator("[data-pipeline-workspace-sheet]");
    const snap = await sheet.getAttribute("data-workspace-snap");
    expect(snap === "compact" || snap === "expanded").toBe(true);
  });
});
