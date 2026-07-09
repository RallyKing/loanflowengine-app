import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

const PROD = !!process.env.PW_BASE_URL?.trim();
const RUN = PROD && workspaceSessionReady();

const describeOrSkip = RUN ? test.describe : test.describe.skip;

describeOrSkip("production smoke (PW_BASE_URL)", () => {
  test("login, pipeline, main scroll owner", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    const main = page.locator("[data-app-main-scroll]");
    await expect(main).toBeVisible({ timeout: 60_000 });
    const scrollH = await main.evaluate((el) => el.scrollHeight);
    const clientH = await main.evaluate((el) => el.clientHeight);
    expect(scrollH, "pipeline main should scroll").toBeGreaterThan(clientH);
  });
});
