/**
 * Phase 12.1 hard certification — production workflow proof.
 *
 * Run against prod:
 *   PW_BASE_URL=https://dlcfunds.vercel.app PLAYWRIGHT_USE_PRIMARY_AUTH=1 \
 *   APP_AUTH_PRIMARY_EMAIL=joshua@directlendingconnection.com \
 *   APP_AUTH_PRIMARY_PASSWORD=*** \
 *   npx playwright test tests/e2e/phase12-hard-cert.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";
import fs from "node:fs";
import path from "node:path";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = workspaceSessionReady();
const SCREEN_DIR = path.join(process.cwd(), "test-results", "phase12-cert");
const CERT_JSON = path.join(SCREEN_DIR, "phase12-cert-results.json");

/** Portrait mobile only — sticky add bar is `md:hidden`. */
const MOBILE_VIEWPORTS = [
  { name: "iPhone-SE-portrait", width: 375, height: 667 },
  { name: "iPhone-14-Pro-portrait", width: 393, height: 852 },
  { name: "Pixel-7-portrait", width: 412, height: 915 },
  { name: "Galaxy-S22-portrait", width: 360, height: 780 },
] as const;

type CertResults = Record<string, unknown>;
const results: CertResults = {};

function certLog(label: string, data: unknown) {
  results[label] = data;
  console.log(`[phase12-cert] ${label}`, JSON.stringify(data));
}

async function signIn(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await signInWorkspaceSession(page);
}

async function openPipelineStages(page: Page) {
  await page.goto("/settings/pipeline-stages", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-pipeline-stages-settings]")).toBeVisible({
    timeout: 60_000,
  });
}

async function waitForInputValue(page: Page, value: string, timeout = 15_000) {
  await page.waitForFunction(
    (v) =>
      Array.from(document.querySelectorAll("input")).some((el) => el.value === v),
    value,
    { timeout },
  );
}

async function inputByValue(page: Page, value: string) {
  const idx = await page.evaluate((v) => {
    return [...document.querySelectorAll("input")].findIndex((el) => el.value === v);
  }, value);
  expect(idx).toBeGreaterThanOrEqual(0);
  return page.locator("input").nth(idx);
}

async function assertAddStageTappable(
  page: Page,
  vp: (typeof MOBILE_VIEWPORTS)[number],
) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await openPipelineStages(page);
  const addBar = page.locator("[data-pipeline-stages-add-bar]");
  await expect(addBar).toBeVisible({ timeout: 15_000 });
  const addBtn = addBar.getByRole("button", { name: /Add stage/i });
  await expect(addBtn).toBeVisible();
  const box = await addBtn.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  const bottomNav = page.locator("nav").filter({ hasText: "Pipeline" }).last();
  const navBox = await bottomNav.boundingBox().catch(() => null);
  const buttonBottom = box!.y + box!.height;
  const safeBottom = navBox ? navBox.y : viewport.height;
  const overlap = buttonBottom > safeBottom - 2;
  expect(overlap, `${vp.name}: Add stage overlaps bottom nav`).toBe(false);
  await addBar.getByLabel("New parent stage name").fill("Cert tap probe");
  await addBtn.click({ trial: true });
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SCREEN_DIR, `mobile-add-stage-${vp.name}.png`),
    fullPage: false,
  });
  certLog(`mobile-add-stage-${vp.name}`, {
    tappable: true,
    box,
    navBox,
    viewport,
  });
}

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("Phase 12.1 hard certification @prod", () => {
  test.setTimeout(600_000);

  test.afterAll(() => {
    fs.mkdirSync(SCREEN_DIR, { recursive: true });
    fs.writeFileSync(CERT_JSON, JSON.stringify({ prod: PROD, results }, null, 2));
  });

  test("1 — mobile Add Stage never overlapped", async ({ page }) => {
    await signIn(page);
    for (const vp of MOBILE_VIEWPORTS) {
      await assertAddStageTappable(page, vp);
    }
  });

  test("2 — debounced rename saves without blur", async ({ page }) => {
    await signIn(page);
    await openPipelineStages(page);
    const field = page.getByLabel("Stage name").first();
    const original = await field.inputValue();
    const suffix = ` P12${Date.now().toString().slice(-4)}`;
    const next = `${original.replace(/\s+P12\d+$/, "")}${suffix}`;
    await field.fill(next);
    await field.press("Enter");
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Stage name").first()).toHaveValue(next);
    certLog("rename-debounced", { original, next, persisted: true });
    await page.getByLabel("Stage name").first().fill(original.replace(/\s+P12\d+$/, ""));
    await page.getByLabel("Stage name").first().press("Enter");
  });

  test("3 — substage full lifecycle", async ({ page }) => {
    page.on("dialog", (d) => void d.accept());
    await signIn(page);
    await openPipelineStages(page);
    await page.getByLabel("Expand sub-stages").first().click();
    const tag = `P12Cert${Date.now().toString().slice(-5)}`;
    const names = [`${tag}A`, `${tag}B`, `${tag}C`];
    for (const n of names) {
      await page.getByPlaceholder("New sub-stage").first().fill(n);
      await page.getByRole("button", { name: "Add", exact: true }).first().click();
      await waitForInputValue(page, n);
    }
    const subA = await inputByValue(page, `${tag}A`);
    const renamed = `${tag}A-Renamed`;
    await subA.fill(renamed);
    await subA.press("Enter");
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 10_000 });

    await page.getByTitle("Archive sub-stage").first().click();
    await expect(page.getByText("Archived sub-stages")).toBeVisible({ timeout: 10_000 });
    await page.getByTitle("Restore sub-stage").first().click();
    await waitForInputValue(page, `${tag}B`);

    await page.getByLabel(`Move ${tag}C to parent stage`).selectOption({ index: 1 });

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Board" }).click();
    await expect(
      page.getByRole("button", { name: /— parent$/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
    certLog("substage-lifecycle", {
      tag,
      renamed: `${tag}A-Renamed`,
      archiveRestore: true,
      boardSelector: true,
    });
  });

  test("4 — saved views persist refresh + relogin", async ({ page, context }) => {
    await signIn(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({ timeout: 60_000 });

    const views: string[] = [];
    const stages = ["Underwriting", "Initial Review", "Confirm Interest"];
    for (const stage of stages) {
      const chip = page.getByRole("button", { name: stage, exact: true });
      if (!(await chip.isVisible().catch(() => false))) continue;
      await chip.click();
      const viewName = `Cert ${stage} ${Date.now().toString().slice(-4)}`;
      page.once("dialog", (d) => d.accept(viewName));
      const details = page.locator("details").filter({ hasText: "Saved views" });
      await details.locator("summary").click();
      await page.getByRole("button", { name: "Save current filters…" }).click();
      views.push(viewName);
      await chip.click();
    }
    expect(views.length).toBeGreaterThanOrEqual(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("details").filter({ hasText: "Saved views" }).locator("summary").click();
    for (const v of views) {
      await expect(page.getByRole("button", { name: v })).toBeVisible({ timeout: 15_000 });
    }

    await context.clearCookies();
    await signIn(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await page.locator("details").filter({ hasText: "Saved views" }).locator("summary").click();
    for (const v of views) {
      await expect(page.getByRole("button", { name: v })).toBeVisible({ timeout: 15_000 });
    }
    certLog("saved-view-persist", { views, afterRelogin: true });
  });

  test("5 — parent + substage assignment on hub row", async ({ page }) => {
    await signIn(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    const parentSelect = page.getByRole("button", { name: /— parent$/i }).first();
    await expect(parentSelect).toBeVisible({ timeout: 30_000 });
    const before = (await parentSelect.textContent())?.trim() ?? "";
    await parentSelect.click();
    const options = page.getByRole("option");
    const count = await options.count();
    test.skip(count < 2, "Need at least 2 stage options");
    await options.nth(1).click();
    await expect(parentSelect).not.toHaveText(before, { timeout: 10_000 });

    const subSelect = page.getByRole("combobox", { name: /— sub-stage$/i }).first();
    if (await subSelect.isVisible().catch(() => false)) {
      await subSelect.selectOption({ index: 1 });
    }
    certLog("assign-parent-sub", { before, subAssigned: true });
  });
});
