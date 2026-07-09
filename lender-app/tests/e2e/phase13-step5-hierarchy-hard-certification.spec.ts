/**
 * Phase 13.3 Step 5 — hierarchy hard certification (production browser proof).
 *
 * Run:
 *   PW_BASE_URL=https://dlcfunds.vercel.app PLAYWRIGHT_USE_PRIMARY_AUTH=1 \
 *   npx playwright test tests/e2e/phase13-step5-hierarchy-hard-certification.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
  playwrightLoginCredentials,
} from "../helpers/workspace-auth";
import {
  HUB_IDLE_MAX_QUERY_RATE_PER_SEC,
  HUB_IDLE_MAX_QUERY_SUBS,
  HUB_IDLE_MAX_TOTAL_WRITES,
  HUB_IDLE_MAX_WRITES_PER_MIN,
} from "@/lib/convexCostBudget";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = workspaceSessionReady();
const HUB_IDLE_MS = PROD ? 300_000 : 90_000;

type WriteStormReport = {
  windowMs: number;
  writesPerMinute: number;
  totalWrites: number;
  byMutation: Array<{ mutation: string; count: number }>;
};

type ConvexCostReport = {
  windowMs: number;
  activeSubscriptionCount: number;
  activeSubscriptions: Array<{ queryKey: string; scope: string }>;
  duplicateSubscriptions: Array<{ queryKey: string; count: number }>;
  idleQueryRatePerSec: { hub: number; file: number; shell: number };
  mutationsPerMinute: number;
};

async function enableDebug(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as Window & {
      __FORCE_WRITE_STORM_DEBUG__?: boolean;
      __FORCE_CONVEX_SUB_DEBUG__?: boolean;
      __FORCE_CONVEX_COST_DEBUG__?: boolean;
    };
    w.__FORCE_WRITE_STORM_DEBUG__ = true;
    w.__FORCE_CONVEX_SUB_DEBUG__ = true;
    w.__FORCE_CONVEX_COST_DEBUG__ = true;
  });
}

async function idleWait(page: import("@playwright/test").Page, ms: number) {
  await page.evaluate((durationMs) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }, ms);
}

async function readWriteStorm(
  page: import("@playwright/test").Page,
): Promise<WriteStormReport | null> {
  return page.evaluate(() => {
    const w = window as Window & {
      __dlcWriteStormReport?: () => WriteStormReport;
    };
    return w.__dlcWriteStormReport?.() ?? null;
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

async function resetMetrics(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as Window & {
      __dlcWriteStormReset?: () => void;
      __dlcConvexCostReset?: () => void;
    };
    w.__dlcWriteStormReset?.();
    w.__dlcConvexCostReset?.();
  });
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Phase 13.3 Step 5 hierarchy hard certification", () => {
  test.setTimeout(Math.max(480_000, HUB_IDLE_MS + 180_000));

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await enableDebug(page);
  });

  test("Joshua — hub hierarchy expand/collapse + persistence", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });

    const clientSection = page.getByTestId("pipeline-hub-client").first();
    await expect(clientSection).toBeVisible({ timeout: 30_000 });
    await clientSection.getByRole("button").first().click();
    await clientSection.getByRole("button").nth(1).click();
    await expect(clientSection.locator("[data-pipeline-row]").first()).toBeVisible({
      timeout: 15_000,
    });

    const expansionRaw = await page.evaluate(() =>
      localStorage.getItem("dlc.pipeline.hub.hierarchy.expansion.v1"),
    );
    expect(expansionRaw).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });
    const afterReload = await page.evaluate(() =>
      localStorage.getItem("dlc.pipeline.hub.hierarchy.expansion.v1"),
    );
    expect(afterReload).toBe(expansionRaw);
  });

  test("Joshua — create client + project + loan appears in hub", async ({
    page,
  }) => {
    const stamp = Date.now();
    const clientName = `Cert Client ${stamp}`;
    const projectTitle = `Cert Project ${stamp}`;
    const loanName = `Cert Loan ${stamp}`;

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });

    await page.locator("summary").filter({ hasText: "New" }).click();
    await page.getByRole("button", { name: /New client \+ project \+ loan/i }).click();

    await page.locator("#hier-client-name").fill(clientName);
    await page.locator("#hier-project-title").fill(projectTitle);
    await page.locator("#hier-file-name").fill(loanName);
    await page.locator("#hier-funding").fill("250000");
    await page.locator("#hier-rate").fill("8");
    await page.locator("#hier-term").fill("12");
    await page.getByRole("button", { name: /^Create$/i }).click();

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });

    const createdClient = page
      .getByTestId("pipeline-hub-client")
      .filter({ hasText: clientName });
    await expect(createdClient).toBeVisible({ timeout: 45_000 });
    await createdClient.getByRole("button").first().click();
    await createdClient.getByRole("button", { name: projectTitle }).click();
    await expect(
      createdClient.locator("[data-pipeline-row]", { hasText: loanName }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Joshua — global search grouped + breadcrumb navigation", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });

    await page.keyboard.press("Control+k");
    const searchInput = page.getByRole("textbox", { name: /search query/i });
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill("Cert Loan");
    await expect(page.getByTestId("global-search-results")).toBeVisible({
      timeout: 20_000,
    });

    const firstHit = page.locator('[data-testid="global-search-results"] button').first();
    await firstHit.click();

    await expect(
      page.getByTestId("pipeline-workspace-hierarchy-breadcrumb"),
    ).toBeVisible({ timeout: 45_000 });

    const breadcrumb = page.getByTestId("pipeline-workspace-hierarchy-breadcrumb");
    const clientLink = breadcrumb.getByRole("link").first();
    await clientLink.click();
    await expect(page).toHaveURL(/\/pipeline\/client\//, { timeout: 15_000 });
    await expect(page.getByTestId("pipeline-client-workspace-shell")).toBeVisible();
  });

  test("Joshua — hub idle write budget (5 min)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => typeof window.__dlcWriteStormReport === "function",
      undefined,
      { timeout: 30_000 },
    );
    await resetMetrics(page);
    await idleWait(page, HUB_IDLE_MS);
    const report = await readWriteStorm(page);
    expect(report).not.toBeNull();
    test.info().attach("hub-idle-write-storm.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    expect(report!.totalWrites).toBeLessThanOrEqual(HUB_IDLE_MAX_TOTAL_WRITES);
    expect(report!.writesPerMinute).toBeLessThanOrEqual(
      HUB_IDLE_MAX_WRITES_PER_MIN + 0.05,
    );
  });

  test("Joshua — board view project grouping", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });
    const boardTab = page.getByRole("tab", { name: /^Board$/i });
    await expect(boardTab).toBeVisible({ timeout: 30_000 });
    await boardTab.click();
    await expect(page.getByTestId("pipeline-board-project-group").first()).toBeVisible({
      timeout: 90_000,
    });
  });

  test("Joshua — hub performance single subscription", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pipeline-hub-hierarchy-shell")).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => typeof window.__dlcConvexCostReport === "function",
      undefined,
      { timeout: 30_000 },
    );
    await resetMetrics(page);
    await idleWait(page, PROD ? 60_000 : 30_000);
    const report = await readCostReport(page);
    expect(report).not.toBeNull();
    test.info().attach("hub-performance-cost.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    expect(report!.activeSubscriptionCount).toBeLessThanOrEqual(
      HUB_IDLE_MAX_QUERY_SUBS,
    );
    expect(report!.duplicateSubscriptions.every((d) => d.count <= 1)).toBe(
      true,
    );
    const hubPipelineSubs = report!.activeSubscriptions.filter(
      (s) =>
        s.scope.includes("Pipeline") ||
        s.queryKey.includes("pipeline") ||
        s.queryKey.includes("listTable"),
    );
    expect(hubPipelineSubs.length).toBeLessThanOrEqual(3);
    const hubRate =
      report!.idleQueryRatePerSec.hub +
      report!.idleQueryRatePerSec.shell * 0.5;
    expect(hubRate).toBeLessThanOrEqual(HUB_IDLE_MAX_QUERY_RATE_PER_SEC);
  });
});

describeOrSkip("Phase 13.3 Step 5 — eballard ACL banners (secondary)", () => {
  test("eballard view-only banner on shared file", async ({ browser }) => {
    test.skip(
      true,
      "Browser eballard login requires EBALLARD_TEST_PASSWORD; ACL proven via Convex operator certification.",
    );
    const eballardPass =
      process.env.EBALLARD_TEST_PASSWORD?.trim() ||
      process.env.E2E_PASS_LOAN_OFFICER?.trim();

    const joshua = playwrightLoginCredentials();
    test.skip(!joshua, "Joshua credentials missing");

    const joshuaContext = await browser.newContext();
    const joshuaPage = await joshuaContext.newPage();
    await enableDebug(joshuaPage);
    await joshuaPage.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(joshuaPage);
    await joshuaPage.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(
      joshuaPage.getByTestId("pipeline-hub-hierarchy-shell"),
    ).toBeVisible({ timeout: 60_000 });

    const client = joshuaPage.getByTestId("pipeline-hub-client").first();
    await client.getByRole("button").first().click();
    await client.getByRole("button").nth(1).click();
    await client.locator("[data-pipeline-row]").first().click();
    await expect(joshuaPage.locator("[data-pipeline-workspace-scroll]")).toBeVisible({
      timeout: 45_000,
    });
    const fileUrl = joshuaPage.url();

    const eballardContext = await browser.newContext();
    const ePage = await eballardContext.newPage();
    await ePage.goto("/login", { waitUntil: "domcontentloaded" });
    await ePage.getByLabel(/email|username/i).fill("joshuaeballard@gmail.com");
    await ePage.getByLabel(/password/i).fill(eballardPass!);
    await ePage.getByRole("button", { name: /sign in/i }).click();
    await ePage.waitForURL(/\/(pipeline|tasks)/, { timeout: 60_000 });

    await ePage.goto(fileUrl, { waitUntil: "domcontentloaded" });
    const viewBanner = ePage.locator('[data-resource-read-only="true"]');
    const hasViewOnly =
      (await viewBanner.isVisible().catch(() => false)) ||
      (await ePage.getByText(/view only|shared/i).first().isVisible().catch(() => false));
    expect(hasViewOnly).toBeTruthy();

    await joshuaContext.close();
    await eballardContext.close();
  });
});
