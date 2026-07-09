import type { Locator, Page } from "@playwright/test";

/** Horizontal swipe: negative deltaX = swipe left (content moves right). */
export async function swipeHorizontal(
  page: Page,
  origin: Locator,
  deltaX: number,
  steps = 14,
): Promise<void> {
  await origin.scrollIntoViewIfNeeded();
  const box = await origin.boundingBox();
  if (!box) return;
  const y = box.y + box.height * 0.5;
  const x0 = box.x + box.width * 0.72;
  const x1 = x0 + deltaX;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1, y, { steps });
  await page.mouse.up();
}

/** Vertical swipe / fling on element (e.g. drawer edge). */
export async function swipeVertical(
  page: Page,
  origin: Locator,
  deltaY: number,
  steps = 14,
): Promise<void> {
  await origin.scrollIntoViewIfNeeded();
  const box = await origin.boundingBox();
  if (!box) return;
  const x = box.x + box.width * 0.5;
  const y0 = box.y + box.height * 0.45;
  const y1 = y0 + deltaY;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.mouse.move(x, y1, { steps });
  await page.mouse.up();
}
