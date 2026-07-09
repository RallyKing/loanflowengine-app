/**
 * One-shot: sign in on production (cookie via /api/auth/login), then verify
 * `app-main-scroll` responds to wheel on:
 *   - /pipeline (table)
 *   - /pipeline/[fileId] (full-page file workspace)
 * Desktop Chromium, mobile Chromium (touch + wheel), and mobile WebKit (scrollBy — WebKit
 * does not support Playwright `mouse.wheel` in mobile mode).
 *
 * Reads APP_AUTH_USERNAME / APP_AUTH_PASSWORD from .env.local (same as e2e).
 *
 * Set PROD_SCROLL_BASE to the deployment URL Vercel prints (production or preview)
 * if your team alias hostname does not resolve yet, e.g.:
 *   PROD_SCROLL_BASE=https://dlcfunds.vercel.app node scripts/prod-pipeline-scroll-smoke.mjs
 *
 * Optional: PROD_PIPELINE_FILE_ID=pipelineConvexId skips opening a row from the table.
 */
import { chromium, webkit } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const k = t.slice(0, i).trim();
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

loadEnvLocal();

/** Prefer explicit URL: `vercel deploy --prod` prints the working *.vercel.app host. */
const BASE =
  process.env.PROD_SCROLL_BASE?.trim() || "https://dlcfunds.vercel.app";

async function loginCookie(page) {
  const username = process.env.APP_AUTH_USERNAME?.trim() ?? "";
  const password = process.env.APP_AUTH_PASSWORD ?? "";
  if (!username || !password) {
    throw new Error("Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD in .env.local");
  }
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const ok = await page.evaluate(
    async ({ u, p }) => {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      return r.ok;
    },
    { u: username, p: password },
  );
  if (!ok) throw new Error("Production /api/auth/login failed (check creds)");
}

async function dismissMobileNavIfOpen(page) {
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

async function waitPipelineHubReady(page) {
  await page
    .getByRole("heading", { name: /Pipeline/i })
    .waitFor({ state: "visible", timeout: 60_000 });
  await dismissMobileNavIfOpen(page);
  await page.getByText("Loading pipeline…").waitFor({ state: "detached", timeout: 45_000 });
}

/**
 * @param {{
 *   requireScrollDelta?: boolean;
 *   scrollStrategy?: "wheel" | "touch-drag" | "scrollBy";
 * }} opts
 * When `requireScrollDelta` is true (file workspace), main must scroll (overflow + wheel delta).
 * Playwright mobile WebKit does not implement `mouse.wheel`; use `scrollStrategy: "scrollBy"` (or
 * `touch-drag`, which may not move scroll on all engines).
 */
async function wheelAssertScrollPort(page, label, testId, opts = {}) {
  const requireScrollDelta = opts.requireScrollDelta ?? false;
  const scrollStrategy = opts.scrollStrategy ?? "wheel";
  const port = page.getByTestId(testId);
  await port.waitFor({ state: "visible", timeout: 15_000 });

  const metrics = await port.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  const before = metrics.scrollTop;
  const overflow = metrics.scrollHeight - metrics.clientHeight;

  await port.scrollIntoViewIfNeeded();
  const box = await port.boundingBox();
  if (!box) throw new Error(`${testId} has no bounding box`);

  const t0 = Date.now();
  if (scrollStrategy === "touch-drag") {
    for (let i = 0; i < 18; i += 1) {
      const x = box.x + Math.min(box.width, 260) / 2;
      const y0 = box.y + box.height * 0.58;
      const y1 = y0 - 320;
      await page.mouse.move(x, y0);
      await page.mouse.down();
      await page.mouse.move(x, y1, { steps: 14 });
      await page.mouse.up();
      if (i % 5 === 0) await page.waitForTimeout(12);
    }
  } else if (scrollStrategy === "scrollBy") {
    for (let i = 0; i < 24; i += 1) {
      await port.evaluate((el) => el.scrollBy(0, 420));
      if (i % 6 === 0) await page.waitForTimeout(8);
    }
  } else {
    await page.mouse.move(
      box.x + Math.min(box.width, 240),
      box.y + Math.min(box.height, 160),
    );
    for (let i = 0; i < 24; i += 1) {
      await page.mouse.wheel(0, 420);
      if (i % 6 === 0) await page.waitForTimeout(8);
    }
  }
  const elapsed = Date.now() - t0;
  if (elapsed > 25_000) {
    throw new Error(`${label}: scroll loop too slow (${elapsed}ms)`);
  }

  const after = await port.evaluate((el) => el.scrollTop);
  console.log(
    `[${label}] (${testId}) overflow=${overflow}px scrollTop ${before} → ${after} (${elapsed}ms) [${scrollStrategy}]`,
  );

  const mustMove =
    requireScrollDelta || overflow > 80;
  if (mustMove && after <= before + 15) {
    throw new Error(
      `${label}: scroll port did not move (overflow=${overflow}, requireScrollDelta=${requireScrollDelta})`,
    );
  }
}

async function scrollPipelineList(page, label, scrollOpts = {}) {
  await page.goto(`${BASE}/pipeline`, { waitUntil: "domcontentloaded" });
  await waitPipelineHubReady(page);
  await wheelAssertScrollPort(page, `${label}-list`, "app-main-scroll", {
    requireScrollDelta: false,
    ...scrollOpts,
  });
}

async function scrollPipelineFilePage(page, label, scrollOpts = {}) {
  const directId = process.env.PROD_PIPELINE_FILE_ID?.trim();
  if (directId) {
    await page.goto(`${BASE}/pipeline/${encodeURIComponent(directId)}`, {
      waitUntil: "domcontentloaded",
    });
  } else {
    await page.goto(`${BASE}/pipeline`, { waitUntil: "domcontentloaded" });
    await waitPipelineHubReady(page);

    const openBtn = page.locator('button[title="Open file"]').first();

    let hasOpen = await openBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasOpen) {
      const tableTab = page.getByRole("tab", { name: "Table" });
      if (await tableTab.isVisible().catch(() => false)) {
        await tableTab.click();
        await page.getByTestId("pipeline-table").waitFor({ state: "visible", timeout: 15_000 });
      }
      hasOpen = await openBtn.isVisible({ timeout: 20_000 }).catch(() => false);
    }

    if (!hasOpen) {
      throw new Error(
        `${label}: no pipeline files (no Open file control) — add a file or set PROD_PIPELINE_FILE_ID`,
      );
    }

    await openBtn.click({ force: true });
    await page.waitForURL(/\/pipeline\/[^/]+$/, { timeout: 45_000 });
  }

  /** Do not press Escape expecting a panel close; file view is a full page. */
  const hubOnly = new URL(page.url()).pathname === "/pipeline";
  if (hubOnly) {
    await dismissMobileNavIfOpen(page);
  }

  try {
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="deal-overview-funding-input"]') !=
          null ||
        document.querySelector('[data-testid="deal-cover-funding-input"]') != null,
      undefined,
      { timeout: 120_000 },
    );
  } catch (err) {
    const snippet = (await page.locator("body").innerText())
      .replace(/\s+/g, " ")
      .slice(0, 900);
    console.error(`[${label}] file workspace URL:`, page.url());
    console.error(`[${label}] body snippet:`, snippet);
    throw err;
  }

  const notFound = page.getByText("Pipeline file not found.");
  if (await notFound.isVisible().catch(() => false)) {
    throw new Error(`${label}: file workspace showed not-found state`);
  }

  await wheelAssertScrollPort(page, `${label}-file`, "app-main-scroll", {
    requireScrollDelta: true,
    ...scrollOpts,
  });
}

const chromiumBrowser = await chromium.launch();
const webkitBrowser = await webkit.launch();

for (const {
  name,
  viewport,
  mobile,
  deviceScaleFactor,
  engine,
  userAgent,
} of [
  {
    name: "desktop",
    viewport: { width: 1280, height: 800 },
    mobile: false,
    deviceScaleFactor: 1,
    engine: "chromium",
  },
  /** Android Chrome class: Chromium + narrow viewport + touch. */
  {
    name: "mobile-chrome",
    viewport: { width: 390, height: 844 },
    mobile: true,
    deviceScaleFactor: 2,
    engine: "chromium",
  },
  /** iPhone Safari class: WebKit + iPhone-ish viewport + touch (not a substitute for a physical device). */
  {
    name: "mobile-safari",
    viewport: { width: 390, height: 844 },
    mobile: true,
    deviceScaleFactor: 3,
    engine: "webkit",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
]) {
  const browser = engine === "webkit" ? webkitBrowser : chromiumBrowser;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    ignoreHTTPSErrors: true,
    ...(userAgent ? { userAgent } : {}),
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const scrollOpts =
    engine === "webkit" ? { scrollStrategy: "scrollBy" } : {};
  try {
    await loginCookie(page);
    await scrollPipelineList(page, name, scrollOpts);
    await scrollPipelineFilePage(page, name, scrollOpts);
  } finally {
    await context.close();
  }
}

await chromiumBrowser.close();
await webkitBrowser.close();
console.log("PROD_PIPELINE_SCROLL_OK", BASE);
