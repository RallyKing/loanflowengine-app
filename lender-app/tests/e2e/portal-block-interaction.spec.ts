import { test, expect, type Page } from "@playwright/test";
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

function attachConvexRuntimeGuards(page: Page): { assertClean: () => void } {
  const messages: string[] = [];
  page.on("pageerror", (err) => {
    messages.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      messages.push(`console: ${msg.text()}`);
    }
  });
  return {
    assertClean: () => {
      const bad = messages.filter((m) =>
        /\[CONVEX Q\(|You do not have access to this pipeline file|Function not found|Server Error/i.test(
          m,
        ),
      );
      expect(bad, `Unexpected Convex/runtime errors:\n${bad.join("\n")}`).toEqual(
        [],
      );
    },
  };
}

describeOrSkip("Client portal — atomic block load & submit", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ mode: "serial", timeout: 240_000 });

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

  test("portal preview loads assigned income block without pipeline auth errors", async ({
    page,
    context,
  }) => {
    const { assertClean } = attachConvexRuntimeGuards(page);

    const createTrigger = page.getByTestId("document-vault-file-task-create-trigger");
    if (await createTrigger.isVisible().catch(() => false)) {
      await createTrigger.click();
      await page.getByTestId("file-task-polymorphic-create-submit").click();
      await page.getByRole("tab", { name: /block assignment/i }).click();
      const incomeChip = page.getByRole("button", { name: /^Income$/i }).first();
      if (await incomeChip.isVisible().catch(() => false)) {
        await incomeChip.click();
      }
      await page.getByTestId("file-task-config-submit").click();
      await expect(page.getByTestId("file-task-config-submit")).toHaveCount(0, {
        timeout: 15_000,
      });
    }

    const previewPromise = context.waitForEvent("page");
    await page.getByTestId("document-vault-view-as-client").click();
    const portalPage = await previewPromise;
    await portalPage.waitForLoadState("domcontentloaded");

    const portalGuards = attachConvexRuntimeGuards(portalPage);
    await expect(portalPage.getByText(/Document requests/i)).toBeVisible({
      timeout: 30_000,
    });

    const blockPanel = portalPage.getByTestId("client-portal-block-panel");
    if (await blockPanel.isVisible().catch(() => false)) {
      await expect(
        portalPage.getByTestId("client-portal-blocks-error"),
      ).toHaveCount(0);
      await expect(
        portalPage.getByTestId("client-portal-block-income"),
      ).toBeVisible({ timeout: 30_000 });

      const incomeInput = portalPage
        .getByTestId("client-portal-block-income")
        .locator("input, textarea")
        .first();
      if (await incomeInput.isVisible().catch(() => false)) {
        await incomeInput.fill("85000");
        const submit = portalPage.getByTestId("client-portal-block-submit-income");
        await expect(submit).toBeEnabled({ timeout: 10_000 });
        await submit.click();
        await expect(portalPage.getByText(/Under review/i)).toBeVisible({
          timeout: 20_000,
        });
      }
    }

    portalGuards.assertClean();
    assertClean();
  });
});
