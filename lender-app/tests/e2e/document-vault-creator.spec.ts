import { test, expect, type Page } from "@playwright/test";
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

function attachRuntimeGuards(page: Page): { assertClean: () => void } {
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
        /\[CONVEX|could not find.*function|Function not found/i.test(m),
      );
      expect(bad, `Unexpected runtime errors:\n${bad.join("\n")}`).toEqual([]);
    },
  };
}

describeOrSkip("Document vault creator — drawer, templates, image insert UI", () => {
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
    await page.getByTestId("pipeline-file-tab-documents").click();
    await expect(
      page.getByTestId("document-vault-command-bar"),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("opens as side drawer without blocking workspace tab shell", async ({
    page,
  }) => {
    const { assertClean } = attachRuntimeGuards(page);

    await page.getByTestId("document-vault-create-trigger").click();
    const drawer = page.getByTestId("document-vault-creator-modal");
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("document-vault-creator-select-step")).toBeVisible();
    await expect(page.getByTestId("pipeline-file-workspace-tab-shell")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0, { timeout: 10_000 });
    assertClean();
  });

  test("loads template with hydrated borrower token in editor canvas", async ({
    page,
  }) => {
    const { assertClean } = attachRuntimeGuards(page);

    await page.getByTestId("document-vault-create-trigger").click();
    await page.getByTestId("document-vault-creator-template-executive-summary").click();
    await page.getByTestId("document-vault-creator-use-template").click();

    await expect(page.getByTestId("document-vault-creator-toolbar")).toBeVisible({
      timeout: 15_000,
    });
    const canvas = page.getByTestId("document-vault-creator-canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).not.toContainText("{{borrower_name}}");

    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("document-vault-creator-discard-confirm"),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Discard" }).click();
    assertClean();
  });

  test("image insert modal opens from toolbar with dropzone", async ({
    page,
  }) => {
    const { assertClean } = attachRuntimeGuards(page);

    await page.getByTestId("document-vault-create-trigger").click();
    await page.getByTestId("document-vault-creator-blank").click();
    await expect(page.getByTestId("document-vault-creator-toolbar")).toBeVisible({
      timeout: 15_000,
    });

    const canvas = page.getByTestId("document-vault-creator-canvas");
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox?.height ?? 0).toBeGreaterThanOrEqual(350);

    await page.getByRole("button", { name: "Insert image" }).click();
    await expect(
      page.getByTestId("document-editor-image-insert-modal"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByTestId("document-editor-image-dropzone"),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(
      page.getByTestId("document-editor-image-insert-modal"),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("document-vault-creator-modal")).toBeVisible();
    assertClean();
  });
});
