import { test, expect, type Page } from "@playwright/test";
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

const VIEWPORTS = [
  { width: 390, height: 844, label: "mobile-390" },
  { width: 768, height: 1024, label: "tablet-768" },
  { width: 1280, height: 800, label: "desktop-1280" },
] as const;

async function openAndExpandHeaderDetails(page: Page, testInfo: import("@playwright/test").TestInfo) {
  await openAnyPipelineFileWorkspace(page, testInfo);
  await expect(page.getByTestId("pipeline-file-workspace-header")).toBeVisible({
    timeout: 30_000,
  });

  const expand = page.getByTestId("pipeline-workspace-header-expand-toggle");
  await expect(expand).toBeVisible({ timeout: 15_000 });
  if ((await expand.getAttribute("aria-expanded")) !== "true") {
    await expand.click();
  }
  await expect(expand).toHaveAttribute("aria-expanded", "true");

  const panel = page.getByTestId("pipeline-workspace-header-details");
  await expect(panel).toBeVisible({ timeout: 10_000 });
  return panel;
}

describeOrSkip("Pipeline file header disclosure width", () => {
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

  for (const vp of VIEWPORTS) {
    test(`expanded details use full header width @ ${vp.label}`, async ({
      page,
    }, testInfo) => {
      // Desktop Chromium covers tablet/desktop; mobile projects cover 390.
      if (vp.width < 768) {
        test.skip(!isMobileTouchProject(testInfo.project.name), "mobile viewport");
      } else {
        test.skip(isMobileTouchProject(testInfo.project.name), "desktop/tablet viewport");
      }

      await page.setViewportSize({ width: vp.width, height: vp.height });
      const panel = await openAndExpandHeaderDetails(page, testInfo);
      const header = page.getByTestId("pipeline-file-workspace-header");

      const metrics = await page.evaluate(() => {
        const headerEl = document.querySelector(
          '[data-testid="pipeline-file-workspace-header"]',
        ) as HTMLElement | null;
        const panelEl = document.querySelector(
          '[data-testid="pipeline-workspace-header-details"]',
        ) as HTMLElement | null;
        const signpost = document.querySelector(
          '[data-testid="linked-clients-primary-project-signpost"]',
        ) as HTMLElement | null;
        const project = document.querySelector(
          '[data-testid="change-file-project"]',
        ) as HTMLElement | null;
        if (!headerEl || !panelEl) {
          return null;
        }
        const hb = headerEl.getBoundingClientRect();
        const pb = panelEl.getBoundingClientRect();
        const sb = signpost?.getBoundingClientRect() ?? null;
        const prb = project?.getBoundingClientRect() ?? null;
        return {
          headerWidth: hb.width,
          panelWidth: pb.width,
          panelLeft: pb.left,
          headerLeft: hb.left,
          signpostWidth: sb?.width ?? null,
          projectWidth: prb?.width ?? null,
        };
      });

      expect(metrics, "header/panel metrics").not.toBeNull();
      expect(metrics!.panelWidth, "panel not collapsed").toBeGreaterThan(
        metrics!.headerWidth * 0.85,
      );
      expect(
        Math.abs(metrics!.panelLeft - metrics!.headerLeft),
        "panel left-aligned with header",
      ).toBeLessThan(8);

      if (metrics!.signpostWidth != null) {
        expect(metrics!.signpostWidth, "loan-clients signpost readable").toBeGreaterThan(
          Math.min(220, metrics!.headerWidth * 0.55),
        );
      }
      if (metrics!.projectWidth != null) {
        expect(metrics!.projectWidth, "project control readable").toBeGreaterThan(
          Math.min(200, metrics!.headerWidth * 0.5),
        );
      }

      await expect(header).toBeVisible();
      await expect(panel).toBeVisible();
    });
  }
});
