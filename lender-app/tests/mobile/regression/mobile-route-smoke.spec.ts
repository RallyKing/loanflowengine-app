import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";
import {
  dismissMobileNavIfOpen,
  expectPipelineHubVisible,
  expectWorkspaceRouteVisible,
  waitPipelineHubReady,
  isPipelineHubDegraded,
} from "../../helpers/mobile/pipelineHubReady";

test.describe("Mobile regression — core routes render", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  const routes: { path: string; title: RegExp }[] = [
    { path: "/tasks", title: /task/i },
    { path: "/contacts", title: /contact/i },
    { path: "/lenders", title: /lender/i },
    { path: "/pipeline", title: /pipeline/i },
    { path: "/activity", title: /activity/i },
  ];

  for (const { path, title } of routes) {
    test(`mobile smoke: ${path}`, async ({ page }) => {
      await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
      await signInWorkspaceSession(page);
      await page.goto(path, {
        waitUntil: path === "/lenders" ? "load" : "domcontentloaded",
      });
      await dismissMobileNavIfOpen(page);
      if (path === "/pipeline") {
        await waitPipelineHubReady(page, { allowDegraded: true });
        if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
          await expect(page.getByTestId("app-main-scroll")).toBeVisible({
            timeout: 35_000,
          });
        } else {
          await expectPipelineHubVisible(page);
        }
      } else if (path === "/lenders") {
        await expectWorkspaceRouteVisible(page, {
          heading: /^Lenders$/i,
          toolbarLabel: "Lenders workspace toolbar",
          allowDegraded: true,
        });
      } else {
        await expectWorkspaceRouteVisible(page, {
          heading: title,
          allowDegraded: true,
        });
      }
      await expect(page.getByTestId("app-main-scroll")).toBeVisible();
    });
  }
});
