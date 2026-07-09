import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { convexConfigured, openAnyPipelineFileWorkspace } from "./_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("workspace sheet — scroll stability", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("scroll delta moves pipeline-workspace-scroll, not body", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const ws = page.getByTestId("pipeline-workspace-scroll");
    const beforeDoc = await page.evaluate(() => document.documentElement.scrollTop);
    expect(beforeDoc).toBe(0);

    const before = await ws.evaluate((el) => el.scrollTop);
    await ws.evaluate((el) => {
      el.scrollBy({ top: 400, behavior: "auto" });
    });
    await page.waitForTimeout(150);
    const after = await ws.evaluate((el) => el.scrollTop);

    expect(after, "workspace scrollTop should advance").toBeGreaterThan(before + 20);

    const afterDoc = await page.evaluate(() => document.documentElement.scrollTop);
    expect(afterDoc, "document should remain locked").toBe(0);
  });
});
