/**
 * Phase 13.1 — /shared idle query budget (no polling, no idle mutations).
 */
import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = workspaceSessionReady();
const IDLE_MS = PROD ? 90_000 : 45_000;
const MAX_IDLE_QUERY_RATE = 1.0;

type ConvexCostReport = {
  activeSubscriptionCount: number;
  mutationsPerMinute: number;
  duplicateSubscriptions: Array<{ queryKey: string; count: number }>;
  idleQueryRatePerSec: { hub: number; file: number; shell: number };
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

test.describe("Shared workspace idle budget", () => {
  test.skip(!RUN, "Requires workspace auth env");

  test("idle /shared stays under query budget with zero mutations", async ({
    page,
  }) => {
    await enableCostDebug(page);
    await signInWorkspaceSession(page);
    await page.goto("/shared", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Shared$/i })).toBeVisible({
      timeout: 60_000,
    });
    await resetCost(page);
    await idleWait(page, IDLE_MS);
    const report = await readCostReport(page);
    expect(report, "cost report available").not.toBeNull();
    if (!report) return;

    const subs = report.activeSubscriptionCount;
    const windowSec = IDLE_MS / 1000;
    const approxRate = subs / windowSec;

    expect(
      report.mutationsPerMinute,
      "idle mutations on /shared",
    ).toBeLessThanOrEqual(0.5);
    expect(approxRate, "idle query rate /shared").toBeLessThanOrEqual(
      MAX_IDLE_QUERY_RATE,
    );
    expect(
      report.duplicateSubscriptions.filter((d) => d.count > 1),
      "duplicate subscriptions",
    ).toHaveLength(0);
  });
});
