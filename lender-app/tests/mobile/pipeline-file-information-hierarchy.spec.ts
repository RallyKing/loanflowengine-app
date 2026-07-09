import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import { assertNoHorizontalOverflow } from "../helpers/mobile/viewportOverflow";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../helpers/mobile/projects";
import { openAnyPipelineFileWorkspace } from "./workspace-sheet/_helpers";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

const MOBILE_VIEWPORTS = [
  { width: 320, height: 568, label: "320-portrait" },
  { width: 568, height: 320, label: "320-landscape" },
  { width: 360, height: 780, label: "360-portrait" },
  { width: 780, height: 360, label: "360-landscape" },
  { width: 375, height: 812, label: "375-portrait" },
  { width: 812, height: 375, label: "375-landscape" },
  { width: 390, height: 844, label: "390-portrait" },
  { width: 844, height: 390, label: "390-landscape" },
  { width: 414, height: 896, label: "414-portrait" },
  { width: 896, height: 414, label: "414-landscape" },
  { width: 430, height: 932, label: "430-portrait" },
  { width: 932, height: 430, label: "430-landscape" },
] as const;

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

async function openPipelineFileWorkspace(page: Page, testInfo: import("@playwright/test").TestInfo) {
  await openAnyPipelineFileWorkspace(page, testInfo);

  const workspaceScroll = page.getByTestId("pipeline-workspace-scroll");
  await expect(workspaceScroll).toBeVisible({ timeout: 25_000 });

  const drawerScroll = page.getByTestId("pipeline-drawer-scroll");
  await expect(drawerScroll).toBeVisible({ timeout: 20_000 });

  return workspaceScroll;
}

/** Primary title must be visible inside the viewport with non-empty text. */
async function assertPrimaryTitleReadable(page: Page, locator: Locator, label: string) {
  await expect(locator, `${label}: visible`).toBeVisible({ timeout: 15_000 });
  const text = (await locator.innerText()).trim();
  expect(text.length, `${label}: non-empty text`).toBeGreaterThan(0);

  const vw = page.viewportSize()?.width ?? 390;
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box`).not.toBeNull();
  expect(box!.width, `${label}: width`).toBeGreaterThan(8);
  expect(box!.x, `${label}: left edge in viewport`).toBeGreaterThanOrEqual(-2);
  expect(box!.x + box!.width, `${label}: right edge in viewport`).toBeLessThanOrEqual(
    vw + 2,
  );
}

async function assertDrawerNoHorizontalOverflow(page: Page) {
  const workspaceScroll = page.getByTestId("pipeline-workspace-scroll");
  const wsMetrics = await workspaceScroll.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  assertNoHorizontalOverflow(
    "pipeline-workspace-scroll",
    wsMetrics.scrollWidth,
    wsMetrics.clientWidth,
  );

  const drawer = page.getByTestId("pipeline-drawer-scroll");
  const drawerMetrics = await drawer.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  assertNoHorizontalOverflow(
    "pipeline-drawer-scroll",
    drawerMetrics.scrollWidth,
    drawerMetrics.clientWidth,
  );

  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assertNoHorizontalOverflow("documentElement", doc.scrollWidth, doc.clientWidth);
}

describeOrSkip("Phase 24.5.3 — pipeline file workspace information hierarchy (mobile)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
    await signInWorkspaceSession(page);
  });

  for (const vp of MOBILE_VIEWPORTS) {
    test(`titles readable @ ${vp.label}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openPipelineFileWorkspace(page, testInfo);

      const fileTitle = page.getByTestId("pipeline-global-banner-file-name");
      await expect(fileTitle).toBeVisible();
      await assertPrimaryTitleReadable(page, fileTitle, "file name");

      const triageTask = page.getByTestId("file-workspace-triage-task-title").first();
      if (await triageTask.isVisible().catch(() => false)) {
        const triageBox = await triageTask.boundingBox();
        const vw = page.viewportSize()?.width ?? vp.width;
        expect(triageBox).not.toBeNull();
        expect(triageBox!.x + triageBox!.width).toBeLessThanOrEqual(vw + 2);
      }

      const expand = page.getByTestId("pipeline-workspace-header-expand-toggle");
      if (await expand.isVisible().catch(() => false)) {
        await expand.click();
        await page.waitForTimeout(300);
      }

      const entityLabel = page.getByTestId("workspace-orientation-entity-label");
      if ((await entityLabel.count()) > 0) {
        await assertPrimaryTitleReadable(page, entityLabel.first(), "entity label");
      }

      const crumbs = page.getByTestId("workspace-hierarchy-crumb");
      const crumbCount = await crumbs.count();
      for (let i = 0; i < crumbCount; i += 1) {
        await assertPrimaryTitleReadable(
          page,
          crumbs.nth(i),
          `hierarchy crumb ${i + 1}`,
        );
      }

      const tasksBlock = page.locator("#pipeline-block-tasks");
      if (await tasksBlock.isVisible().catch(() => false)) {
        const tasksToggle = tasksBlock.getByRole("button").first();
        const expanded = await tasksToggle.getAttribute("aria-expanded");
        if (expanded === "false") {
          await tasksToggle.click();
          await page.waitForTimeout(300);
        }
      }

      const taskTitle = page.getByTestId("file-task-row-title").first();
      if (await taskTitle.isVisible().catch(() => false)) {
        await assertPrimaryTitleReadable(page, taskTitle, "task title");
        const row = page.getByTestId("file-task-triage-row").first();
        const rowBox = await row.boundingBox();
        const titleBox = await taskTitle.boundingBox();
        expect(rowBox).not.toBeNull();
        expect(titleBox).not.toBeNull();
        expect(titleBox!.y).toBeGreaterThanOrEqual((rowBox?.y ?? 0) - 2);
      }

      await assertDrawerNoHorizontalOverflow(page);

      testInfo.annotations.push({
        type: "viewport",
        description: `${vp.label} (${vp.width}x${vp.height})`,
      });
    });
  }
});
