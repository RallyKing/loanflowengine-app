import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeSignedIn = convexConfigured() ? test.describe : test.describe.skip;

/**
 * SaaS integration surfaces: org settings, billing, white-label.
 * Requires Convex URL + workspace cookie session (APP_AUTH_USERNAME / APP_AUTH_PASSWORD).
 */
describeSignedIn("SaaS system — settings and gating surfaces", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD (cookie session)",
    );
    await signInWorkspaceSession(page);
  });

  test("settings: Organization section renders", async ({ page }) => {
    await page.goto("/settings#organization", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: /^Organization$/ }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("settings: Team billing section renders", async ({ page }) => {
    await page.goto("/settings#billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: /Team billing/i }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("settings: white-label branding section heading", async ({ page }) => {
    await page.goto("/settings#organization", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: /White-label branding/i }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
