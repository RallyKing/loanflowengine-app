import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexOk(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexOk() ? test.describe : test.describe.skip;

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

describeOrSkip("Convex subscription churn forensics", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!workspaceSessionReady());
    await page.addInitScript(() => {
      (window as Window & { __FORCE_CONVEX_SUB_DEBUG__?: boolean }).__FORCE_CONVEX_SUB_DEBUG__ =
        true;
    });
  });

  test("pipeline hub idle — measure pill + subscription churn", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    const main = page.getByTestId("app-main-scroll");
    await expect(main).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByRole("heading", { name: /Pipeline/i }).or(page.locator("[data-testid='pipeline-hub']")),
    ).toBeVisible({ timeout: 45_000 });

    await page.evaluate(() => {
      const w = window as Window & {
        __dlcConvexSubDiag?: { reset(): void };
      };
      w.__dlcConvexSubDiag?.reset();
    });

    await page.waitForTimeout(65_000);

    const report = await page.evaluate(() => {
      const w = window as Window & {
        __dlcConvexSubDiag?: { getReport(): ForensicsReport };
      };
      return w.__dlcConvexSubDiag?.getReport() ?? null;
    });

    expect(report, "convex diagnostics global missing — is debug instrumentation loaded?").not.toBeNull();

    test.info().attach("convex-churn-report-hub.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });

    console.log("[forensics hub]", JSON.stringify(report?.perMinute, null, 2));
    console.log("[forensics hub top]", report?.ranked?.slice(0, 8));

    expect(report!.pillFlips).toBeLessThan(12);
    expect(report!.perMinute.heartbeats).toBeLessThan(2);
    expect(report!.perMinute.mutations).toBeLessThan(8);
    expect(report!.queryArgChurn).toBeLessThan(20);
  });
});
