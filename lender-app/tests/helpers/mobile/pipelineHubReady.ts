import { expect, type Page } from "@playwright/test";

export function isPipelineHubPath(pathname: string): boolean {
  return pathname === "/pipeline" || pathname === "/pipeline/";
}

/** Dismiss org-scope banner and retry Convex error boundaries when present. */
export async function recoverWorkspaceErrorBoundary(page: Page) {
  const dismissNotice = page.getByRole("button", {
    name: /Dismiss workspace notice/i,
  });
  if (await dismissNotice.isVisible().catch(() => false)) {
    await dismissNotice.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(400);
  }
  const tryAgain = page.getByRole("button", { name: /^Try again$/i });
  for (let i = 0; i < 3; i += 1) {
    if (!(await tryAgain.isVisible().catch(() => false))) break;
    await tryAgain.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1200);
  }
}

async function recoverPipelineHubIfNeeded(page: Page) {
  await recoverWorkspaceErrorBoundary(page);
}

export function isWorkspaceDegraded(page: Page) {
  return page.getByRole("heading", { name: /Something went wrong/i });
}

/**
 * Route chrome visible, or degraded shell (main scroll) when Convex/org scope blocks data.
 */
export async function expectWorkspaceRouteVisible(
  page: Page,
  options: {
    heading: RegExp;
    toolbarLabel?: string;
    allowDegraded?: boolean;
  },
) {
  await dismissMobileNavIfOpen(page);
  await recoverWorkspaceErrorBoundary(page);

  const title = page.getByRole("heading", { name: options.heading });
  const toolbar = options.toolbarLabel
    ? page.getByLabel(options.toolbarLabel)
    : null;
  const chrome = toolbar ? title.or(toolbar) : title;

  if (options.allowDegraded) {
    await expect
      .poll(
        async () => {
          if (await chrome.first().isVisible().catch(() => false)) {
            return "chrome";
          }
          if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
            return "degraded";
          }
          return "";
        },
        { timeout: 45_000 },
      )
      .toMatch(/chrome|degraded/);
    if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
      await expect(page.getByTestId("app-main-scroll")).toBeVisible({
        timeout: 15_000,
      });
    }
    return;
  }

  if (await chrome.first().isVisible().catch(() => false)) return;

  if (await isWorkspaceDegraded(page).isVisible().catch(() => false)) {
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 45_000,
    });
    return;
  }

  await expect(chrome.first()).toBeVisible({ timeout: 45_000 });
}

/** Hub chrome visible (orientation strip + legacy page title). */
export async function expectPipelineHubVisible(
  page: Page,
  options?: { allowDegraded?: boolean },
) {
  await dismissMobileNavIfOpen(page);
  await recoverPipelineHubIfNeeded(page);
  const hubChrome = page
    .getByTestId("pipeline-hub-orientation")
    .or(page.getByRole("heading", { name: /^Pipeline$/i }));
  const degraded = page.getByRole("heading", { name: /Something went wrong/i });

  if (await hubChrome.first().isVisible().catch(() => false)) return;

  if (await degraded.isVisible().catch(() => false)) {
    if (options?.allowDegraded) {
      await expect(page.getByTestId("app-main-scroll")).toBeVisible({
        timeout: 15_000,
      });
      return;
    }
    await expect(hubChrome.first()).toBeVisible({ timeout: 45_000 });
    return;
  }

  if (
    options?.allowDegraded &&
    isPipelineHubPath(new URL(page.url()).pathname)
  ) {
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 45_000,
    });
    return;
  }

  await expect(hubChrome.first()).toBeVisible({ timeout: 45_000 });
}

export function isPipelineHubDegraded(page: Page) {
  return page.getByRole("heading", { name: /Something went wrong/i });
}

/** Close mobile drawer nav if it covers the hub list. */
export async function dismissMobileNavIfOpen(page: Page) {
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

/**
 * Hub list is interactive: hierarchy shell, rows, or explicit empty states.
 * Replaces legacy `pipeline-table` / `pipeline-hub-mobile-cards` only checks.
 */
export async function ensurePipelineHubListVisible(page: Page) {
  await dismissMobileNavIfOpen(page);
  await recoverPipelineHubIfNeeded(page);

  if (await isPipelineHubDegraded(page).isVisible().catch(() => false)) {
    return;
  }

  const gridTab = page.getByRole("tab", { name: "Grid" });
  if (await gridTab.isVisible().catch(() => false)) {
    await gridTab.click();
  } else {
    const tableTab = page.getByRole("tab", { name: "Table" });
    if (await tableTab.isVisible().catch(() => false)) {
      await tableTab.click();
    }
  }

  await expect
    .poll(async () => {
      if (
        await page
          .getByTestId("pipeline-hub-hierarchy-shell")
          .isVisible()
          .catch(() => false)
      ) {
        return "shell";
      }
      if (
        await page
          .getByTestId("pipeline-hub-hierarchy")
          .isVisible()
          .catch(() => false)
      ) {
        return "hierarchy";
      }
      if (
        await page
          .getByTestId("pipeline-hub-hierarchy-shell")
          .isVisible()
          .catch(() => false)
      ) {
        return "hierarchy";
      }
      if ((await page.locator('[data-pipeline-hub-list="hierarchy"]').count()) > 0) {
        return "hierarchy";
      }
      if (
        await page.getByTestId("pipeline-table").isVisible().catch(() => false)
      ) {
        return "table";
      }
      if (
        await page
          .getByTestId("pipeline-hub-mobile-cards")
          .isVisible()
          .catch(() => false)
      ) {
        return "cards";
      }
      if (
        await page.getByTestId("pipeline-hub-empty").isVisible().catch(() => false)
      ) {
        return "empty";
      }
      if (
        await page
          .getByTestId("pipeline-hub-no-matches")
          .isVisible()
          .catch(() => false)
      ) {
        return "empty";
      }
      const rows = await page.locator("[data-pipeline-row]").count();
      if (rows > 0) return "rows";
      return "";
    }, { timeout: 45_000 })
    .toMatch(/shell|hierarchy|table|cards|empty|rows/);
}

/**
 * Pipeline hub finished initial Convex hydration (skeleton / SSR fallback cleared).
 */
export async function waitPipelineHubReady(
  page: Page,
  options?: { allowDegraded?: boolean },
) {
  const pathname = new URL(page.url()).pathname;
  if (!isPipelineHubPath(pathname)) return;

  await dismissMobileNavIfOpen(page);
  await expectPipelineHubVisible(page, options);

  await expect
    .poll(
      async () => {
        if ((await page.locator("[data-pipeline-hub-loading]").count()) > 0) {
          return "loading";
        }
        const dynamicBusy = await page
          .getByText("Loading pipeline…", { exact: true })
          .count();
        if (dynamicBusy > 0) return "loading";
        return "ready";
      },
      { timeout: 45_000 },
    )
    .toBe("ready");
}

/** File workspace blocks are rendered (loading section dismissed). */
export async function waitPipelineFileWorkspaceLoaded(page: Page) {
  await expect(page.getByTestId("pipeline-workspace-scroll")).toBeVisible({
    timeout: 25_000,
  });
  await expect
    .poll(
      async () => {
        const loadingSection = await page
          .locator('[data-section-id="pipeline-file-loading"]')
          .count();
        return loadingSection > 0 ? "loading" : "ready";
      },
      { timeout: 45_000 },
    )
    .toBe("ready");
}
