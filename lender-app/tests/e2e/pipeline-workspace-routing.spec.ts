import { test, expect, type Page } from "@playwright/test";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import {
  recoverWorkspaceErrorBoundary,
} from "../helpers/mobile/pipelineHubReady";
import { openAnyPipelineFileWorkspace } from "../mobile/workspace-sheet/_helpers";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

const FILE_TAB_LABELS = [
  "Deal Info",
  "Financials",
  "Portals & Progress",
  "Documents",
] as const;

async function openHeaderOverflowMenu(page: Page) {
  const overflow = page.getByTestId("pipeline-workspace-header-overflow");
  await expect(overflow).toBeVisible({ timeout: 15_000 });
  await overflow.click();
  const menuPanel = page.locator("[data-dropdown-menu-panel]").last();
  await expect(menuPanel).toBeVisible({ timeout: 10_000 });
  return menuPanel;
}

async function assertAdminOverflowItemsHidden(menuPanel: ReturnType<Page["locator"]>) {
  await expect(
    menuPanel.getByRole("menuitem", { name: "Workspace utilities" }),
  ).toBeVisible();
  await expect(
    menuPanel.getByRole("menuitem", { name: /Manage sharing/i }),
  ).toHaveCount(0);
  await expect(
    menuPanel.getByRole("menuitem", { name: /Archive file|Restore from archive/i }),
  ).toHaveCount(0);
  await expect(
    menuPanel.getByRole("menuitem", { name: /Delete file/i }),
  ).toHaveCount(0);
}

describeOrSkip("Pipeline file workspace — Deal Command Center tabs (Phase 4)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_E2E_USERS_ENABLED + E2E_PASS_* or APP_AUTH_USERNAME + APP_AUTH_PASSWORD",
    );
    await signInWorkspaceSession(page);
    await recoverWorkspaceErrorBoundary(page);
    await openAnyPipelineFileWorkspace(page, testInfo);
    await expect(
      page.getByTestId("pipeline-file-workspace-tab-shell"),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("tab shell exposes four command-center tabs", async ({ page }) => {
    const nav = page.getByTestId("pipeline-file-workspace-tab-nav");
    await expect(nav.getByRole("tab")).toHaveCount(4);
    for (const label of FILE_TAB_LABELS) {
      await expect(nav.getByRole("tab", { name: label, exact: true })).toBeVisible();
    }
  });

  test("Deal Info tab shows unified single-column sections", async ({ page }) => {
    await page.getByTestId("pipeline-file-tab-dealInfo").click();
    await expect(page.getByTestId("pipeline-file-tabpanel-dealInfo")).toBeVisible();
    await expect(page.getByTestId("pipeline-deal-info-command-center-tab")).toBeVisible();
    await expect(page.getByTestId("pipeline-deal-info-unified-sections")).toBeVisible();
    await expect(page.getByTestId("pipeline-deal-info-overview-sections")).toBeVisible();
    await expect(page.getByTestId("pipeline-file-details-telemetry")).toBeVisible();
    await expect(page.getByTestId("pipeline-deal-info-fees-sections")).toBeVisible();
  });

  test("Portals & Progress tab routes to underwriting ledger", async ({ page }) => {
    await page.getByTestId("pipeline-file-tab-portalsProgress").click();
    await expect(
      page.getByTestId("pipeline-file-tabpanel-portalsProgress"),
    ).toBeVisible();
    await expect(page.getByTestId("pipeline-portals-progress-tab")).toBeVisible();
    await expect(page.getByTestId("pipeline-portals-unified-sections")).toBeVisible();
    await expect(page.getByTestId("pipeline-portals-scenarios-section")).toBeVisible();
    await expect(page.getByTestId("pipeline-underwriting-ledger-tab")).toBeVisible();
    await expect(page.getByTestId("pipeline-underwriting-action-queue")).toBeVisible();
  });

  test("Settings via overflow smoke — layout, archive, danger zone", async ({ page }) => {
    const overflow = page.getByTestId("pipeline-workspace-header-overflow");
    await overflow.click();
    await page.getByRole("menuitem", { name: /File settings/i }).click();
    await expect(page.getByTestId("pipeline-settings-tab")).toBeVisible();
    await expect(page.getByTestId("pipeline-settings-history")).toHaveCount(0);
    await expect(page.getByTestId("pipeline-settings-layout")).toBeVisible();
    await expect(
      page.getByLabel("Default pipeline drawer section expand mode"),
    ).toBeVisible();
    await expect(page.getByTestId("pipeline-settings-archive")).toBeVisible();
    await expect(page.getByTestId("pipeline-settings-archive-action")).toBeVisible();
    await expect(page.getByTestId("pipeline-settings-danger-zone")).toBeVisible();
    await expect(page.getByTestId("pipeline-settings-delete-action")).toBeVisible();
  });

  test("circuit breaker — mobile header overflow hides admin items", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const menuPanel = await openHeaderOverflowMenu(page);
    await assertAdminOverflowItemsHidden(menuPanel);
    await page.keyboard.press("Escape");
  });

  test("circuit breaker — desktop header overflow hides admin items", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const menuPanel = await openHeaderOverflowMenu(page);
    await assertAdminOverflowItemsHidden(menuPanel);
    await page.keyboard.press("Escape");
  });
});
