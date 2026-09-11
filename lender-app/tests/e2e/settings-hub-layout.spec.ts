import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

/**
 * Guards the Settings IA Jump-to layout regression:
 * Tailwind must scan `modules/` so desktop `md:flex-col` / `md:w-56` exist;
 * otherwise parent `md:flex-row` squeezes content into a blank white panel.
 */

async function recoverIfErrorBoundary(page: Page) {
  const boom = page.getByRole("heading", { name: /Something went wrong/i });
  if (await boom.isVisible().catch(() => false)) {
    const retry = page.getByRole("button", { name: /Try again/i });
    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
    } else {
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
}

async function openSettings(page: Page) {
  // Hash deep-link matches saas-system (more stable org settle than bare /settings).
  await page.goto("/settings#display", { waitUntil: "domcontentloaded" });
  for (let attempt = 0; attempt < 3; attempt++) {
    await recoverIfErrorBoundary(page);
    const settingsHeading = page.getByRole("heading", { name: /^Settings$/i });
    try {
      await expect(settingsHeading).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: /Something went wrong/i }),
      ).toHaveCount(0);
      await expect(page.getByTestId("settings-section-display")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId("settings-hub-layout")).toBeVisible();
      return;
    } catch {
      if (attempt === 2) throw new Error("Settings hub did not stabilize");
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
}

async function assertJumpNavVertical(page: Page) {
  const nav = page.getByTestId("settings-jump-nav");
  const list = page.getByTestId("settings-jump-nav-list");
  await expect(nav).toBeVisible();
  await expect(list).toBeVisible();
  await expect(nav).toContainText("Jump to");

  await expect
    .poll(
      async () => {
        await recoverIfErrorBoundary(page);
        const box = await list.boundingBox();
        return box?.height ?? 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(120);

  const metrics = await list.evaluate((el) => {
    const style = window.getComputedStyle(el);
    const rect = (el as HTMLElement).getBoundingClientRect();
    const kids = Array.from(el.children) as HTMLElement[];
    const stacked =
      kids.length >= 2 &&
      kids[1]!.getBoundingClientRect().top >=
        kids[0]!.getBoundingClientRect().bottom - 2;
    return {
      flexDirection: style.flexDirection,
      display: style.display,
      width: rect.width,
      height: rect.height,
      stacked,
    };
  });
  expect(
    metrics.flexDirection === "column" || metrics.stacked,
    `Jump-to should stack vertically (flex=${metrics.flexDirection}, stacked=${metrics.stacked}, display=${metrics.display})`,
  ).toBe(true);
  expect(metrics.width).toBeLessThan(360);
}

async function assertMainContentVisible(page: Page) {
  const content = page.getByTestId("settings-hub-content");
  await expect(content).toBeVisible();
  await expect
    .poll(async () => {
      const box = await content.boundingBox();
      return box?.width ?? 0;
    }, { timeout: 15_000 })
    .toBeGreaterThan(240);

  const box = await content.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThan(120);
  await expect(page.getByTestId("settings-section-display")).toBeVisible();
}

const describeOrSkip = workspaceSessionReady()
  ? test.describe
  : test.describe.skip;

describeOrSkip("Settings hub layout", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await signInWorkspaceSession(page);
  });

  test("desktop: Jump-to is vertical sidebar and content is visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openSettings(page);
    await assertJumpNavVertical(page);
    await assertMainContentVisible(page);
  });

  test("tablet-with-rail width: sidebar still vertical (md breakpoint)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await openSettings(page);
    await assertJumpNavVertical(page);
    await assertMainContentVisible(page);
  });

  test("mobile: Jump-to chip strip + main content still visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSettings(page);

    const list = page.getByTestId("settings-jump-nav-list");
    await expect(list).toBeVisible();
    await expect
      .poll(async () => {
        const box = await list.boundingBox();
        return box?.width ?? 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(200);

    const metrics = await list.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const kids = Array.from(el.children) as HTMLElement[];
      const sideBySide =
        kids.length >= 2 &&
        Math.abs(
          kids[0]!.getBoundingClientRect().top -
            kids[1]!.getBoundingClientRect().top,
        ) < 8;
      return {
        flexDirection: style.flexDirection,
        sideBySide,
      };
    });
    expect(
      metrics.flexDirection === "row" || metrics.sideBySide,
      `Mobile Jump-to should be a horizontal chip strip (flex=${metrics.flexDirection}, sideBySide=${metrics.sideBySide})`,
    ).toBe(true);

    await assertMainContentVisible(page);
  });
});
