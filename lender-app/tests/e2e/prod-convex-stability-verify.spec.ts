/**
 * Production Convex + live-pill stabilization verification.
 * Requires PW_BASE_URL (e.g. https://dlcfunds.vercel.app) + workspace auth creds.
 *
 * Run:
 *   PW_BASE_URL=https://dlcfunds.vercel.app npx playwright test tests/e2e/prod-convex-stability-verify.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = PROD && workspaceSessionReady();

type ForensicsReport = {
  windowMs: number;
  pillFlips: number;
  presenceHeartbeats: number;
  mutations: number;
  queryArgChurn: number;
  perMinute: {
    subsCreate: number;
    mutations: number;
    pillFlips: number;
    heartbeats: number;
    renders: number;
  };
  ranked: Array<{ bucket: string; event: string; count: number }>;
};

type PillSample = {
  t: number;
  hubState: string | null;
  hubActivity: string | null;
};

async function resetDiag(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as Window & { __dlcConvexSubDiag?: { reset(): void } };
    w.__dlcConvexSubDiag?.reset();
  });
}

async function readDiag(page: import("@playwright/test").Page): Promise<ForensicsReport | null> {
  return page.evaluate(() => {
    const w = window as Window & {
      __dlcConvexSubDiag?: { getReport(): ForensicsReport };
    };
    return w.__dlcConvexSubDiag?.getReport() ?? null;
  });
}

async function samplePillFlips(
  page: import("@playwright/test").Page,
  durationMs: number,
  intervalMs = 400,
): Promise<{ flips: number; samples: PillSample[] }> {
  return page.evaluate(
    async ({ durationMs, intervalMs }) => {
      const samples: PillSample[] = [];
      const read = () => {
        const el = document.querySelector("[data-hub-state]");
        return {
          t: Date.now(),
          hubState: el?.getAttribute("data-hub-state") ?? null,
          hubActivity: el?.getAttribute("data-hub-activity") ?? null,
        };
      };
      let prev = "";
      let flips = 0;
      const end = Date.now() + durationMs;
      while (Date.now() < end) {
        const s = read();
        samples.push(s);
        const key = `${s.hubState}|${s.hubActivity}`;
        if (prev && prev !== key) flips += 1;
        prev = key;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return { flips, samples };
    },
    { durationMs, intervalMs },
  );
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Production Convex stability (PW_BASE_URL)", () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (
        window as Window & { __FORCE_CONVEX_SUB_DEBUG__?: boolean }
      ).__FORCE_CONVEX_SUB_DEBUG__ = true;
    });
  });

  test("B — pipeline hub idle 60s metrics", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 60_000,
    });
    await resetDiag(page);
    const pill = await samplePillFlips(page, 60_000);
    const report = await readDiag(page);
    expect(report).not.toBeNull();
    test.info().attach("hub-idle-diag.json", {
      body: JSON.stringify({ report, pill }, null, 2),
      contentType: "application/json",
    });
    console.log("[prod-verify hub idle]", {
      pillFlipsPerMin: (pill.flips / 1).toFixed(2),
      heartbeatsPerMin: report?.perMinute.heartbeats,
      mutationsPerMin: report?.perMinute.mutations,
      queryArgChurn: report?.queryArgChurn,
      top: report?.ranked.slice(0, 6),
    });
    expect(pill.flips).toBeLessThan(8);
    expect(report!.perMinute.heartbeats).toBeLessThan(2);
    expect(report!.perMinute.mutations).toBeLessThan(6);
    expect(report!.queryArgChurn).toBeLessThan(15);
  });

  test("C — pipeline file idle 60s metrics", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 60_000,
    });
    const row = page.getByTestId("pipeline-table").locator("tbody tr").first();
    const hasRow = await row.isVisible().catch(() => false);
    test.skip(!hasRow, "No pipeline rows in prod — cannot open file workspace");
    await row.click();
    await expect(
      page.locator("[data-pipeline-workspace-scroll]").or(
        page.getByTestId("pipeline-file-not-found"),
      ),
    ).toBeVisible({ timeout: 45_000 });
    const notFound = await page.getByTestId("pipeline-file-not-found").isVisible().catch(() => false);
    test.skip(notFound, "File route returned not-found");
    await resetDiag(page);
    const pill = await samplePillFlips(page, 60_000);
    const report = await readDiag(page);
    test.info().attach("file-idle-diag.json", {
      body: JSON.stringify({ report, pill }, null, 2),
      contentType: "application/json",
    });
    console.log("[prod-verify file idle]", {
      pillFlipsPerMin: pill.flips,
      heartbeatsPerMin: report?.perMinute.heartbeats,
      mutationsPerMin: report?.perMinute.mutations,
      top: report?.ranked.slice(0, 8),
    });
    expect(pill.flips).toBeLessThan(10);
    expect(report!.perMinute.heartbeats).toBeLessThan(2);
  });

  test("4 — background tab: no hidden write spam", async ({ context }) => {
    const hub = await context.newPage();
    const file = await context.newPage();
    await hub.addInitScript(() => {
      (
        window as Window & { __FORCE_CONVEX_SUB_DEBUG__?: boolean }
      ).__FORCE_CONVEX_SUB_DEBUG__ = true;
    });
    await file.addInitScript(() => {
      (
        window as Window & { __FORCE_CONVEX_SUB_DEBUG__?: boolean }
      ).__FORCE_CONVEX_SUB_DEBUG__ = true;
    });
    await hub.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(hub);
    await file.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(file);
    await file.goto("/pipeline", { waitUntil: "domcontentloaded" });
    const row = file.getByTestId("pipeline-table").locator("tbody tr").first();
    test.skip(!(await row.isVisible().catch(() => false)), "No pipeline file");
    await row.click();
    await expect(file.locator("[data-pipeline-workspace-scroll]")).toBeVisible({
      timeout: 45_000,
    });
    await resetDiag(file);
    await hub.bringToFront();
    await hub.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await hub.waitForTimeout(90_000);
    const report = await readDiag(file);
    test.info().attach("background-tab-diag.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log("[prod-verify background tab]", {
      heartbeats: report?.presenceHeartbeats,
      mutations: report?.mutations,
      perMin: report?.perMinute,
    });
    expect(report!.presenceHeartbeats).toBeLessThan(3);
    expect(report!.mutations).toBeLessThan(5);
  });
});
