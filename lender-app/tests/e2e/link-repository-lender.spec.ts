import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import { recoverWorkspaceErrorBoundary } from "../helpers/mobile/pipelineHubReady";
import { openAnyPipelineFileWorkspace } from "../mobile/workspace-sheet/_helpers";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("Unified link repository — lender tab", () => {
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
    await page.getByTestId("pipeline-file-tab-documents").click();
    await expect(page.getByTestId("document-vault-command-bar")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("command bar wraps without horizontal overlap at 1024px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const bar = page.getByTestId("document-vault-command-bar");
    await expect(bar).toBeVisible();

    const search = page.getByTestId("document-vault-search");
    const linkRepo = page.getByTestId("document-vault-manage-portal-links");
    await expect(search).toBeVisible();
    if (await linkRepo.isVisible().catch(() => false)) {
      const searchBox = await search.boundingBox();
      const repoBox = await linkRepo.boundingBox();
      if (searchBox && repoBox) {
        const overlap =
          searchBox.x < repoBox.x + repoBox.width &&
          repoBox.x < searchBox.x + searchBox.width &&
          searchBox.y < repoBox.y + repoBox.height &&
          repoBox.y < searchBox.y + searchBox.height;
        expect(overlap, "Search and Link Repository should not overlap").toBe(
          false,
        );
      }
    }
  });

  test("lender link appears in repository and revokes access", async ({
    page,
    context,
  }) => {
    const deliverBtn = page.getByTestId("document-vault-deliver-to-lender");
    test.skip(
      !(await deliverBtn.isVisible().catch(() => false)),
      "Deliver to Lender not available",
    );

    await deliverBtn.click();
    await page.getByRole("combobox").first().selectOption({ index: 1 }).catch(() => {});
    const taskCheckbox = page.locator('input[type="checkbox"]').first();
    if (await taskCheckbox.isVisible().catch(() => false)) {
      await taskCheckbox.check();
    }
    await page.getByRole("button", { name: /Create Link/i }).click();

    const urlInput = page.locator('input[readonly]').first();
    const deliveryUrl = await urlInput.inputValue().catch(() => "");
    test.skip(
      !deliveryUrl.includes("http") && !deliveryUrl.includes("/"),
      "No lender URL generated",
    );

    await page.getByTestId("document-vault-manage-portal-links").click();
    await page.getByTestId("portal-link-tab-lender").click();
    await expect(page.getByTestId("portal-link-repository")).toBeVisible();

    const activeRow = page.locator('[data-testid^="portal-link-row-"]').first();
    await expect(activeRow).toContainText(/active/i);

    const incognito = await context.browser()?.newContext();
    if (!incognito) return;
    const guest = await incognito.newPage();
    await guest.goto(deliveryUrl);
    await expect(
      guest.getByText(/Secure package|Lender Data Room/i),
    ).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId(/^portal-link-kill-/).first().click();
    await guest.reload();
    await expect(guest.getByText(/Link Revoked/i)).toBeVisible({
      timeout: 15_000,
    });
    await incognito.close();
  });

  test("reactivated lender link restores data room access", async ({
    page,
    context,
  }) => {
    const deliverBtn = page.getByTestId("document-vault-deliver-to-lender");
    test.skip(
      !(await deliverBtn.isVisible().catch(() => false)),
      "Deliver to Lender not available",
    );

    await deliverBtn.click();
    await page.getByRole("combobox").first().selectOption({ index: 1 }).catch(() => {});
    const taskCheckbox = page.locator('input[type="checkbox"]').first();
    if (await taskCheckbox.isVisible().catch(() => false)) {
      await taskCheckbox.check();
    }
    await page.getByRole("button", { name: /Create Link/i }).click();

    const urlInput = page.locator("input[readonly]").first();
    const deliveryUrl = await urlInput.inputValue().catch(() => "");
    test.skip(
      !deliveryUrl.includes("http") && !deliveryUrl.includes("/"),
      "No lender URL generated",
    );

    await page.getByTestId("document-vault-manage-portal-links").click();
    await page.getByTestId("portal-link-tab-lender").click();

    const activeRow = page.locator('[data-testid^="portal-link-row-"]').first();
    const linkId = await activeRow.getAttribute("data-testid");
    const rowSuffix = linkId?.replace("portal-link-row-", "") ?? "";

    const incognito = await context.browser()?.newContext();
    if (!incognito) return;
    const guest = await incognito.newPage();
    await guest.goto(deliveryUrl);
    await expect(
      guest.getByText(/Secure package|Lender Data Room/i),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`portal-link-kill-${rowSuffix}`).click();
    await guest.reload();
    await expect(guest.getByText(/Link Revoked|invalid/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId(`portal-link-reactivate-${rowSuffix}`).click();
    await expect(
      page.getByTestId(`portal-link-status-${rowSuffix}`),
    ).toContainText(/active/i, { timeout: 10_000 });

    await guest.reload();
    await expect(
      guest.getByText(/Secure package|Lender Data Room/i),
    ).toBeVisible({ timeout: 20_000 });

    await incognito.close();
  });
});
