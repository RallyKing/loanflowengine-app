import { test, expect } from "@playwright/test";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import { recoverWorkspaceErrorBoundary } from "../helpers/mobile/pipelineHubReady";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../helpers/mobile/projects";
import { openAnyPipelineFileWorkspace } from "../mobile/workspace-sheet/_helpers";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("Pipeline file project association header", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_E2E_USERS_ENABLED + E2E_PASS_* or APP_AUTH_USERNAME + APP_AUTH_PASSWORD",
    );
    skipPlaywrightWebKitOnWindows(testInfo);
    await signInWorkspaceSession(page);
    await recoverWorkspaceErrorBoundary(page);
  });

  test("project name sits left of stage pill; menu opens @ desktop", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileTouchProject(testInfo.project.name), "desktop coverage");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const cluster = page.getByTestId("deal-command-center-project-stage");
    await expect(cluster).toBeVisible({ timeout: 30_000 });
    const stage = cluster.getByTestId("pipeline-global-banner-stage");
    await expect(stage).toBeVisible();

    const trigger = page.getByTestId("workspace-project-association-trigger");
    const empty = page.getByTestId("workspace-project-association-empty");
    const hasTrigger = await trigger.isVisible().catch(() => false);
    const hasEmpty = await empty.isVisible().catch(() => false);
    expect(hasTrigger || hasEmpty).toBeTruthy();

    if (hasTrigger) {
      const boxTrigger = await trigger.boundingBox();
      const boxStage = await stage.boundingBox();
      expect(boxTrigger).toBeTruthy();
      expect(boxStage).toBeTruthy();
      expect(boxTrigger!.x + boxTrigger!.width).toBeLessThanOrEqual(
        boxStage!.x + 4,
      );

      await trigger.click();
      const menu = page.getByTestId("workspace-project-association-menu");
      await expect(menu).toBeVisible({ timeout: 5_000 });
      await expect(menu.getByText("Open project")).toBeVisible();
      await expect(menu.getByText("Files in this project")).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox).toBeTruthy();
      expect(menuBox!.width).toBeGreaterThan(160);
    }
  });

  test("project association usable @ mobile", async ({ page }, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name), "mobile coverage");
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const cluster = page.getByTestId("deal-command-center-project-stage");
    await expect(cluster).toBeVisible({ timeout: 30_000 });

    const trigger = page.getByTestId("workspace-project-association-trigger");
    if (await trigger.isVisible().catch(() => false)) {
      const box = await trigger.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(40);
      await trigger.click();
      await expect(
        page.getByTestId("workspace-project-association-menu"),
      ).toBeVisible({ timeout: 5_000 });
    } else {
      await expect(
        page.getByTestId("workspace-project-association-empty"),
      ).toBeVisible();
    }
  });
});
