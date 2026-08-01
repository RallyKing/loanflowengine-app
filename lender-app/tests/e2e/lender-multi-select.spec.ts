import { test, expect } from "@playwright/test";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import { recoverWorkspaceErrorBoundary } from "../helpers/mobile/pipelineHubReady";
import { openAnyPipelineFileWorkspace } from "../mobile/workspace-sheet/_helpers";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

async function openDealInfoLendersSearch(page: import("@playwright/test").Page) {
  await page.getByTestId("pipeline-file-tab-dealInfo").click();
  await expect(
    page.getByTestId("pipeline-deal-info-command-center-tab"),
  ).toBeVisible({ timeout: 30_000 });

  const lendersHeading = page.getByRole("button", { name: /^Lenders/i }).first();
  if (await lendersHeading.isVisible().catch(() => false)) {
    const expanded = await lendersHeading.getAttribute("aria-expanded");
    if (expanded === "false") {
      await lendersHeading.click();
    }
  }

  const search = page.getByTestId("file-lenders-search");
  await search.scrollIntoViewIfNeeded();
  await expect(search).toBeVisible({ timeout: 30_000 });
  return search;
}

describeOrSkip("File lenders — lender board", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ mode: "serial", timeout: 300_000 });

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

  test("search row exposes Add to File only", async ({ page }) => {
    const search = await openDealInfoLendersSearch(page);
    await search.fill("a");

    const results = page.getByTestId("lender-search-results");
    await expect(results).toBeVisible({ timeout: 30_000 });

    const firstRow = results.locator("li").first();
    const hasRow = await firstRow.isVisible().catch(() => false);
    test.skip(!hasRow, "No lender search hits for query 'a'");

    await expect(firstRow.getByTestId(/lender-add-to-file-/)).toBeVisible();
    await expect(results.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(firstRow.getByText("Set Primary")).toHaveCount(0);
  });

  test("Add to File lands lender in Considering and board role can promote", async ({
    page,
  }) => {
    const search = await openDealInfoLendersSearch(page);
    await search.fill("a");

    const results = page.getByTestId("lender-search-results");
    await expect(results).toBeVisible({ timeout: 30_000 });

    const firstRow = results.locator("li").first();
    test.skip(!(await firstRow.isVisible().catch(() => false)), "No hits");

    await firstRow.getByTestId(/lender-add-to-file-/).click();
    await expect(results).toBeVisible();

    await expect
      .poll(
        async () =>
          page
            .getByTestId("lender-considering-list")
            .locator("li")
            .count()
            .catch(() => 0),
        { timeout: 45_000 },
      )
      .toBeGreaterThanOrEqual(1);

    const roleSelect = page
      .getByTestId("lender-considering-list")
      .locator('[data-testid^="lender-board-role-"]')
      .first();
    await roleSelect.selectOption("primary");

    await expect
      .poll(
        async () =>
          page.getByTestId("lender-primary-card").isVisible().catch(() => false),
        { timeout: 45_000 },
      )
      .toBe(true);
  });
});
