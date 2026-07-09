import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = PROD && workspaceSessionReady();

const VIEWPORTS = [
  { width: 320, height: 568, label: "320x568" },
  { width: 375, height: 812, label: "375x812" },
  { width: 390, height: 844, label: "390x844" },
  { width: 414, height: 896, label: "414x896" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 1440, height: 900, label: "1440x900" },
] as const;

async function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): Promise<boolean> {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Phase 15 Step 15 — UI stability (prod)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-testid='app-masterpage-chrome']")).toBeVisible({
      timeout: 60_000,
    });
  });

  for (const vp of VIEWPORTS) {
    test(`header chrome has no control overlap @ ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const chrome = page.locator("[data-testid='app-masterpage-chrome']");
      await expect(chrome).toBeVisible({ timeout: 30_000 });

      const controls = chrome.locator(
        "button:visible, a[href]:visible, [role='button']:visible",
      );
      const count = await controls.count();
      const boxes: Array<{ x: number; y: number; width: number; height: number; i: number }> =
        [];
      for (let i = 0; i < count; i++) {
        const el = controls.nth(i);
        const box = await el.boundingBox();
        if (!box || box.width < 8 || box.height < 8) continue;
        boxes.push({ ...box, i });
      }

      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const overlap = await rectsOverlap(boxes[a]!, boxes[b]!);
          if (overlap) {
            const areaOverlap =
              Math.max(
                0,
                Math.min(boxes[a]!.x + boxes[a]!.width, boxes[b]!.x + boxes[b]!.width) -
                  Math.max(boxes[a]!.x, boxes[b]!.x),
              ) *
              Math.max(
                0,
                Math.min(boxes[a]!.y + boxes[a]!.height, boxes[b]!.y + boxes[b]!.height) -
                  Math.max(boxes[a]!.y, boxes[b]!.y),
              );
            const minArea = Math.min(
              boxes[a]!.width * boxes[a]!.height,
              boxes[b]!.width * boxes[b]!.height,
            );
            if (areaOverlap > minArea * 0.35) {
              throw new Error(
                `Header controls overlap at ${vp.label}: indices ${boxes[a]!.i} vs ${boxes[b]!.i}`,
              );
            }
          }
        }
      }
    });
  }

  test("notifications inbox panel is opaque", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const bell = page.locator("[data-testid='notifications-bell']");
    if ((await bell.count()) === 0) {
      test.skip(true, "No notifications bell in this session");
    }
    await expect(bell).toBeVisible({ timeout: 30_000 });
    await bell.click();
    const panel = page.locator("[data-testid='notifications-inbox-panel']");
    await expect(panel).toBeVisible();
    const bg = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, opacity: s.opacity };
    });
    expect(bg.opacity).toBe("1");
    expect(bg.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg.bg).not.toBe("transparent");
  });

  test("hub loan row actions render when hierarchy visible", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    const hub = page.locator("[data-testid='pipeline-hub-hierarchy']");
    if ((await hub.count()) === 0) {
      test.skip(true, "No hub hierarchy on this account view");
    }
    const actions = hub.locator("[data-testid='hub-loan-row-actions']").first();
    if ((await actions.count()) === 0) {
      test.skip(true, "No loan rows in hub");
    }
    await expect(actions).toBeVisible();
    await expect(actions.locator("[data-testid='hub-loan-open']")).toBeVisible();
  });
});
