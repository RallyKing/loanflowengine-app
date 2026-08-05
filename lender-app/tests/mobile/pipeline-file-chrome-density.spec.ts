import { test, expect } from "@playwright/test";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../helpers/mobile/projects";
import { openAnyPipelineFileWorkspace } from "./workspace-sheet/_helpers";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

/**
 * iPhone file chrome density — work surface (workspace scrollport) should dominate
 * the viewport once snap header + pinned tabs/favorites are condensed.
 */
test.describe("Pipeline file chrome density (iPhone)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!convexConfigured(), "NEXT_PUBLIC_CONVEX_URL required");
    test.skip(!isMobileTouchProject(testInfo.project.name), "mobile only");
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_E2E_USERS_ENABLED + E2E_PASS_* or APP_AUTH_USERNAME + APP_AUTH_PASSWORD",
    );
    skipPlaywrightWebKitOnWindows(testInfo);
    await signInWorkspaceSession(page);
  });

  test("collapsed chrome leaves ≥55% viewport for work @ 390x844", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnyPipelineFileWorkspace(page, testInfo);

    const header = page.getByTestId("pipeline-file-workspace-header");
    const scroll = page.getByTestId("pipeline-workspace-scroll");
    const tabs = page.getByTestId("pipeline-file-workspace-tab-nav");
    const favorites = page.getByTestId("pipeline-file-favorites-bar");
    const metrics = page.getByTestId("deal-command-center-metrics");

    await expect(header).toBeVisible({ timeout: 25_000 });
    await expect(scroll).toBeVisible({ timeout: 25_000 });

    // Metrics stay behind Details by default on phone.
    await expect(metrics).toBeHidden();

    const expand = page.getByTestId("pipeline-workspace-header-expand-toggle");
    await expect(expand).toHaveAttribute("aria-expanded", "false");

    const ratio = await page.evaluate(() => {
      const vh = window.innerHeight;
      const scrollEl = document.querySelector(
        '[data-testid="pipeline-workspace-scroll"]',
      ) as HTMLElement | null;
      const headerEl = document.querySelector(
        '[data-testid="pipeline-file-workspace-header"]',
      ) as HTMLElement | null;
      const pinned = document.querySelector(
        '[data-testid="pipeline-file-workspace-pinned-lead"]',
      ) as HTMLElement | null;
      const sheet = document.querySelector(
        "[data-pipeline-workspace-sheet]",
      ) as HTMLElement | null;

      const workH = scrollEl?.clientHeight ?? 0;
      const headerH = headerEl?.getBoundingClientRect().height ?? 0;
      const pinnedH = pinned?.getBoundingClientRect().height ?? 0;
      const sheetTop = sheet?.getBoundingClientRect().top ?? 0;

      return {
        vh,
        workH,
        headerH,
        pinnedH,
        sheetTop,
        workRatio: vh > 0 ? workH / vh : 0,
        chromeAboveWork: headerH + pinnedH,
      };
    });

    testInfo.annotations.push({
      type: "chrome-density",
      description: JSON.stringify(ratio),
    });

    // Pragmatic floor: scrollport ≥55% of viewport after bottom-nav reservation.
    // Target product goal is ~75% usable; 55% is the automated regression gate
    // given bottom nav + safe-area always consume ~15–20%.
    expect(
      ratio.workRatio,
      `work/viewport=${ratio.workRatio.toFixed(3)} work=${ratio.workH} vh=${ratio.vh} header=${ratio.headerH} pinned=${ratio.pinnedH}`,
    ).toBeGreaterThanOrEqual(0.55);

    // Absolute chrome (header + tabs + favorites) should stay under ~180px on
    // a typical phone once metrics are collapsed.
    expect(
      ratio.chromeAboveWork,
      `chromeAboveWork=${ratio.chromeAboveWork}`,
    ).toBeLessThanOrEqual(200);

    await expect(tabs).toBeVisible();
    await expect(favorites).toBeVisible();

    // Stage / project remain one-tap without expanding Details.
    await expect(page.getByTestId("deal-command-center-project-stage")).toBeVisible();
    await expect(page.getByTestId("pipeline-global-banner-stage")).toBeVisible();

    // Expand Details → metrics appear.
    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    await expect(metrics).toBeVisible();
  });
});
