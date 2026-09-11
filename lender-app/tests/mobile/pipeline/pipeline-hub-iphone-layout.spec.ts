import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import {
  isMobileTouchProject,
  skipPlaywrightWebKitOnWindows,
} from "../../helpers/mobile/projects";
import {
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

describeOrSkip("Pipeline hub — iPhone layout hygiene", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("triage badge does not overlay title; project wraps; bottom spacer present", async ({
    page,
  }, testInfo) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page, { allowDegraded: true });
    if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
      testInfo.skip(true, "Pipeline hub unavailable (Convex/org scope)");
      return;
    }
    await ensurePipelineHubListVisible(page);

    // Header: help / refresh / live hidden on phone; search + account remain.
    const header = page.getByTestId("master-header-actions");
    await expect(header).toBeVisible();
    await expect(header.getByLabel(/Help and support/i)).toBeHidden();
    await expect(header.getByTestId("app-hard-refresh")).toBeHidden();

    const frames = page.getByTestId("hub-triage-highlight-frame");
    const frameCount = await frames.count();
    if (frameCount > 0) {
      const frame = frames.first();
      const mobileSlot = frame.getByTestId(
        "hub-triage-highlight-badge-slot-mobile",
      );
      await expect(mobileSlot).toBeVisible();
      const desktopSlot = frame.getByTestId(
        "hub-triage-highlight-badge-slot-desktop",
      );
      await expect(desktopSlot).toBeHidden();

      const title = frame.getByTestId("pipeline-file-row-title").first();
      const badge = frame.getByTestId("hub-triage-highlight-badge").first();
      if (
        (await title.isVisible().catch(() => false)) &&
        (await badge.isVisible().catch(() => false))
      ) {
        const overlap = await page.evaluate(
          ([titleEl, badgeEl]) => {
            const t = (titleEl as HTMLElement).getBoundingClientRect();
            const b = (badgeEl as HTMLElement).getBoundingClientRect();
            const xOverlap = Math.max(
              0,
              Math.min(t.right, b.right) - Math.max(t.left, b.left),
            );
            const yOverlap = Math.max(
              0,
              Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top),
            );
            return xOverlap * yOverlap;
          },
          [await title.elementHandle(), await badge.elementHandle()],
        );
        expect(overlap).toBe(0);
      }

      const project = frame.getByTestId("pipeline-file-row-project").first();
      if (await project.isVisible().catch(() => false)) {
        const wrapsCleanly = await project.evaluate((el) => {
          const style = window.getComputedStyle(el);
          // Must not mid-clip with single-line truncate on phone.
          return (
            style.whiteSpace !== "nowrap" ||
            el.scrollWidth <= el.clientWidth + 1
          );
        });
        expect(wrapsCleanly).toBe(true);
      }
    }

    await expect(page.getByTestId("app-main-bottom-nav-spacer")).toBeVisible();

    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(doc.sw).toBeLessThanOrEqual(doc.cw + 2);
  });
});
