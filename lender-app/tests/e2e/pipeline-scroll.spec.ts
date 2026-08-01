import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import { isMobileTouchProject } from "../helpers/mobile/projects";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

/**
 * Playwright device profiles — closest CI/local substitute for real handsets:
 * - **Mobile Chrome**: `Pixel 7` (Chromium) → Android Chrome touch/scroll model
 * - **Mobile Safari**: `iPhone 14 Pro` (WebKit) → iOS Safari touch/scroll model
 *
 * For production sign-off, still spot-check on physical iPhone + Android.
 */
function isMobileScrollProject(projectName: string): boolean {
  return isMobileTouchProject(projectName);
}

function attachScrollGuards(page: Page): {
  assertClean: () => void;
  assertNoSevereErrors: () => void;
} {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  return {
    assertClean: () => {
      expect(pageErrors, `pageerror:\n${pageErrors.join("\n")}`).toEqual([]);
    },
    assertNoSevereErrors: () => {
      const bad = consoleErrors.filter((m) =>
        /\b(freeze|deadlock|Uncaught|ChunkLoadError|out of memory)\b/i.test(m)
      );
      expect(
        bad,
        `Unexpected console errors:\n${bad.join("\n")}\n(all: ${consoleErrors.join(" | ")})`
      ).toEqual([]);
    },
  };
}

/** SaaS mobile: open nav drawer can block layout / hit targets until closed. */
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

/** Narrow view forces table mode but hides the Table/Board tabs — only click when visible. */
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

async function waitPipelineLoaded(page: Page) {
  await expect(page.getByText("Loading pipeline…")).toHaveCount(0, {
    timeout: 45_000,
  });
}

/** Long notes + many block-like sections (simulates heavy UI). */
function stressSectionsHtml(
  which: "main" | "drawer" | "workspace",
  count: number,
): string {
  const blocks: string[] = [];
  const longNote =
    "Borrower scenario note: ".repeat(30) +
    "\nLender follow-up: ".repeat(25) +
    "\n" +
    "x".repeat(400) +
    "\n";
  for (let i = 0; i < count; i += 1) {
    blocks.push(`
<div class="rounded-md border border-border/80 bg-muted/10 p-3 mb-3" data-e2e-stress-block="${which}-${i}">
  <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stress block ${i}</div>
  <p class="mt-2 text-sm whitespace-pre-wrap">${longNote}</p>
  <pre class="mt-2 whitespace-pre-wrap break-words rounded border bg-background/80 p-2 text-[11px] leading-relaxed">${"export line\n".repeat(40)}</pre>
</div>`);
  }
  return `
<div data-e2e-scroll-stress-root="${which}">
${blocks.join("")}
<div data-e2e-stress-bottom="${which}" class="py-4 text-center text-sm font-medium text-primary">${which.toUpperCase()}-STRESS-BOTTOM</div>
</div>`;
}

async function injectStressMarkup(
  page: Page,
  locator: Locator,
  which: "main" | "drawer" | "workspace",
) {
  const html = stressSectionsHtml(
    which,
    which === "main" ? 36 : which === "workspace" ? 32 : 28,
  );
  await locator.evaluate((el, markup) => {
    const t = document.createElement("template");
    t.innerHTML = markup.trim();
    const inner = el.matches("main")
      ? (el.querySelector(":scope > div") ?? el)
      : el;
    inner.appendChild(t.content);
  }, html);
}

async function assertBottomVisibleInScroller(
  page: Page,
  scrollEl: Locator,
  which: "main" | "drawer"
) {
  await scrollEl.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const gate = page.locator(`[data-e2e-stress-bottom="${which}"]`);
  await expect(gate).toBeVisible({ timeout: 10_000 });
  const visible = await gate.evaluate((bottom) => {
    const scrollPort =
      bottom.closest("main[data-testid='app-main-scroll']") ??
      bottom.closest('[data-testid="pipeline-table-scroll"]') ??
      bottom.closest('[data-testid="pipeline-drawer-scroll"]');
    if (!scrollPort) return false;
    const br = bottom.getBoundingClientRect();
    const sr = scrollPort.getBoundingClientRect();
    return br.bottom >= sr.top && br.top <= sr.bottom;
  });
  expect(visible, "stress bottom marker should intersect scrollport").toBe(true);
}

async function wheelScrollIn(
  page: Page,
  scrollEl: Locator,
  deltaY: number,
  steps: number
) {
  await scrollEl.scrollIntoViewIfNeeded();
  const box = await scrollEl.boundingBox();
  expect(box, "scroll container must have a bounding box").toBeTruthy();
  const stressHit = scrollEl.locator("[data-e2e-scroll-stress-root]").last();
  try {
    if ((await stressHit.count()) > 0) {
      await stressHit.hover({ position: { x: 24, y: 24 }, timeout: 5_000 });
    } else {
      await scrollEl.hover({ position: { x: 80, y: 120 }, timeout: 5_000 });
    }
  } catch {
    const x = box!.x + Math.min(box!.width, 320) / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
  }
  const t0 = Date.now();
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, deltaY);
    if (i % 8 === 0) await page.waitForTimeout(8);
  }
  const elapsed = Date.now() - t0;
  expect(
    elapsed,
    `wheel loop should not freeze (took ${elapsed}ms for ${steps} steps)`
  ).toBeLessThan(25_000);
}

/** Touch-style: drag inside the scroll region (mobile-friendly gesture simulation). */
async function touchLikePanScroll(page: Page, scrollEl: Locator, deltaY: number) {
  await scrollEl.scrollIntoViewIfNeeded();
  const box = await scrollEl.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2;
  const y0 = box!.y + box!.height * 0.55;
  const y1 = y0 + deltaY;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.mouse.move(x, y1, { steps: 12 });
  await page.mouse.up();
}

/** Touch-style: quick drag (few steps) to approximate a flick for scroll momentum. */
async function touchFlickScroll(page: Page, scrollEl: Locator, deltaY: number) {
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

/** `yRatio`: 0 = top of scrollport box, 1 = bottom. */
async function touchLikePanScrollAt(
  page: Page,
  scrollEl: Locator,
  yRatio: number,
  deltaY: number,
) {
  await scrollEl.scrollIntoViewIfNeeded();
  const box = await scrollEl.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + Math.min(box!.width, 260) / 2;
  const y0 = box!.y + box!.height * yRatio;
  const y1 = y0 + deltaY;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.mouse.move(x, y1, { steps: 14 });
  await page.mouse.up();
}

/** DOM-only: clone real `<tr>` nodes to stress layout/scroll without Convex seed data. */
async function inflatePipelineTableBody(page: Page, targetDataRowCount: number) {
  await page.getByTestId("pipeline-table").waitFor({ state: "visible" });
  return page.evaluate((target: number) => {
    const table = document.querySelector(
      '[data-testid="pipeline-table"]',
    ) as HTMLTableElement | null;
    if (!table) throw new Error("pipeline-table missing");
    const tbody = table.querySelector("tbody");
    if (!tbody) throw new Error("tbody missing");

    const isDataRow = (tr: HTMLTableRowElement) => {
      const txt = tr.textContent ?? "";
      if (/Loading pipeline/i.test(txt)) return false;
      if (/No pipeline files yet/i.test(txt)) return false;
      if (/No files match the current search/i.test(txt)) return false;
      return tr.querySelectorAll("td").length > 1;
    };

    const seeds = Array.from(tbody.querySelectorAll("tr")).filter(isDataRow);
    if (seeds.length === 0) return 0;

    let n = seeds.length;
    let guard = 0;
    while (n < target && guard < 8000) {
      guard += 1;
      for (const row of seeds) {
        if (n >= target) break;
        tbody.appendChild(row.cloneNode(true));
        n += 1;
      }
    }
    return n;
  }, targetDataRowCount);
}

async function assertMainVerticalNoDeadZones(page: Page, main: Locator) {
  await main.evaluate((el) => {
    el.scrollTop = 0;
  });
  const box = await main.boundingBox();
  expect(box).toBeTruthy();
  const yRatios = [0.16, 0.48, 0.79];
  for (const r of yRatios) {
    const x = box!.x + Math.min(box!.width, 280) / 2;
    const y = box!.y + box!.height * r;
    await page.mouse.move(x, y);
    const before = await main.evaluate((el) => el.scrollTop);
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(40);
    const afterWheel = await main.evaluate((el) => el.scrollTop);
    expect(
      afterWheel,
      `main should scroll when wheel targets vertical ratio ${r} (no dead zone)`,
    ).toBeGreaterThan(before);
    await touchLikePanScrollAt(page, main, r, -130);
    await page.waitForTimeout(40);
    const afterPan = await main.evaluate((el) => el.scrollTop);
    expect(
      afterPan,
      `main should respond to touch-like pans at vertical ratio ${r}`,
    ).toBeLessThan(afterWheel);
  }
}

async function assertTableStripHorizontalNoDeadZones(page: Page, strip: Locator) {
  await strip.scrollIntoViewIfNeeded();
  await strip.evaluate((el) => {
    el.scrollLeft = 0;
  });
  const box = await strip.boundingBox();
  expect(box).toBeTruthy();
  const yRatios = [0.22, 0.52, 0.8];
  for (const r of yRatios) {
    const y = box!.y + box!.height * r;
    const x0 = box!.x + box!.width * 0.78;
    const x1 = x0 - 220;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x1, y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(45);
  }
  const left = await strip.evaluate((el) => el.scrollLeft);
  expect(
    left,
    "pipeline table strip should gain scrollLeft from drags at multiple heights",
  ).toBeGreaterThan(35);
}

function touchActionKeywords(css: string): Set<string> {
  return new Set(
    css
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
}

async function exerciseScrollSurface(
  page: Page,
  scrollEl: Locator,
  which: "main" | "drawer"
) {
  await injectStressMarkup(page, scrollEl, which);
  const overflowPx = await scrollEl.evaluate(
    (el) => el.scrollHeight - el.clientHeight
  );
  expect(
    overflowPx,
    `${which}: injected content should overflow scrollport`
  ).toBeGreaterThan(which === "main" ? 600 : 400);

  const before = await scrollEl.evaluate((el) => el.scrollTop);
  await wheelScrollIn(page, scrollEl, which === "main" ? 480 : 520, 32);
  const mid = await scrollEl.evaluate((el) => el.scrollTop);
  expect(mid).toBeGreaterThan(before + 40);

  await wheelScrollIn(page, scrollEl, which === "main" ? -420 : -400, 26);
  const afterUp = await scrollEl.evaluate((el) => el.scrollTop);
  expect(afterUp).toBeLessThan(mid);

  await touchLikePanScroll(page, scrollEl, -200);
  await touchLikePanScroll(page, scrollEl, 240);
  await assertBottomVisibleInScroller(page, scrollEl, which);
}

describeOrSkip("Pipeline scroll — large content (Convex + auth)", () => {
  registerWorkspaceSessionHook(test);
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
  });

  test("app <main>: mouse wheel, touch-like pan, clipping", async ({ page }) => {
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible();
    await exerciseScrollSurface(page, main, "main");

    assertClean();
    assertNoSevereErrors();
  });

  test("pipeline drawer body: wheel, pan, clipping", async ({ page }, testInfo) => {
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const envId = process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim();
    if (envId) {
      await page.goto(
        `/pipeline/${encodeURIComponent(envId)}`,
        { waitUntil: "domcontentloaded" },
      );
      await dismissMobileNavIfOpen(page);
      await waitPipelineLoaded(page);
    } else {
      const dataRow = page
        .getByTestId("pipeline-table")
        .locator("tbody tr")
        .filter({ has: page.locator("td") })
        .filter({ hasNotText: /No pipeline files yet/i })
        .first();
      const hasRow = await dataRow.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!hasRow) {
        testInfo.skip(
          true,
          "Need at least one pipeline row, or set E2E_PIPELINE_SCROLL_FILE_ID " +
            "to a pipeline file id (Convex `_id`)",
        );
      }
      await dataRow.click();
      await expect(page).toHaveURL(/\/pipeline\/[a-z0-9]+/i, { timeout: 20_000 });
    }

    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible();
    await expect(page.getByTestId("pipeline-drawer-scroll")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("pipeline-drawer-scroll").getByText("Loading…")).toHaveCount(
      0,
      { timeout: 45_000 },
    );

    await exerciseScrollSurface(page, main, "main");

    assertClean();
    assertNoSevereErrors();
  });

  test("mobile: scroll surfaces advertise correct touch-action", async ({
    page,
  }, testInfo) => {
    test.skip(
      !isMobileScrollProject(testInfo.project.name),
      "touch-action contract applies to mobile touch projects",
    );
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const mainTa = await page
      .getByTestId("app-main-scroll")
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(mainTa, "main should use vertical pan for touch scrolling").toBe("pan-y");

    const tableStripTa = await page
      .getByTestId("pipeline-table-scroll")
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(
      touchActionKeywords(tableStripTa),
      "table wrapper should allow horizontal + vertical pan routing",
    ).toEqual(new Set(["pan-x", "pan-y"]));
  });

  test("mobile: fast flick-style drag increases main scrollTop", async ({
    page,
  }, testInfo) => {
    test.skip(
      !isMobileScrollProject(testInfo.project.name),
      "gesture/flick checks run on mobile touch projects",
    );
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const main = page.getByTestId("app-main-scroll");
    await injectStressMarkup(page, main, "main");
    const overflowPx = await main.evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    expect(overflowPx, "injected stress content should overflow main").toBeGreaterThan(400);

    const before = await main.evaluate((el) => el.scrollTop);
    await touchFlickScroll(page, main, 420);
    await expect
      .poll(async () => main.evaluate((el) => el.scrollTop), {
        message: "flick or follow-on momentum should advance scrollTop",
        timeout: 5_000,
      })
      .toBeGreaterThan(before + 60);

    assertClean();
    assertNoSevereErrors();
  });

  test("mobile: main vertical scroll responds at multiple hit targets (no dead zones)", async ({
    page,
  }, testInfo) => {
    test.skip(
      !isMobileScrollProject(testInfo.project.name),
      "Sampled wheel + pan coordinates — mobile touch projects only",
    );
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const main = page.getByTestId("app-main-scroll");
    await injectStressMarkup(page, main, "main");
    const overflowPx = await main.evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    expect(overflowPx).toBeGreaterThan(500);
    await assertMainVerticalNoDeadZones(page, main);
    assertClean();
    assertNoSevereErrors();
  });

  test("mobile: pipeline table horizontal strip responds at multiple row heights", async ({
    page,
  }, testInfo) => {
    test.skip(
      !isMobileScrollProject(testInfo.project.name),
      "Horizontal drag sampling — mobile touch projects only",
    );
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const strip = page.getByTestId("pipeline-table-scroll");
    const wide = await strip.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (wide < 60) {
      testInfo.skip(true, "Viewport already fits table width; widen device or shrink window");
      return;
    }
    await assertTableStripHorizontalNoDeadZones(page, strip);
    assertClean();
    assertNoSevereErrors();
  });

  test("mobile: pipeline scroll does not toggle compact chrome", async ({
    page,
  }, testInfo) => {
    test.skip(
      !isMobileScrollProject(testInfo.project.name),
      "Pipeline native scroll — mobile touch projects only",
    );
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const main = page.getByTestId("app-main-scroll");
    const htmlCompactOn = () =>
      page.evaluate(() =>
        document.documentElement.hasAttribute("data-dlc-mobile-compact"),
      );

    await expect.poll(htmlCompactOn, { timeout: 3_000 }).toBe(false);
    await injectStressMarkup(page, main, "main");

    await wheelScrollIn(page, main, 520, 24);
    await expect
      .poll(htmlCompactOn, {
        message: "Phase 24.4B: compact chrome must stay off on pipeline hub scroll",
        timeout: 10_000,
      })
      .toBe(false);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            document.documentElement.hasAttribute("data-dlc-mobile-focus"),
          ),
        {
          message: "Phase 24.4B: focus flag must stay off on pipeline hub scroll",
          timeout: 5_000,
        },
      )
      .toBe(false);

    await wheelScrollIn(page, main, 520, 24);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const snap = (
              window as Window & {
                __PIPELINE_CHROME_DEBUG?: () => {
                  mobileFocusEnabled: boolean;
                  mobileCompactEnabled: boolean;
                  bottomNavHidden: boolean;
                  scrollListeners: number;
                  intersectionObservers: number;
                };
              }
            ).__PIPELINE_CHROME_DEBUG?.();
            return snap ?? null;
          }),
        {
          message: "Phase 24.4F: pipeline static chrome debug snapshot",
          timeout: 5_000,
        },
      )
      .toMatchObject({
        mobileFocusEnabled: false,
        mobileCompactEnabled: false,
        bottomNavHidden: false,
        scrollListeners: 0,
        intersectionObservers: 0,
      });

    const envId = process.env.E2E_PIPELINE_SCROLL_FILE_ID?.trim();
    let openedFile = false;
    if (envId) {
      await page.goto(`/pipeline/${encodeURIComponent(envId)}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissMobileNavIfOpen(page);
      await waitPipelineLoaded(page);
      openedFile = true;
    } else {
      const dataRow = page
        .getByTestId("pipeline-table")
        .locator("tbody tr")
        .filter({ has: page.locator("td") })
        .filter({ hasNotText: /No pipeline files yet/i })
        .first();
      const hasRow = await dataRow.isVisible({ timeout: 5_000 }).catch(() => false);
      if (hasRow) {
        await dataRow.click();
        await expect(page).toHaveURL(/\/pipeline\/[a-z0-9]+/i, { timeout: 20_000 });
        await waitPipelineLoaded(page);
        openedFile = true;
      }
    }

    if (openedFile) {
      const ws = page.locator("[data-mobile-workspace-chrome]").first();
      await expect(ws).toBeVisible({ timeout: 15_000 });
      await expect(ws).toHaveAttribute("data-mobile-workspace-chrome", "expanded");
      const workspaceScroll = page.getByTestId("pipeline-workspace-scroll");
      await injectStressMarkup(page, workspaceScroll, "workspace");
      await wheelScrollIn(page, workspaceScroll, 520, 24);
      await expect
        .poll(htmlCompactOn, {
          message: "Phase 24.4B: compact chrome must stay off on file workspace scroll",
          timeout: 10_000,
        })
        .toBe(false);
      await expect
        .poll(async () => ws.getAttribute("data-mobile-workspace-chrome"), {
          message: "Phase 24.4B: file header chrome stays expanded during scroll",
          timeout: 10_000,
        })
        .toBe("expanded");
    }

    assertClean();
    assertNoSevereErrors();
  });

  test("mobile: large pipeline tbody keeps scrolling smooth (no freeze)", async ({
    page,
  }, testInfo) => {
    test.skip(
      !isMobileScrollProject(testInfo.project.name),
      "Stability check — mobile touch WebKit + Chromium",
    );
    const { assertClean, assertNoSevereErrors } = attachScrollGuards(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await dismissMobileNavIfOpen(page);
    await waitPipelineLoaded(page);
    await ensureTableView(page);

    const finalRows = await inflatePipelineTableBody(page, 380);
    if (finalRows < 120) {
      testInfo.skip(
        true,
        "Need at least one real pipeline row to clone (empty table)",
      );
      return;
    }
    expect(finalRows).toBeGreaterThanOrEqual(300);

    const main = page.getByTestId("app-main-scroll");
    await main.evaluate((el) => {
      el.scrollTop = 0;
    });
    const overflowMain = await main.evaluate(
      (el) => el.scrollHeight - el.clientHeight,
    );
    expect(overflowMain).toBeGreaterThan(1600);

    const t0 = Date.now();
    await wheelScrollIn(page, main, 520, 56);
    expect(Date.now() - t0).toBeLessThan(28_000);

    const before = await main.evaluate((el) => el.scrollTop);
    await touchFlickScroll(page, main, 400);
    await expect
      .poll(async () => main.evaluate((el) => el.scrollTop), {
        message: "after large tbody, flick should still advance main scrollTop",
        timeout: 6_000,
      })
      .toBeGreaterThan(before + 40);

    assertClean();
    assertNoSevereErrors();
  });
});
