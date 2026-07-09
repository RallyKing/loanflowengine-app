/**
 * Phase 11.1 — Convex cost budget regression gate.
 * Requires workspace auth; production runs set PW_BASE_URL.
 *
 * Run:
 *   npx playwright test tests/e2e/convex-cost-budget.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import {
  ACTIVITY_COSMETIC_MAX_PER_MIN,
  FILE_IDLE_MAX_QUERY_RATE_PER_SEC,
  HUB_IDLE_MAX_QUERY_RATE_PER_SEC,
  MONTHLY_COST_BUDGET_UNITS,
  PRESENCE_MAX_WRITES_PER_MIN,
} from "@/lib/convexCostBudget";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = workspaceSessionReady();
const IDLE_MS = PROD ? 300_000 : 60_000;

type ConvexCostReport = {
  windowMs: number;
  activeSubscriptionCount: number;
  presenceWritesPerMinute: number;
  duplicateSubscriptions: Array<{ queryKey: string; count: number }>;
  mutationsPerMinute: number;
  estimatedMonthlyCostUnits: number;
  monthlyBudgetUnits: number;
  withinBudget: boolean;
  idleQueryRatePerSec: { hub: number; file: number; shell: number };
  topMutationCallers: Array<{ scope: string; name: string; count: number }>;
};

async function enableCostDebug(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as Window & {
      __FORCE_CONVEX_SUB_DEBUG__?: boolean;
      __FORCE_CONVEX_COST_DEBUG__?: boolean;
    };
    w.__FORCE_CONVEX_SUB_DEBUG__ = true;
    w.__FORCE_CONVEX_COST_DEBUG__ = true;
  });
}

async function resetCost(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as Window & { __dlcConvexCostReset?: () => void };
    w.__dlcConvexCostReset?.();
  });
}

async function readCostReport(
  page: import("@playwright/test").Page,
): Promise<ConvexCostReport | null> {
  return page.evaluate(() => {
    const w = window as Window & {
      __dlcConvexCostReport?: () => ConvexCostReport;
    };
    return w.__dlcConvexCostReport?.() ?? null;
  });
}

async function idleWait(page: import("@playwright/test").Page, ms: number) {
  await page.evaluate((durationMs) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }, ms);
}

function assertCostBudget(report: ConvexCostReport, label: string) {
  const hubRate =
    report.idleQueryRatePerSec.hub + report.idleQueryRatePerSec.shell * 0.5;
  const fileRate = report.idleQueryRatePerSec.file;

  expect(
    hubRate,
    `${label}: hub idle query rate ${hubRate.toFixed(3)}/s`,
  ).toBeLessThanOrEqual(HUB_IDLE_MAX_QUERY_RATE_PER_SEC);

  expect(
    fileRate,
    `${label}: file idle query rate ${fileRate.toFixed(3)}/s`,
  ).toBeLessThanOrEqual(FILE_IDLE_MAX_QUERY_RATE_PER_SEC);

  expect(
    report.presenceWritesPerMinute,
    `${label}: presence writes/min`,
  ).toBeLessThanOrEqual(PRESENCE_MAX_WRITES_PER_MIN + 0.05);

  const dupeCount = report.duplicateSubscriptions.reduce(
    (s, d) => s + Math.max(0, d.count - 1),
    0,
  );
  expect(dupeCount, `${label}: duplicate subscription instances`).toBe(0);

  const activityMutations = report.topMutationCallers
    .filter(
      (m) =>
        m.name.includes("activity") ||
        m.scope.includes("Activity") ||
        m.name === "record",
    )
    .reduce((s, m) => s + m.count, 0);
  const activityPerMin =
    (activityMutations / Math.max(1, report.windowMs)) * 60_000;
  expect(
    activityPerMin,
    `${label}: activity cosmetic mutations/min`,
  ).toBeLessThanOrEqual(ACTIVITY_COSMETIC_MAX_PER_MIN);

  expect(
    report.estimatedMonthlyCostUnits,
    `${label}: estimated monthly cost units`,
  ).toBeLessThanOrEqual(MONTHLY_COST_BUDGET_UNITS);
  expect(report.withinBudget, `${label}: withinBudget flag`).toBe(true);
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Convex cost budget (Phase 11.1)", () => {
  test.setTimeout(Math.max(420_000, IDLE_MS + 120_000));

  test.beforeEach(async ({ page }) => {
    await enableCostDebug(page);
  });

  test("hub idle stays within query + presence + cost budgets", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 60_000,
    });
    await resetCost(page);
    await idleWait(page, IDLE_MS);
    const report = await readCostReport(page);
    expect(report).not.toBeNull();
    test.info().attach("hub-cost-report.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log("[convex-cost hub]", {
      idleMs: IDLE_MS,
      hubRate: report!.idleQueryRatePerSec.hub,
      subs: report!.activeSubscriptionCount,
      presencePerMin: report!.presenceWritesPerMinute,
      monthly: report!.estimatedMonthlyCostUnits,
    });
    assertCostBudget(report!, "hub-idle");
  });

  test("file workspace idle stays within budgets", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: 60_000,
    });
    const row = page.getByTestId("pipeline-table").locator("tbody tr").first();
    const hasRow = await row.isVisible().catch(() => false);
    test.skip(!hasRow, "No pipeline rows — cannot open file workspace");
    await row.click();
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
    await resetCost(page);
    await idleWait(page, IDLE_MS);
    const report = await readCostReport(page);
    expect(report).not.toBeNull();
    test.info().attach("file-cost-report.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log("[convex-cost file]", {
      idleMs: IDLE_MS,
      fileRate: report!.idleQueryRatePerSec.file,
      subs: report!.activeSubscriptionCount,
      presencePerMin: report!.presenceWritesPerMinute,
    });
    assertCostBudget(report!, "file-idle");
  });

  test("operator API exposes cost report", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof window.__dlcConvexCostReport === "function",
      undefined,
      { timeout: 30_000 },
    );
    const snapshot = await readCostReport(page);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.monthlyBudgetUnits).toBe(MONTHLY_COST_BUDGET_UNITS);
    expect(Array.isArray(snapshot!.duplicateSubscriptions)).toBe(true);
  });
});
