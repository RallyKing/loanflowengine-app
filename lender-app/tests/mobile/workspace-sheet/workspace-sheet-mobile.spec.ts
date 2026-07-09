import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { convexConfigured, openAnyPipelineFileWorkspace } from "./_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("workspace sheet — mobile presence", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("pipeline workspace scroll is the delegated scroller on file route", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const main = page.getByTestId("app-main-scroll");
    const ws = page.getByTestId("pipeline-workspace-scroll");

    const mainScrollable = await main.evaluate(
      (el) => getComputedStyle(el).overflowY === "auto",
    );
    expect(mainScrollable, "<main> should not be the vertical scroller on file route").toBe(
      false,
    );

    const wsScrollable = await ws.evaluate(
      (el) =>
        getComputedStyle(el).overflowY === "auto" ||
        getComputedStyle(el).overflowY === "scroll",
    );
    expect(wsScrollable).toBe(true);

    const metrics = await ws.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(
      metrics.scrollHeight,
      "workspace should have scrollable depth once loaded",
    ).toBeGreaterThan(metrics.clientHeight + 24);
  });
});
