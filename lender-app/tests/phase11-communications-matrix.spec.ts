import { expect, test } from "@playwright/test";
import {
  signInWorkspaceSession,
  workspaceSessionReady,
} from "./helpers/workspace-auth";
import {
  convexConfigured,
  openAnyPipelineFileWorkspace,
} from "./mobile/workspace-sheet/_helpers";

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("phase 11 — communications matrix", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip();
      return;
    }
    try {
      await signInWorkspaceSession(page);
    } catch (error) {
      testInfo.skip(true, `Workspace login failed: ${String(error)}`);
    }
  });

  test("pipeline workspace exposes unified communications composer", async ({
    page,
  }, testInfo) => {
    await openAnyPipelineFileWorkspace(page, testInfo);

    await expect(
      page.getByText("Outbound communications", { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Communication history", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /portal/i }).click();
    await expect(page.getByPlaceholder(/portal participants/i)).toBeVisible();

    const templateSelect = page.getByTestId("communications-template-select");
    const optionCount = await templateSelect.locator("option").count();
    if (optionCount > 1) {
      const nextValue = await templateSelect.locator("option").nth(1).getAttribute("value");
      if (nextValue) {
        await templateSelect.selectOption(nextValue);
        await expect(page.locator("textarea").first()).not.toHaveValue("", {
          timeout: 10_000,
        });
      }
    }
  });

  test("contacts workspace renders unified communication hub", async ({
    page,
  }, testInfo) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /contacts/i })).toBeVisible({
      timeout: 30_000,
    });

    const firstContact = page.locator("ul[role='list'] > li > button").first();
    const hasContact = await firstContact.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!hasContact) {
      testInfo.skip(true, "No contact rows available for communication hub verification.");
    }
    await firstContact.click();
    await expect(page.getByText("Communication hub", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Unified outbound history for this contact", { exact: true }),
    ).toBeVisible();
  });
});
