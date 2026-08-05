import { test, expect } from "@playwright/test";
import {
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import {
  expectPipelineHubVisible,
  recoverWorkspaceErrorBoundary,
} from "../helpers/mobile/pipelineHubReady";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../helpers/mobile/projects";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("Pipeline hub stage pill (grouped list)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_E2E_USERS_ENABLED + E2E_PASS_* or APP_AUTH_USERNAME + APP_AUTH_PASSWORD",
    );
    skipPlaywrightWebKitOnWindows(testInfo);
    await signInWorkspaceSession(page);
    await recoverWorkspaceErrorBoundary(page);
  });

  test("stage native select is hit-testable; identity stays visible @ desktop", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileTouchProject(testInfo.project.name), "desktop coverage");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expectPipelineHubVisible(page, { allowDegraded: true });

    const loans = page.getByRole("button", { name: /^Loans$/i });
    if (await loans.isVisible().catch(() => false)) {
      await loans.click();
      await page.waitForTimeout(500);
    }

    const row = page.locator("[data-pipeline-row]").first();
    const hasRows = await row.isVisible({ timeout: 20_000 }).catch(() => false);
    test.skip(!hasRows, "No pipeline file rows in this workspace session");

    const hierarchy = page.getByTestId("pipeline-file-row-hierarchy").first();
    await expect(hierarchy).toBeVisible();
    await expect(hierarchy).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("pipeline-file-row-project").first()).toBeVisible();

    const tipDismiss = page.getByTestId("contextual-quick-tip").getByRole("button", {
      name: /dismiss/i,
    });
    if (await tipDismiss.isVisible().catch(() => false)) {
      await tipDismiss.click();
    }

    const stage = page.getByTestId("pipeline-stage-selector").first();
    await expect(stage).toBeVisible({ timeout: 15_000 });
    const native = stage.getByTestId("inline-select-badge-native").first();
    await expect(native).toBeAttached();

    const box = await native.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(20);
    expect(box!.height).toBeGreaterThan(10);

    const blocked = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="pipeline-stage-selector"] [data-testid="inline-select-badge-native"]',
      ) as HTMLSelectElement | null;
      if (!el) return "missing-select";
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return "zero-box";
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top) return "no-top";
      if (top === el || el.contains(top)) return null;
      return (
        (top as HTMLElement).tagName +
        ":" +
        ((top as HTMLElement).className || "").toString().slice(0, 80)
      );
    });
    expect(blocked).toBeNull();

    const optionCount = await native.locator("option").count();
    expect(optionCount).toBeGreaterThan(1);
  });

  test("stage select remains clickable under mobile tip chrome @ mobile", async ({
    page,
  }, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name), "mobile coverage");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expectPipelineHubVisible(page, { allowDegraded: true });

    const loans = page.getByRole("button", { name: /^Loans$/i });
    if (await loans.isVisible().catch(() => false)) {
      await loans.click();
      await page.waitForTimeout(500);
    }

    const tip = page.getByTestId("contextual-quick-tip");
    if (await tip.isVisible().catch(() => false)) {
      await expect(tip).toHaveCSS("pointer-events", "none");
    }

    const native = page.getByTestId("inline-select-badge-native").first();
    const hasNative = await native.isVisible({ timeout: 20_000 }).catch(() => false);
    test.skip(!hasNative, "No editable stage pills in this workspace session");
    await native.scrollIntoViewIfNeeded();
    const box = await native.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(20);
  });
});
