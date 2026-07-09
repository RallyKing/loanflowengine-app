import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

function convexConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL?.trim());
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

async function dismissMobileNavIfOpen(page: Page) {
  const close = page.getByRole("button", { name: "Close menu" });
  for (let i = 0; i < 6; i += 1) {
    const vis = await close.isVisible().catch(() => false);
    if (!vis) return;
    try {
      await close.click({ force: true, timeout: 5_000 });
    } catch {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(250);
  }
}

async function waitPipelineLoaded(page: Page) {
  await expect(page.getByText("Loading pipeline…")).toHaveCount(0, {
    timeout: 45_000,
  });
}

async function ensureTableView(page: Page) {
  const mobileGridTab = page.getByRole("tab", { name: "Grid" });
  if (await mobileGridTab.isVisible().catch(() => false)) {
    await mobileGridTab.click();
  } else {
    const tableTab = page.getByRole("tab", { name: "Table" });
    if (await tableTab.isVisible().catch(() => false)) {
      await tableTab.click();
    }
  }
  await expect(page.getByTestId("pipeline-table")).toBeVisible();
}

/** Allow subpixel / rounding; flag real horizontal overflow. */
function assertNoHorizontalOverflow(
  label: string,
  scrollWidth: number,
  clientWidth: number,
) {
  expect(
    scrollWidth,
    `${label}: scrollWidth (${scrollWidth}) should not exceed clientWidth (${clientWidth})`,
  ).toBeLessThanOrEqual(clientWidth + 2);
}

describeOrSkip("Pipeline file view — mobile layout (overflow + shell)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 180_000 });

  /** Only meaningful on narrow viewports (Mobile Chrome / Mobile Safari projects). */
  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("fills viewport without horizontal overflow; shell px-0 on file route", async ({
    page,
  }, testInfo) => {
    // Match a typical phone width; ensures shell gutter asserts run on “mobile” even if the runner window is large.
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const envId =
      process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim() ||
      process.env.PROD_PIPELINE_FILE_ID?.trim();
    if (envId) {
      await page.goto(`/pipeline/${encodeURIComponent(envId)}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissMobileNavIfOpen(page);
      await waitPipelineLoaded(page);
    } else {
      const openBtn = page.getByRole("button", { name: /^Open file\b/i }).first();
      const hasOpen = await openBtn.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!hasOpen) {
        testInfo.skip(
          true,
          "Need visible Open file control, or set E2E_PIPELINE_SCROLL_FILE_ID / PROD_PIPELINE_FILE_ID",
        );
      }
      await openBtn.click({ force: true });
      await expect(page).toHaveURL(/\/pipeline\/[^/]+$/i, { timeout: 45_000 });
    }

    const drawerScroll = page.getByTestId("pipeline-drawer-scroll");
    await expect(drawerScroll).toBeVisible({ timeout: 20_000 });
    await expect(drawerScroll.getByText("Loading…")).toHaveCount(0, {
      timeout: 45_000,
    });

    const vw = await page.evaluate(() => window.innerWidth);
    testInfo.annotations.push({
      type: "viewport",
      description: `innerWidth=${vw}`,
    });

    // Document + primary scroll surfaces: no horizontal overflow.
    const docMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
    }));
    assertNoHorizontalOverflow(
      "documentElement",
      docMetrics.scrollWidth,
      docMetrics.clientWidth,
    );
    expect(
      docMetrics.clientWidth,
      "document clientWidth should match viewport",
    ).toBe(docMetrics.innerWidth);

    const mainMetrics = await page.getByTestId("app-main-scroll").evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    assertNoHorizontalOverflow(
      "app-main-scroll",
      mainMetrics.scrollWidth,
      mainMetrics.clientWidth,
    );

    const drawerMetrics = await drawerScroll.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    assertNoHorizontalOverflow(
      "pipeline-drawer-scroll",
      drawerMetrics.scrollWidth,
      drawerMetrics.clientWidth,
    );

    // App chrome inner wrapper: pipeline file route uses px-0 below md — no outer side gutters on mobile.
    const shellGutter = await page.getByTestId("app-main-scroll").evaluate((main) => {
      const inner = main.querySelector(":scope > div");
      if (!inner) return null;
      const s = getComputedStyle(inner);
      return {
        paddingLeft: parseFloat(s.paddingLeft),
        paddingRight: parseFloat(s.paddingRight),
        maxWidth: s.maxWidth,
      };
    });
    expect(shellGutter, "app-main > div wrapper missing").not.toBeNull();
    if (vw < 768) {
      expect(shellGutter!.paddingLeft, "mobile: shell horizontal padding-left should be 0").toBe(
        0,
      );
      expect(shellGutter!.paddingRight, "mobile: shell horizontal padding-right should be 0").toBe(
        0,
      );
    }

    // Page gutter: horizontal inset on small viewports (AppChrome shell is px-0 below sm).
    const gutterPad = await drawerScroll
      .locator(":scope > div")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(
      gutterPad,
      "file workspace gutter should have horizontal padding for readability on mobile",
    ).toBeGreaterThanOrEqual(10);
    expect(gutterPad).toBeLessThanOrEqual(20);

    await page.screenshot({
      path: testInfo.outputPath("pipeline-file-mobile-viewport.png"),
      fullPage: false,
    });
  });

  test("file-details anchor sits below workspace sticky chrome (scroll-margin)", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const envId =
      process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim() ||
      process.env.PROD_PIPELINE_FILE_ID?.trim();
    if (envId) {
      await page.goto(`/pipeline/${encodeURIComponent(envId)}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissMobileNavIfOpen(page);
      await waitPipelineLoaded(page);
    } else {
      const openBtn = page.getByRole("button", { name: /^Open file\b/i }).first();
      const hasOpen = await openBtn.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!hasOpen) {
        testInfo.skip(
          true,
          "Need visible Open file control, or set E2E_PIPELINE_SCROLL_FILE_ID / PROD_PIPELINE_FILE_ID",
        );
      }
      await openBtn.click({ force: true });
      await expect(page).toHaveURL(/\/pipeline\/[^/]+$/i, { timeout: 45_000 });
    }

    const drawerScroll = page.getByTestId("pipeline-drawer-scroll");
    await expect(drawerScroll).toBeVisible({ timeout: 20_000 });
    await expect(drawerScroll.getByText("Loading…")).toHaveCount(0, {
      timeout: 45_000,
    });

    const section = page.locator("#file-details");
    if ((await section.count()) === 0) {
      testInfo.skip(true, "File details block not present in drawer layout");
      return;
    }

    await section.evaluate((el) => {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    });
    await page.waitForTimeout(200);

    const { ok, gap } = await page.evaluate(() => {
      const el = document.getElementById("file-details");
      const chrome = document.querySelector("[data-mobile-workspace-chrome]");
      if (!el || !chrome) return { ok: false, gap: 0 };
      const sr = el.getBoundingClientRect();
      const cr = chrome.getBoundingClientRect();
      const g = sr.top - cr.bottom;
      return { ok: g >= -2, gap: g };
    });

    expect(
      ok,
      `file-details top should clear sticky workspace chrome (gap sr.top - chrome.bottom = ${gap}px)`,
    ).toBe(true);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const shell = document.querySelector("[data-pipeline-file-workspace-shell]");
            if (!shell) return "";
            return getComputedStyle(shell).getPropertyValue("--header-height").trim();
          }),
        {
          timeout: 10_000,
          message: "--header-height should be set after sticky chrome measures",
        },
      )
      .toMatch(/\d+(\.\d+)?px$/);
  });
});
