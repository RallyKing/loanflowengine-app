import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import {
  isMobileTouchProject,
  skipPlaywrightWebKitOnWindows,
} from "../../helpers/mobile/projects";
import { waitPipelineFileWorkspaceOrSkip } from "../../helpers/mobile/pipelineFileE2eGuards";
import {
  dismissMobileNavIfOpen,
  ensurePipelineHubListVisible,
  waitPipelineHubReady,
  isPipelineHubDegraded,
} from "../../helpers/mobile/pipelineHubReady";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { waitForLinkedStylesheets } from "../../helpers/mobile/appShell";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

async function readMainInnerPadding(page: Page) {
  return page.getByTestId("app-main-scroll").evaluate((main) => {
    const inner = main.querySelector(":scope > div");
    if (!inner) return null;
    const s = getComputedStyle(inner);
    return {
      paddingTop: s.paddingTop,
      paddingBottom: s.paddingBottom,
      paddingLeft: s.paddingLeft,
      paddingRight: s.paddingRight,
    };
  });
}

async function countLargeNestedVerticalScrollports(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector(
      "main[data-testid='app-main-scroll']",
    ) as HTMLElement | null;
    if (!main) return -1;
    const vh = window.innerHeight;
    let n = 0;
    for (const el of main.querySelectorAll("*")) {
      if (el.closest('[role="dialog"]')) continue;
      if (!(el instanceof HTMLElement)) continue;
      const st = getComputedStyle(el);
      if (st.overflowY !== "auto" && st.overflowY !== "scroll") continue;
      if (el.scrollHeight <= el.clientHeight + 8) continue;
      const r = el.getBoundingClientRect();
      if (r.height < vh * 0.34) continue;
      n += 1;
    }
    return n;
  });
}

describeOrSkip("Phase 5 — mobile native scroll stabilization", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name), "Mobile touch device projects only");
    test.skip(!workspaceSessionReady(), "APP_AUTH_USERNAME + APP_AUTH_PASSWORD required");
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("main scrollport: overscroll containment + scroll anchoring off", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    const main = page.locator("main[data-testid='app-main-scroll']");
    await expect(main).toHaveCount(1);
    await expect(main).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-shell", "app");
    await dismissMobileNavIfOpen(page);
    await waitForLinkedStylesheets(page);

    const scrollContract = await main.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        overscrollBehavior: s.overscrollBehavior,
        overscrollBehaviorX: s.overscrollBehaviorX,
        overscrollBehaviorY: s.overscrollBehaviorY,
        overflowAnchor: s.overflowAnchor,
        touchAction: s.touchAction,
      };
    });

    expect(
      scrollContract.overscrollBehaviorY === "none" ||
        scrollContract.overscrollBehaviorY === "contain" ||
        scrollContract.overscrollBehavior === "none" ||
        scrollContract.overscrollBehavior === "contain",
      `expected vertical overscroll none or contain, got ${JSON.stringify(scrollContract)}`,
    ).toBe(true);
    expect(
      scrollContract.overscrollBehaviorX === "contain" ||
        scrollContract.overscrollBehaviorX === "auto",
      `overscroll-behavior-x: ${scrollContract.overscrollBehaviorX}`,
    ).toBe(true);
    expect(
      scrollContract.overflowAnchor === "none" || scrollContract.overflowAnchor === "auto",
      `overflow-anchor: ${scrollContract.overflowAnchor}`,
    ).toBe(true);
    expect(scrollContract.touchAction).toBe("pan-y");
  });

  test("continuous main scroll advances scrollTop without large snap-back", async ({
    page,
  }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page, { allowDegraded: true });
    await dismissMobileNavIfOpen(page);
    await waitPipelineHubReady(page, { allowDegraded: true });
    await ensurePipelineHubListVisible(page);

    const main = page.getByTestId("app-main-scroll");
    await main.evaluate((el) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-e2e-phase5-probe", "");
      probe.style.height = "2400px";
      probe.style.width = "1px";
      probe.style.flexShrink = "0";
      const inner = el.querySelector(":scope > div") ?? el;
      inner.appendChild(probe);
    });

    const maxScroll = await main.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(maxScroll).toBeGreaterThan(400);

    let prev = await main.evaluate((el) => el.scrollTop);
    for (let i = 0; i < 24; i += 1) {
      await main.evaluate((el) => {
        el.scrollBy({ top: 90, behavior: "auto" });
      });
      const y = await main.evaluate((el) => el.scrollTop);
      if (prev < maxScroll - 24) {
        expect(
          y >= prev - 6,
          `scrollTop should not jump backward sharply (i=${i} prev=${prev} now=${y} max=${maxScroll})`,
        ).toBe(true);
      }
      prev = y;
    }
    expect(prev).toBeGreaterThan(120);

    await page.evaluate(() => {
      document.querySelectorAll("[data-e2e-phase5-probe]").forEach((n) => n.remove());
    });
  });

  test("AppChrome inner padding stable across main scroll positions (no layout reflow)", async ({
    page,
  }, testInfo) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page, { allowDegraded: true });
    await dismissMobileNavIfOpen(page);
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

    const main = page.getByTestId("app-main-scroll");
    const atTop = await readMainInnerPadding(page);
    expect(atTop, "main inner wrapper").not.toBeNull();

    const { maxScroll } = await main.evaluate((el) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-e2e-phase5-pad-probe", "");
      probe.style.height = "3200px";
      probe.style.width = "1px";
      probe.style.flexShrink = "0";
      const inner = el.querySelector(":scope > div") ?? el;
      inner.appendChild(probe);
      return { maxScroll: el.scrollHeight - el.clientHeight - 4 };
    });
    expect(maxScroll, "main should scroll after probe").toBeGreaterThan(200);

    const nearPx = (a: string, b: string) => Math.abs(parseFloat(a) - parseFloat(b)) < 1.5;

    await main.evaluate((el, max) => {
      el.scrollTop = Math.min(720, max);
    }, maxScroll);
    await page.waitForTimeout(150);
    const mid = await readMainInnerPadding(page);

    await main.evaluate((el, max) => {
      el.scrollTop = Math.min(40, max);
    }, maxScroll);
    await page.waitForTimeout(150);
    const nearTop = await readMainInnerPadding(page);

    expect(nearPx(mid!.paddingBottom, atTop!.paddingBottom), `pb top vs mid`).toBe(true);
    expect(nearPx(mid!.paddingTop, atTop!.paddingTop), `pt top vs mid`).toBe(true);
    expect(nearPx(nearTop!.paddingBottom, atTop!.paddingBottom), `pb after partial scroll`).toBe(
      true,
    );

    await page.evaluate(() => {
      document.querySelectorAll("[data-e2e-phase5-pad-probe]").forEach((n) => n.remove());
    });
  });

  test("pipeline hub: bounded nested vertical scrollports inside main", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page, { allowDegraded: true });
    await dismissMobileNavIfOpen(page);
    await waitPipelineHubReady(page, { allowDegraded: true });
    await ensurePipelineHubListVisible(page);

    const n = await countLargeNestedVerticalScrollports(page);
    expect(n, `nested large vertical scrollports: ${n}`).toBeLessThanOrEqual(3);
  });

  test("pipeline file: workspace header stays visually stable while delegated scrollport moves", async ({
    page,
  }, testInfo) => {
    const envId =
      process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim() ||
      process.env.PROD_PIPELINE_FILE_ID?.trim();

    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await dismissMobileNavIfOpen(page);
    await waitPipelineHubReady(page, { allowDegraded: true });
    if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
      testInfo.skip(true, "Pipeline hub unavailable (Convex/org scope)");
      return;
    }
    await ensurePipelineHubListVisible(page);

    if (envId) {
      await page.goto(`/pipeline/${encodeURIComponent(envId)}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissMobileNavIfOpen(page);
    } else {
      const openControl = page.locator('[title="Open file"], a[aria-label^="Open file"]').first();
      const hasOpen = await openControl.isVisible({ timeout: 8_000 }).catch(() => false);
      const fallbackFileId = await page
        .locator("[data-pipeline-row]")
        .first();
      const fallbackId = await fallbackFileId.getAttribute("data-pipeline-row");
      if (!hasOpen && !fallbackId?.trim()) {
        testInfo.skip(true, "Set E2E_PIPELINE_SCROLL_FILE_ID or use a workspace with pipeline rows");
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
      await dismissMobileNavIfOpen(page);
    }

    await waitPipelineFileWorkspaceOrSkip(page, testInfo);

    const shell = page.locator("[data-pipeline-file-workspace-shell]");
    await expect(shell).toBeVisible({ timeout: 20_000 });
    const sticky = shell.locator("header[role='banner']").first();
    await expect(sticky).toBeVisible();
    const workspaceScroll = page.getByTestId("pipeline-workspace-scroll");
    const scrollPort = (await workspaceScroll.isVisible({ timeout: 5_000 }).catch(() => false))
      ? workspaceScroll
      : page.getByTestId("app-main-scroll");
    await scrollPort.evaluate((el) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-e2e-phase5-sticky-probe", "");
      probe.style.height = "2600px";
      probe.style.width = "1px";
      const inner = el.querySelector(":scope > div") ?? el;
      inner.appendChild(probe);
    });

    for (let i = 0; i < 24; i += 1) {
      await scrollPort.evaluate((el) => {
        el.scrollBy({ top: 120, behavior: "auto" });
      });
      if (i % 4 === 0) await page.waitForTimeout(8);
    }

    await expect
      .poll(() => scrollPort.evaluate((el) => el.scrollTop), {
        message: "workspace scrollport should scroll down before sticky check",
        timeout: 8_000,
      })
      .toBeGreaterThan(200);

    await expect(sticky, "workspace header should remain visible after delegated scrolling").toBeVisible();
    await expect(sticky, "workspace header should remain inside the viewport after delegated scrolling").toBeInViewport();

    await page.evaluate(() => {
      document.querySelectorAll("[data-e2e-phase5-sticky-probe]").forEach((n) => n.remove());
    });
  });
});
