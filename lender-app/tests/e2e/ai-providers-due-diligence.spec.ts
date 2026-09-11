import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import { recoverWorkspaceErrorBoundary } from "../helpers/mobile/pipelineHubReady";
import { openAnyPipelineFileWorkspace } from "../mobile/workspace-sheet/_helpers";

const describeOrSkip = workspaceSessionReady()
  ? test.describe
  : test.describe.skip;

describeOrSkip("AI API keys + due diligence prompts", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000, retries: 1 });

  test.beforeEach(async ({ page }) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await signInWorkspaceSession(page);
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(600 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  });

  test("settings: save provider (masked on reload) and create a prompt", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/settings/ai-providers", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: /^AI API keys$/i })).toBeVisible({
      timeout: 20_000,
    });
    const settingsRoot = page.getByTestId("ai-providers-settings");
    await expect(settingsRoot).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (await settingsRoot.getAttribute("data-ai-providers-state")) ?? "ready",
        { timeout: 30_000 },
      )
      .not.toBe("loading");
    if ((await settingsRoot.getAttribute("data-ai-providers-state")) === "forbidden") {
      testInfo.skip(
        true,
        "Signed-in user lacks settings.access — use PLAYWRIGHT_USE_PRIMARY_AUTH=1 or an owner/admin E2E persona",
      );
      return;
    }
    await expect(page.getByTestId("ai-provider-add")).toBeVisible({
      timeout: 30_000,
    });

    const unique = `E2E OpenAI ${Date.now().toString(36)}`;
    const secret = `sk-e2e-secret-key-${Date.now()}-XYZ9`;

    await page.getByTestId("ai-provider-add").click();
    await expect(page.getByTestId("ai-provider-editor")).toBeVisible();
    await page.getByTestId("ai-provider-name").fill(unique);
    await page.getByTestId("ai-provider-kind").selectOption("openai");
    await page.getByTestId("ai-provider-api-key").fill(secret);
    await page.getByTestId("ai-provider-save").click();

    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("body")).not.toContainText(secret);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("ai-providers-settings")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Key ••••XYZ9/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(secret);

    await page.getByTestId("ai-settings-tab-prompts").click();
    await page.getByTestId("ai-prompt-add").click();
    const promptTitle = `E2E Fraud scan ${Date.now().toString(36)}`;
    await page.getByTestId("ai-prompt-title").fill(promptTitle);
    await page.getByTestId("ai-prompt-template").selectOption("fraud_irregularities");
    const body = page.getByTestId("ai-prompt-body");
    if (!(await body.inputValue()).trim()) {
      await body.fill(
        "Review the attached vault files for irregularities and fraud signals.",
      );
    }
    await page.getByTestId("ai-prompt-save").click();
    await expect(page.getByText(promptTitle).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("settings hub Jump-to includes AI API keys under Integrations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/settings#aiProviders", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settings-jump-aiProviders")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("settings-section-aiProviders")).toBeVisible();
    await expect(page.getByTestId("settings-ai-providers-link")).toBeVisible();
  });

  test("vault: select ≥2 files and show due diligence result UI", async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.NEXT_PUBLIC_DLC_AI_DUE_DILIGENCE_MOCK !== "1",
      "Set NEXT_PUBLIC_DLC_AI_DUE_DILIGENCE_MOCK=1 (and Convex DLC_AI_DUE_DILIGENCE_MOCK=1) to prove mock analysis UI",
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/documents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Documents$/i })).toBeVisible({
      timeout: 20_000,
    });

    const versionedRows = page
      .locator("li")
      .filter({ has: page.getByRole("checkbox", { name: /^Select /i }) })
      .filter({ hasNotText: /Empty \(no versions\)/i });
    const hubHasVersioned = await versionedRows
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (hubHasVersioned && (await versionedRows.count()) >= 2) {
      await versionedRows.nth(0).getByRole("checkbox").check();
      await versionedRows.nth(1).getByRole("checkbox").check();
      await page.getByTestId("documents-hub-due-diligence").click();
    } else {
      await recoverWorkspaceErrorBoundary(page);
      await openAnyPipelineFileWorkspace(page, testInfo);
      await page.getByTestId("pipeline-file-tab-documents").click();
      await expect(page.getByTestId("document-vault-command-bar")).toBeVisible({
        timeout: 30_000,
      });

      const stamp = Date.now().toString(36);
      const fileA = `e2e-dd-a-${stamp}.txt`;
      const fileB = `e2e-dd-b-${stamp}.txt`;
      const titleA = fileA.replace(/\.txt$/i, "");
      const titleB = fileB.replace(/\.txt$/i, "");

      await page.getByTestId("document-vault-upload-input").setInputFiles([
        {
          name: fileA,
          mimeType: "text/plain",
          buffer: Buffer.from("Statement A: deposits 12400. EIN 12-3456789."),
        },
        {
          name: fileB,
          mimeType: "text/plain",
          buffer: Buffer.from("LOI B: exclusivity 90 days. Deposit 25000."),
        },
      ]);

      await expect(page.getByText(titleA).first()).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(titleB).first()).toBeVisible({ timeout: 90_000 });
      await page.getByLabel(`Select ${titleA}`).first().check();
      await page.getByLabel(`Select ${titleB}`).first().check();

      const bulkDd = page.getByTestId("document-vault-due-diligence");
      if (await bulkDd.isVisible().catch(() => false)) {
        await bulkDd.click();
      } else {
        await page.getByTestId("document-vault-due-diligence-command").click();
      }
    }

    const sheet = page.getByTestId("due-diligence-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });

    const promptBody = page.getByTestId("due-diligence-prompt-body");
    if (!(await promptBody.inputValue()).trim()) {
      await promptBody.fill(
        "Review the attached vault files for irregularities and fraud signals.",
      );
    }

    await page.getByTestId("due-diligence-run").click();
    await expect(page.getByTestId("due-diligence-result")).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId("due-diligence-result")).toContainText(
      /Mock due diligence/i,
    );
  });
});
