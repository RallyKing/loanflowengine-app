import { test, expect } from "@playwright/test";
import {
  signInWorkspaceSession,
  workspaceSessionReady,
} from "../helpers/workspace-auth";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

describeOrSkip("Getting started checklist (signed-in)", () => {
  test("Minimize hides modal layer until prefs say otherwise (non-global-admin only)", async ({
    page,
  }) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_E2E_USERS_ENABLED=true + E2E_PASS_* (sandbox) or primary APP_AUTH_* / PLAYWRIGHT_USE_PRIMARY_AUTH=1",
    );
    await signInWorkspaceSession(page);
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    const layer = page.getByTestId("getting-started-modal-layer");
    const adminBanner = page.getByRole("heading", { name: /getting started/i });
    const count = await layer.count();
    if (count === 0) {
      test.skip(true, "Modal not shown (global admin, dismissed, or completed)");
      return;
    }
    await expect(adminBanner).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Minimize" }).click();
    await expect(layer).toHaveCount(0, { timeout: 15_000 });
    await page.reload();
    await expect(layer).toHaveCount(0);
  });
});
