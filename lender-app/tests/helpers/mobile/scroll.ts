import { expect, type Locator, type Page } from "@playwright/test";

export async function scrollBySteps(
  page: Page,
  scrollEl: Locator,
  deltaY: number,
  steps: number,
): Promise<void> {
  await scrollEl.scrollIntoViewIfNeeded();
  const box = await scrollEl.boundingBox();
  expect(box, "scroll container bounding box").toBeTruthy();
  try {
    await scrollEl.hover({
      position: { x: Math.min(box!.width, 240) / 2, y: box!.height / 2 },
      timeout: 8_000,
    });
  } catch {
    await page.mouse.move(box!.x + Math.min(box!.width, 240) / 2, box!.y + box!.height / 2);
  }
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, deltaY);
    if (i % 6 === 0) await page.waitForTimeout(8);
  }
}

/** Programmatic vertical scroll (reliable when wheel synthesis is ignored). */
export async function scrollMainBy(scrollEl: Locator, delta: number, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await scrollEl.evaluate((el, d) => {
      el.scrollBy({ top: d, behavior: "auto" });
    }, delta);
  }
}

export async function injectTallProbe(
  scrollEl: Locator,
  heightPx: number,
  attr = "data-dlc-mobile-scroll-probe",
): Promise<void> {
  await scrollEl.evaluate(
    (el, { heightPx: h, attr: a }) => {
      const probe = document.createElement("div");
      probe.setAttribute(a, "");
      probe.style.height = `${h}px`;
      probe.style.width = "1px";
      probe.style.flexShrink = "0";
      const inner = el.matches("main") ? (el.querySelector(":scope > div") ?? el) : el;
      inner.appendChild(probe);
    },
    { heightPx, attr },
  );
}

export async function removeProbes(page: Page, attr: string): Promise<void> {
  await page.evaluate((a) => {
    document.querySelectorAll(`[${a}]`).forEach((n) => n.remove());
  }, attr);
}

/** Touch-like pan: mouse down + drag (Playwright synthesizes for hit testing). */
export async function touchLikePanScroll(
  page: Page,
  scrollEl: Locator,
  deltaY: number,
  steps = 12,
): Promise<void> {
  await scrollEl.scrollIntoViewIfNeeded();
  const box = await scrollEl.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2;
  const y0 = box!.y + box!.height * 0.55;
  const y1 = y0 + deltaY;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.mouse.move(x, y1, { steps });
  await page.mouse.up();
}

export async function touchFlickScroll(
  page: Page,
  scrollEl: Locator,
  deltaY: number,
): Promise<void> {
  await scrollEl.scrollIntoViewIfNeeded();
  const box = await scrollEl.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + Math.min(box!.width, 240) / 2;
  const y0 = box!.y + box!.height * 0.42;
  const y1 = y0 + deltaY;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.mouse.move(x, y1, { steps: 2 });
  await page.mouse.up();
}
