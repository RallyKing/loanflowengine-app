/**
 * One-off Phase 25.11 layout probe (investigation only).
 * Usage: node scripts/phase25-11-layout-probe.mjs
 * Env: PW_BASE_URL (default https://dlcfunds.vercel.app), auth via .env.local
 */
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const envPath = join(repoRoot, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const baseURL =
  process.env.PW_BASE_URL?.trim() || "https://dlcfunds.vercel.app";
const username =
  process.env.APP_AUTH_USERNAME?.trim() ||
  process.env.APP_AUTH_PRIMARY_EMAIL?.trim() ||
  "";
const password =
  process.env.APP_AUTH_PASSWORD || process.env.APP_AUTH_PRIMARY_PASSWORD || "";

const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function signIn(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  const origin = new URL(page.url()).origin;
  const res = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: origin },
  });
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`);
  }
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

async function probeViewport(page, vp) {
  await page.setViewportSize(vp);
  await page.goto(`${baseURL}/pipeline`, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector("[data-pipeline-page-root]", { timeout: 90_000 })
    .catch(() => null);
  await page.waitForTimeout(2000);

  const boardTab = page.getByRole("tab", { name: "Board" });
  const boardVisible = await boardTab.isVisible().catch(() => false);
  if (boardVisible) {
    await boardTab.click();
    await page.waitForTimeout(800);
  }

  return page.evaluate(() => {
    const sel = (s) => document.querySelector(s);
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const cs = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        position: s.position,
        top: s.top,
        zIndex: s.zIndex,
        display: s.display,
        overflow: s.overflow,
        overflowY: s.overflowY,
        height: s.height,
        minHeight: s.minHeight,
        flex: s.flex,
        flexDirection: s.flexDirection,
        transform: s.transform,
        marginTop: s.marginTop,
      };
    };

    const pageRoot = sel("[data-pipeline-page-root]");
    const filterCard = sel(
      "[data-pipeline-page-root] .rounded-xl.border",
    );
    const toolbar = sel("[data-pipeline-page-root] .relative.z-10.shrink-0");
    const contentReveal = pageRoot?.querySelector(".flex.min-w-0.max-w-full.flex-col");
    const boardScroll = sel('[data-testid="pipeline-board-scroll"]');
    const boardHeader = boardScroll?.querySelector("section header");
    const firstColumn = boardScroll?.querySelector("section");
    const orientation = sel('[data-testid="pipeline-hub-orientation"]');
    const main = sel("[data-app-main-scroll]");

    const toolbarR = rect(toolbar);
    const boardHeaderR = rect(boardHeader);
    const boardScrollR = rect(boardScroll);

    let verticalGap = null;
    let headerOverlapPx = 0;
    if (toolbarR && boardHeaderR) {
      verticalGap = boardHeaderR.top - toolbarR.bottom;
      const oa = Math.max(
        0,
        Math.min(toolbarR.bottom, boardHeaderR.bottom) -
          Math.max(toolbarR.top, boardHeaderR.top),
      );
      const ow = Math.max(
        0,
        Math.min(toolbarR.right, boardHeaderR.right) -
          Math.max(toolbarR.left, boardHeaderR.left),
      );
      headerOverlapPx = Math.round(oa * ow);
    }

    let boardUnderToolbar = false;
    if (toolbarR && boardScrollR) {
      boardUnderToolbar = boardScrollR.top < toolbarR.bottom - 2;
    }

    return {
      htmlAttrs: {
        nativeDocumentScroll: document.documentElement.hasAttribute(
          "data-native-document-scroll",
        ),
        masterLayoutLock: document.documentElement.hasAttribute(
          "data-pipeline-master-layout-lock",
        ),
      },
      boardViewRendered: !!boardScroll,
      effectiveViewHint: boardScroll ? "board" : "table-or-loading",
      rects: {
        pageRoot: rect(pageRoot),
        filterCard: rect(filterCard),
        toolbar: toolbarR,
        orientation: rect(orientation),
        boardScroll: boardScrollR,
        boardHeader: boardHeaderR,
        firstColumn: rect(firstColumn),
      },
      computed: {
        main: cs(main),
        pageRoot: cs(pageRoot),
        filterCard: cs(filterCard),
        toolbar: cs(toolbar),
        orientation: cs(orientation),
        boardScroll: cs(boardScroll),
        boardHeader: cs(boardHeader),
      },
      layout: {
        verticalGapToolbarToBoardHeader: verticalGap,
        boardHeaderOverlapAreaPx: headerOverlapPx,
        boardScrollTopBeforeToolbarBottom: boardUnderToolbar,
      },
    };
  });
}

async function main() {
  if (!username || !password) {
    console.error("Missing APP_AUTH_USERNAME / APP_AUTH_PASSWORD in .env.local");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page);

  const results = [];
  for (const vp of VIEWPORTS) {
    try {
      const data = await probeViewport(page, vp);
      results.push({ viewport: vp, ok: true, ...data });
    } catch (e) {
      results.push({
        viewport: vp,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(JSON.stringify({ baseURL, results }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
