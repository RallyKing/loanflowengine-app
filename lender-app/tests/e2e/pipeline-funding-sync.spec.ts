import { test, expect, type Page } from "@playwright/test";
import { registerWorkspaceSessionHook, signInWorkspaceSession, workspaceSessionReady } from "../helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

/** Autosave debounce is up to 1200ms (relaxed) + Convex round-trip. */
const FUNDING_SYNC_TIMEOUT = 35_000;

function attachConvexFailureGuards(page: Page): { assertClean: () => void } {
  const messages: string[] = [];
  page.on("pageerror", (err) => {
    messages.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      messages.push(`console: ${msg.text()}`);
    }
  });
  return {
    assertClean: () => {
      const bad = messages.filter((m) =>
        /could not find.*function|function not found|query.*not found|mutation.*not found|\[CONVEX/i.test(
          m
        )
      );
      expect(
        bad,
        `Expected no Convex missing-function style errors; got:\n${bad.join("\n")}`
      ).toEqual([]);
    },
  };
}

function moneyRegexForInteger(n: number): RegExp {
  const s = n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\$${escaped}`);
}

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

async function goToPipelineTable(page: Page) {
  await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
    timeout: 30_000,
  });
  await waitPipelineLoaded(page);
  await ensureTableView(page);
}

function fundingButtonForRow(page: Page, rowMarker: string) {
  const row = page.locator("tr", { hasText: rowMarker });
  return row.getByRole("button", {
    name: new RegExp(`Funding amount for .*${rowMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  });
}

async function createPipelineFile(
  page: Page,
  opts: { client: string; project: string; funding: string }
) {
  await page.getByRole("button", { name: "New file" }).click();
  await expect(
    page.getByRole("heading", { name: "New pipeline file" })
  ).toBeVisible();
  await page.getByLabel(/Project name/i).fill(opts.project);
  await page.locator("#new-pipeline-loan").fill(opts.funding);
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByPlaceholder("Role (client, referral, etc.)").fill("client");
  await dialog.getByPlaceholder("Name").fill(opts.client);
  await page.getByRole("button", { name: "Create and open deal" }).click();
  await expect(page).toHaveURL(/\/pipeline\/[^/?]+/, { timeout: 45_000 });
  await expect(page.getByTestId("deal-overview-funding-input")).toBeVisible({
    timeout: 45_000,
  });
}

async function expectTableFunding(
  page: Page,
  rowMarker: string,
  amount: number
) {
  const returnUrl = page.url();
  const onDealPage = /^\/pipeline\/[^/]+$/.test(new URL(returnUrl).pathname);

  await goToPipelineTable(page);

  const btn = fundingButtonForRow(page, rowMarker);
  await expect(btn).toHaveText(moneyRegexForInteger(amount), {
    timeout: FUNDING_SYNC_TIMEOUT,
  });

  if (onDealPage) {
    await page.goto(returnUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("deal-overview-funding-input")).toBeVisible({
      timeout: 30_000,
    });
  }
}

describeOrSkip("Pipeline funding amount ↔ file workspace (Convex)", () => {
  registerWorkspaceSessionHook(test);

  test.beforeEach(async ({ page }, testInfo) => {
    if (!workspaceSessionReady()) {
      testInfo.skip(true, "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD");
    }
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
      timeout: 30_000,
    });
    await waitPipelineLoaded(page);
    await ensureTableView(page);
  });

  test("Overview and Cover edits stay in sync with the pipeline table", async ({
    page,
  }) => {
    const { assertClean } = attachConvexFailureGuards(page);
    const marker = `FA${Date.now()}`;
    const client = "E2E";
    const project = marker;

    await createPipelineFile(page, {
      client,
      project,
      funding: "275000",
    });

    await expectTableFunding(page, marker, 275_000);

    const overviewInput = page.getByTestId("deal-overview-funding-input");
    await overviewInput.scrollIntoViewIfNeeded();
    await expect(overviewInput).toBeVisible({ timeout: 30_000 });
    await overviewInput.fill("401250");
    await overviewInput.blur();

    await expectTableFunding(page, marker, 401_250);

    await page.locator("#deal-workspace-cover").scrollIntoViewIfNeeded();
    const coverInput = page.getByTestId("deal-cover-funding-input");
    await expect(coverInput).toBeVisible({ timeout: 15_000 });
    await coverInput.fill("515999");
    await coverInput.blur();

    await expect(overviewInput).toHaveValue("515999", {
      timeout: FUNDING_SYNC_TIMEOUT,
    });
    await expectTableFunding(page, marker, 515_999);

    assertClean();
  });

  test("clearing Overview funding after a saved amount updates the pipeline table", async ({
    page,
  }) => {
    const { assertClean } = attachConvexFailureGuards(page);
    const marker = `FB${Date.now()}`;

    await createPipelineFile(page, {
      client: "E2E",
      project: marker,
      funding: "88000",
    });
    await expectTableFunding(page, marker, 88_000);

    const overviewInput = page.getByTestId("deal-overview-funding-input");
    await overviewInput.scrollIntoViewIfNeeded();
    /** Initial create sets `pipeline.fundingAmount` but may not set `cover.fundingAmount`; establish a dirty save before clearing. */
    await overviewInput.fill("92000");
    await overviewInput.blur();
    await expectTableFunding(page, marker, 92_000);

    await overviewInput.fill("");
    await overviewInput.blur();

    await goToPipelineTable(page);
    const btn = fundingButtonForRow(page, marker);
    await expect(btn).toBeVisible({ timeout: FUNDING_SYNC_TIMEOUT });
    await expect
      .poll(
        async () => (await btn.textContent())?.trim() ?? "",
        {
          message:
            "after clearing cover funding, table should not keep the previous amount",
          timeout: FUNDING_SYNC_TIMEOUT,
        }
      )
      .not.toMatch(/92,?000/);
    const text = (await btn.textContent())?.trim() ?? "";
    expect(text === "—" || /^\$0/.test(text)).toBeTruthy();

    assertClean();
  });

  test("rapid sequential edits settle to the final amount", async ({
    page,
  }) => {
    const { assertClean } = attachConvexFailureGuards(page);
    const marker = `FC${Date.now()}`;

    await createPipelineFile(page, {
      client: "E2E",
      project: marker,
      funding: "100000",
    });
    await expectTableFunding(page, marker, 100_000);

    const overviewInput = page.getByTestId("deal-overview-funding-input");
    await overviewInput.scrollIntoViewIfNeeded();
    await overviewInput.fill("111111");
    await overviewInput.fill("222222");
    await overviewInput.fill("333333");
    await overviewInput.blur();

    await expectTableFunding(page, marker, 333_333);
    assertClean();
  });

  test("two tabs on the same file converge on one funding amount", async ({
    browser,
  }) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD for protected routes",
    );
    const marker = `FD${Date.now()}`;
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const guardA = attachConvexFailureGuards(pageA);
    const guardB = attachConvexFailureGuards(pageB);

    try {
      for (const p of [pageA, pageB]) {
        await signInWorkspaceSession(p);
      }
      for (const p of [pageA, pageB]) {
        await p.goto("/pipeline", { waitUntil: "domcontentloaded" });
        await expect(p.getByRole("heading", { name: /Pipeline/i })).toBeVisible({
          timeout: 30_000,
        });
        await waitPipelineLoaded(p);
        await ensureTableView(p);
      }

      await createPipelineFile(pageA, {
        client: "E2E",
        project: marker,
        funding: "200000",
      });
      const url = pageA.url();
      await pageB.goto(url, { waitUntil: "domcontentloaded" });
      await expect(pageB.getByTestId("deal-overview-funding-input")).toBeVisible({
        timeout: 45_000,
      });

      const inputA = pageA.getByTestId("deal-overview-funding-input");
      const inputB = pageB.getByTestId("deal-overview-funding-input");
      await inputA.scrollIntoViewIfNeeded();
      await inputB.scrollIntoViewIfNeeded();
      await expect(inputA).toBeVisible({ timeout: 30_000 });
      await expect(inputB).toBeVisible({ timeout: 30_000 });

      await inputA.fill("444555");
      await inputA.blur();
      await expectTableFunding(pageA, marker, 444_555);
      await expectTableFunding(pageB, marker, 444_555);

      await inputB.fill("444556");
      await inputB.blur();
      await expectTableFunding(pageA, marker, 444_556);
      await expectTableFunding(pageB, marker, 444_556);

      await expect(inputA).toHaveValue("444556", {
        timeout: FUNDING_SYNC_TIMEOUT,
      });

      guardA.assertClean();
      guardB.assertClean();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
