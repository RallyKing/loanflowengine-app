import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
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
    await page.waitForTimeout(200);
  }
}

/** Workspace shell: <main> scrolls; document body must stay overflow-locked (no page-level scrollbar). */
async function assertBodyLockedVertical(page: Page) {
  const overflowY = await page.evaluate(() => {
    return getComputedStyle(document.body).overflowY;
  });
  expect(
    ["hidden", "clip"].includes(overflowY),
    `expected body overflow-y hidden|clip in app shell (got ${overflowY})`,
  ).toBeTruthy();
}

/**
 * Large in-main vertical scroll regions compete with <main> (stacked scrollbars).
 * Exclude dialogs. Contacts intentionally uses one tall list pane (max 1).
 */
async function countLargeNestedVerticalScrollports(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector(
      "main[data-testid='app-main-scroll']",
    ) as HTMLElement | null;
    if (!main) return -1;
    const vh = window.innerHeight;
    let n = 0;
    const walk = (root: Element) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.closest('[role="dialog"]')) continue;
        if (!(el instanceof HTMLElement)) continue;
        const st = getComputedStyle(el);
        if (st.overflowY !== "auto" && st.overflowY !== "scroll") continue;
        if (el.scrollHeight <= el.clientHeight + 8) continue;
        const r = el.getBoundingClientRect();
        if (r.height < vh * 0.34) continue;
        if (el === main) continue;
        n += 1;
      }
    };
    walk(main);
    return n;
  });
}

async function assertMainScrollRespondsToWheel(page: Page) {
  const main = page.getByTestId("app-main-scroll");
  await expect(main).toBeVisible();
  const grew = await main.evaluate((el) => {
    const inner = (el.querySelector(":scope > div") ?? el) as HTMLElement;
    const d = document.createElement("div");
    d.setAttribute("data-e2e-surface-scroll-probe", "");
    d.style.cssText = "height:1600px;width:1px;flex-shrink:0";
    d.appendChild(document.createTextNode("\u00a0"));
    inner.appendChild(d);
    return el.scrollHeight - el.clientHeight > 120;
  });
  expect(
    grew,
    `<main> should grow after probe so wheel has an effect`,
  ).toBeTruthy();
  await main.scrollIntoViewIfNeeded();
  const box = await main.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(
    box!.x + Math.min(box!.width, 280) / 2,
    box!.y + box!.height / 2,
  );
  const before = await main.evaluate((el) => el.scrollTop);
  for (let i = 0; i < 14; i += 1) await page.mouse.wheel(0, 220);
  const after = await main.evaluate((el) => el.scrollTop);
  expect(after, "mouse wheel should move <main>.scrollTop").toBeGreaterThan(
    before + 30,
  );
  await page.evaluate(() => {
    document
      .querySelectorAll("[data-e2e-surface-scroll-probe]")
      .forEach((n) => n.remove());
  });
}

describeOrSkip("Surface scroll — key workspaces (Convex)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("pipeline: table view, main scroll, no competing full-height scrollport", async ({
    page,
  }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await expect(
      page.getByText("Loading pipeline…"),
    ).toHaveCount(0, { timeout: 45_000 });
    const mobileGridTab = page.getByRole("tab", { name: "Grid" });
    if (await mobileGridTab.isVisible().catch(() => false)) {
      await mobileGridTab.click();
    } else {
      const tableTab = page.getByRole("tab", { name: "Table" });
      if (await tableTab.isVisible().catch(() => false)) await tableTab.click();
    }
    await expect(page.getByTestId("pipeline-table")).toBeVisible();

    await assertBodyLockedVertical(page);
    const nested = await countLargeNestedVerticalScrollports(page);
    expect(
      nested,
      "pipeline list/table should not add a second full-height vertical scrollport inside <main>",
    ).toBe(0);

    await assertMainScrollRespondsToWheel(page);
  });

  test("tasks: list renders, main scroll, nested scrollports capped", async ({
    page,
  }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Task/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await expect(page.getByText("Loading tasks…")).toHaveCount(0, {
      timeout: 45_000,
    });
    await assertBodyLockedVertical(page);
    const nested = await countLargeNestedVerticalScrollports(page);
    expect(
      nested,
      "tasks surface should not stack multiple full-height scrollports in <main>",
    ).toBeLessThanOrEqual(1);

    await assertMainScrollRespondsToWheel(page);
  });

  test("contacts: main scroll; at most one tall nested list scroller", async ({
    page,
  }) => {
    await page.goto("/contacts", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /^Contacts$/i }),
    ).toBeVisible({ timeout: 30_000 });
    await dismissMobileNavIfOpen(page);
    await assertBodyLockedVertical(page);
    const nested = await countLargeNestedVerticalScrollports(page);
    expect(
      nested,
      "contacts split layout may use one tall list scroller inside <main>",
    ).toBeLessThanOrEqual(1);

    await assertMainScrollRespondsToWheel(page);
  });

  test("lenders: workspace, main scroll, no competing full-height scrollport", async ({
    page,
  }) => {
    await page.goto("/lenders", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /^Lenders$/i }),
    ).toBeVisible({ timeout: 30_000 });
    await dismissMobileNavIfOpen(page);
    await assertBodyLockedVertical(page);
    const nested = await countLargeNestedVerticalScrollports(page);
    expect(
      nested,
      "lenders browse workspace should not add a second full-height scrollport in <main>",
    ).toBe(0);

    await assertMainScrollRespondsToWheel(page);
  });
});
