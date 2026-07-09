/**
 * P0 — Pipeline file idle write budget (write storm regression gate).
 * Requires workspace auth; production runs set PW_BASE_URL.
 *
 * Run:
 *   npx playwright test tests/e2e/pipeline-idle-write-budget.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import {
  FILE_IDLE_MAX_WRITES_PER_MIN,
  PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES,
} from "@/lib/convexCostBudget";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = workspaceSessionReady();
/** Full 5-minute soak in prod; shortened locally for dev feedback. */
const IDLE_MS = PROD ? 300_000 : 90_000;

type WriteStormReport = {
  windowMs: number;
  writesPerMinute: number;
  totalWrites: number;
  idleViolationCount: number;
  byMutation: Array<{ mutation: string; count: number }>;
  byScope: Array<{ scope: string; count: number }>;
  duplicateCallers: Array<{ key: string; count: number; scopes: string[] }>;
  exceedsFileIdleBudget: boolean;
  fileIdleBudgetPerMin: number;
};

async function enableWriteStormDebug(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as Window & { __FORCE_WRITE_STORM_DEBUG__?: boolean };
    w.__FORCE_WRITE_STORM_DEBUG__ = true;
  });
}

async function resetWriteStorm(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as Window & { __dlcWriteStormReset?: () => void };
    w.__dlcWriteStormReset?.();
  });
}

async function readWriteStormReport(
  page: import("@playwright/test").Page,
): Promise<WriteStormReport | null> {
  return page.evaluate(() => {
    const w = window as Window & {
      __dlcWriteStormReport?: () => WriteStormReport;
    };
    return w.__dlcWriteStormReport?.() ?? null;
  });
}

async function idleWait(page: import("@playwright/test").Page, ms: number) {
  await page.evaluate((durationMs) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }, ms);
}

function mutationCount(report: WriteStormReport, needle: string): number {
  return report.byMutation
    .filter((m) => m.mutation.includes(needle))
    .reduce((s, m) => s + m.count, 0);
}

function assertIdleWriteBudget(report: WriteStormReport, label: string) {
  const maxTotal = PROD
    ? PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES
    : PIPELINE_FILE_IDLE_MAX_TOTAL_WRITES + 1;

  expect(
    report.totalWrites,
    `${label}: total idle writes (max ${maxTotal})`,
  ).toBeLessThanOrEqual(maxTotal);

  expect(
    report.writesPerMinute,
    `${label}: writes/min (budget ${FILE_IDLE_MAX_WRITES_PER_MIN})`,
  ).toBeLessThanOrEqual(FILE_IDLE_MAX_WRITES_PER_MIN + 0.05);

  const patchDeal = mutationCount(report, "patchDeal");
  expect(patchDeal, `${label}: patchDeal count`).toBeLessThanOrEqual(1);

  const activity = mutationCount(report, "activity");
  const appendPipeline = mutationCount(report, "appendPipeline");
  expect(
    activity + appendPipeline,
    `${label}: activity / appendPipeline mutations`,
  ).toBe(0);

  const drawerLayout = mutationCount(report, "patchFileDrawerLayout");
  expect(
    drawerLayout,
    `${label}: patchFileDrawerLayout count`,
  ).toBeLessThanOrEqual(1);

  const presence = mutationCount(report, "presence.");
  expect(
    presence,
    `${label}: presence mutation count (registration + optional heartbeat)`,
  ).toBeLessThanOrEqual(2);
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Pipeline file idle write budget (P0)", () => {
  test.setTimeout(Math.max(420_000, IDLE_MS + 120_000));

  test.beforeEach(async ({ page }) => {
    await enableWriteStormDebug(page);
  });

  test("open file and idle — zero background write storm", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 60_000,
    });

    const openLink = page.getByRole("link", { name: /^Open file /i }).first();
    const hasLink = await openLink.isVisible().catch(() => false);
    if (hasLink) {
      await openLink.click();
    } else {
      const row = page.getByTestId("pipeline-table").locator("tbody tr").first();
      test.skip(!(await row.isVisible().catch(() => false)), "No pipeline rows");
      await row.click();
    }
    await expect(
      page
        .locator("[data-pipeline-workspace-scroll]")
        .or(page.getByTestId("pipeline-file-not-found")),
    ).toBeVisible({ timeout: 45_000 });

    const notFound = await page
      .getByTestId("pipeline-file-not-found")
      .isVisible()
      .catch(() => false);
    test.skip(notFound, "File route returned not-found");

    await page.waitForFunction(
      () => typeof window.__dlcWriteStormReport === "function",
      undefined,
      { timeout: 30_000 },
    );

    await resetWriteStorm(page);
    await idleWait(page, IDLE_MS);

    const report = await readWriteStormReport(page);
    expect(report).not.toBeNull();

    test.info().attach("pipeline-idle-write-storm.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    console.log("[pipeline-idle-write-budget]", {
      idleMs: IDLE_MS,
      totalWrites: report!.totalWrites,
      writesPerMinute: report!.writesPerMinute.toFixed(3),
      byMutation: report!.byMutation.slice(0, 8),
      idleViolations: report!.idleViolationCount,
    });

    assertIdleWriteBudget(report!, "file-idle-soak");
  });

  test("write storm report API is exposed", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof window.__dlcWriteStormReport === "function",
      undefined,
      { timeout: 30_000 },
    );
    const snapshot = await readWriteStormReport(page);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.fileIdleBudgetPerMin).toBe(FILE_IDLE_MAX_WRITES_PER_MIN);
  });
});
