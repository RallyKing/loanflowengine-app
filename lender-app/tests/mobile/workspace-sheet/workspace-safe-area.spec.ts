import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { convexConfigured, openAnyPipelineFileWorkspace } from "./_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("workspace sheet — safe area padding", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("workspace scroll uses bottom padding token (safe-area aware)", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const ws = page.getByTestId("pipeline-workspace-scroll");
    const padBottom = await ws.evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(parseFloat(padBottom)).toBeGreaterThan(16);
  });
});
