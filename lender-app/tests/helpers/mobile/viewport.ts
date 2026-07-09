import type { Page } from "@playwright/test";

export async function setOrientationLandscape(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (vp && vp.width < vp.height) {
    await page.setViewportSize({ width: vp.height, height: vp.width });
  }
}

export async function setOrientationPortrait(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (vp && vp.width > vp.height) {
    await page.setViewportSize({ width: vp.height, height: vp.width });
  }
}

export async function resizeViewport(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
}
