import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import { isMobileTouchProject, skipPlaywrightWebKitOnWindows } from "../../helpers/mobile/projects";
import { diagnoseStickyInPipelineShell } from "../../helpers/mobile/diagnostics";
import { waitPipelineFileWorkspaceOrSkip } from "../../helpers/mobile/pipelineFileE2eGuards";
import {
  dismissMobileNavIfOpen,
  ensurePipelineHubListVisible,
  waitPipelineHubReady,
  isPipelineHubDegraded,
} from "../../helpers/mobile/pipelineHubReady";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexOk(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexOk() ? test.describe : test.describe.skip;

describeOrSkip("Sticky — pipeline file chrome", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("sticky header exists and aligns to main when file open", async ({ page }, testInfo) => {
    const envId =
      process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim() ||
      process.env.PROD_PIPELINE_FILE_ID?.trim();

    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page, { allowDegraded: true });
    if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
      testInfo.skip(true, "Pipeline hub unavailable (Convex/org scope)");
      return;
    }
    await ensurePipelineHubListVisible(page);
    if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
      testInfo.skip(true, "Pipeline hub unavailable (Convex/org scope)");
      return;
    }

    if (envId) {
      await page.goto(`/pipeline/${encodeURIComponent(envId)}`, {
        waitUntil: "domcontentloaded",
      });
      await waitPipelineHubReady(page, { allowDegraded: true });
    } else {
      const openControl = page.locator('[title="Open file"], a[aria-label^="Open file"]').first();
      const hasOpen = await openControl.isVisible({ timeout: 8_000 }).catch(() => false);
      const row = page
        .locator("[data-pipeline-row]")
        .first();
      const fallbackId = await row.getAttribute("data-pipeline-row");
      if (!hasOpen && !fallbackId?.trim()) {
        testInfo.skip(true, "Need pipeline row or E2E_PIPELINE_SCROLL_FILE_ID");
        return;
      }
      if (hasOpen) {
        await openControl.click({ timeout: 10_000 });
      }
      const navigated = await page
        .waitForURL(/\/pipeline\/[^/]+$/i, { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!navigated) {
        if (!fallbackId?.trim()) {
          testInfo.skip(true, "Open file navigation did not complete and no fallback file id was available");
          return;
        }
        await page.goto(`/pipeline/${encodeURIComponent(fallbackId.trim())}`, {
          waitUntil: "domcontentloaded",
        });
      }
    }

    await waitPipelineFileWorkspaceOrSkip(page, testInfo);

    await expect(page.locator("[data-pipeline-file-workspace-shell]")).toBeVisible({
      timeout: 20_000,
    });
    const workspaceScroll = page.getByTestId("pipeline-workspace-scroll");
    const scrollPort = (await workspaceScroll.isVisible({ timeout: 5_000 }).catch(() => false))
      ? workspaceScroll
      : page.getByTestId("app-main-scroll");
    await scrollPort.evaluate((el) => {
      el.scrollTop = Math.min(400, el.scrollHeight - el.clientHeight - 4);
    });
    await page.waitForTimeout(100);

    const d = await diagnoseStickyInPipelineShell(page);
    expect(d?.gap).not.toBeNull();
    await expect(
      page.locator("[data-pipeline-file-workspace-shell] header[role='banner']").first(),
      "workspace header should remain visible after delegated scrolling",
    ).toBeVisible();
    await expect(
      page.locator("[data-pipeline-file-workspace-shell] header[role='banner']").first(),
      "workspace header should remain in the viewport after delegated scrolling",
    ).toBeInViewport();
  });
});
