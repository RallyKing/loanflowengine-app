import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import { collectViewportOverflowMetrics } from "../helpers/mobile/viewportOverflow";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = PROD && workspaceSessionReady();

const describeOrSkip = RUN ? test.describe : test.describe.skip;

const MOBILE_MIN_FONT_PX = 16;

async function assertNoFocusZoom(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
  label: string,
) {
  await expect(locator).toBeVisible({ timeout: 60_000 });
  await locator.focus();
  await page.waitForTimeout(400);
  const focused = await collectViewportOverflowMetrics(page, `${label}-focus`);
  expect(
    focused.visualViewportScale ?? 1,
    `${label}: visualViewport.scale after focus`,
  ).toBeGreaterThanOrEqual(0.99);
  expect(
    focused.visualViewportScale ?? 1,
    `${label}: visualViewport.scale after focus`,
  ).toBeLessThanOrEqual(1.01);
  const fontPx = await locator.evaluate((el) =>
    parseFloat(getComputedStyle(el).fontSize),
  );
  expect(fontPx, `${label}: computed font-size`).toBeGreaterThanOrEqual(
    MOBILE_MIN_FONT_PX,
  );
  await locator.blur();
  await page.waitForTimeout(300);
  const blurred = await collectViewportOverflowMetrics(page, `${label}-blur`);
  expect(
    blurred.visualViewportScale ?? 1,
    `${label}: visualViewport.scale after blur`,
  ).toBeLessThanOrEqual(1.01);
}

describeOrSkip("Phase 24.3B — mobile input focus zoom (prod)", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
  });

  test("viewport meta does not disable pinch zoom", async ({ page }) => {
    const meta = await page.evaluate(() =>
      document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
    );
    expect(meta).toMatch(/width=device-width/i);
    expect(meta).not.toMatch(/user-scalable=no/i);
    expect(meta).not.toMatch(/maximum-scale=1\b/i);
  });

  test("global CSS floor beats Tailwind text-xs on a raw select", async ({
    page,
  }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid='app-masterpage-chrome']")).toBeVisible({
      timeout: 60_000,
    });
    // Inject adversarial control that previously beat :where() floor.
    const fontPx = await page.evaluate(() => {
      const sel = document.createElement("select");
      sel.className = "text-xs";
      sel.setAttribute("data-testid", "adversarial-zoom-select");
      document.body.appendChild(sel);
      return parseFloat(getComputedStyle(sel).fontSize);
    });
    expect(fontPx).toBeGreaterThanOrEqual(MOBILE_MIN_FONT_PX);
  });

  test("tasks search focus keeps visualViewport scale at 1", async ({
    page,
  }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("textbox", { name: /search tasks/i }).first();
    await assertNoFocusZoom(page, search, "tasks-search");
  });

  test("pipeline hub search + filter select stay ≥16px without zoom", async ({
    page,
  }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid='app-masterpage-chrome']")).toBeVisible({
      timeout: 60_000,
    });
    const hubSearch = page.getByRole("textbox", { name: /search pipeline/i });
    await assertNoFocusZoom(page, hubSearch, "pipeline-hub-search");

    const clientFilter = page.getByLabel("Filter by client");
    if (await clientFilter.count()) {
      await assertNoFocusZoom(page, clientFilter.first(), "pipeline-client-filter");
    }

    const projectionSearch = page.locator(
      "[data-testid='pipeline-projection-search']",
    );
    if (await projectionSearch.count()) {
      await assertNoFocusZoom(
        page,
        projectionSearch.first(),
        "pipeline-projection-search",
      );
    }
  });

  test("login fields stay ≥16px without zoom", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const user = page
      .getByRole("textbox", { name: /email|username|user/i })
      .or(page.locator('input[type="email"], input[name="username"], input[name="email"]'))
      .first();
    if (await user.count()) {
      await assertNoFocusZoom(page, user, "login-user");
    }
    const password = page.locator('input[type="password"]').first();
    if (await password.count()) {
      await assertNoFocusZoom(page, password, "login-password");
    }
  });

  test("global search focus keeps visualViewport scale at 1", async ({
    page,
  }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid='app-masterpage-chrome']")).toBeVisible({
      timeout: 60_000,
    });
    const openSearch = page.getByRole("button", { name: /search/i }).first();
    await openSearch.click();
    const query = page.getByRole("textbox", { name: /search query/i });
    await assertNoFocusZoom(page, query, "palette-search");
  });
});
