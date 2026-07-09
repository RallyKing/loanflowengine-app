import { test, expect } from "@playwright/test";
import {
  signInWorkspaceSession,
  workspaceSessionReady,
} from "./helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("responsive shell — chrome contracts", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !workspaceSessionReady(),
      "E2E or APP_AUTH credentials required",
    );
    await signInWorkspaceSession(page);
  });

  test("single main scroll + unified sidebar marker on SaaS pipeline hub", async ({
    page,
  }) => {
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="app-main-scroll"]')).toBeVisible({
      timeout: 30_000,
    });
    const root = await page.evaluate(() =>
      document.documentElement.getAttribute("data-color-scheme"),
    );
    if (root === "saas") {
      await expect(
        page.locator('[data-testid="unified-sidebar-rail"]'),
      ).toBeVisible();
    }
  });

  test("navigation manager route renders", async ({ page }) => {
    await page.goto("/settings/navigation-manager", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: /navigation manager/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("bottom nav uses data attribute from responsive provider", async ({
    page,
  }) => {
    await page.goto("/tasks", { waitUntil: "domcontentloaded" });
    const navBottom = await page.evaluate(() =>
      document.documentElement.getAttribute("data-nav-bottom"),
    );
    expect(navBottom === "on" || navBottom === "off").toBeTruthy();
  });
});
