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

describeOrSkip("Client portal folder drop → broker vault sync", () => {
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

  test("portal upload tree renders for document_upload tasks when link exists", async ({
    page,
    context,
  }) => {
    const previewBtn = page.getByTestId("document-vault-view-as-client");
    test.skip(
      !(await previewBtn.isVisible().catch(() => false)),
      "View as Client not available",
    );

    const portalPagePromise = context.waitForEvent("page");
    await previewBtn.click();
    const portalPage = await portalPagePromise;
    await portalPage.waitForLoadState("domcontentloaded");

    const uploadTree = portalPage.getByTestId("client-portal-upload-tree");
    const flatZone = portalPage.getByTestId("client-portal-upload-tree-flat");
    const hasTree = await uploadTree.isVisible().catch(() => false);
    const hasFlat = await flatZone.isVisible().catch(() => false);
    expect(hasTree || hasFlat).toBe(true);

    const dropzone = hasTree
      ? portalPage.locator('[data-testid^="client-portal-folder-dropzone-"]').first()
      : portalPage.getByTestId("client-portal-root-dropzone");
    await expect(dropzone).toBeVisible({ timeout: 15_000 });
  });
});
