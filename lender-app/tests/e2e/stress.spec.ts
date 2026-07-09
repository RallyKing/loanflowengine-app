import { test, expect, type Page } from "@playwright/test";
import {
  workspaceSessionReady,
  registerWorkspaceSessionHook,
  signInWorkspaceSession,
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

async function assertMainVisible(page: Page) {
  await expect(page.locator("main")).toBeVisible({ timeout: 45_000 });
}

describeOrSkip("routing stress (requires Convex URL + production build)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("rapid round-robin navigation across primary routes stays stable", async ({
    page,
  }) => {
    const paths = [
      "/tasks",
      "/pipeline",
      "/lenders",
      "/ledger",
      "/settings",
    ] as const;
    for (let round = 0; round < 40; round += 1) {
      const path = paths[round % paths.length];
      await page.goto(`${path}?s=${round}`, { waitUntil: "domcontentloaded" });
      await assertMainVisible(page);
    }
  });

  test("parallel browser contexts: same routes concurrently", async ({
    browser,
  }) => {
    test.skip(
      !workspaceSessionReady(),
      "Set APP_AUTH_USERNAME and APP_AUTH_PASSWORD for protected routes",
    );
    const paths = ["/pipeline", "/tasks", "/lenders"] as const;
    const ctxs = await Promise.all([
      browser.newContext(),
      browser.newContext(),
    ]);
    try {
      const pages = await Promise.all(ctxs.map((c) => c.newPage()));
      for (const p of pages) {
        await signInWorkspaceSession(p);
      }
      for (let i = 0; i < 12; i += 1) {
        await Promise.all(
          pages.map((p, idx) =>
            p.goto(`${paths[(i + idx) % paths.length]}?p=${i}`, {
              waitUntil: "domcontentloaded",
            }),
          ),
        );
        await Promise.all(pages.map((p) => assertMainVisible(p)));
      }
    } finally {
      await Promise.all(ctxs.map((c) => c.close()));
    }
  });

  test("lenders workspace: rapid scroll does not throw (large list resilience)", async ({
    page,
  }) => {
    await page.goto("/lenders", { waitUntil: "domcontentloaded" });
    await assertMainVisible(page);
    for (let i = 0; i < 30; i += 1) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(40);
    }
    await page.mouse.wheel(0, -2400);
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("stress without Convex (static resilience)", () => {
  test("not-found remains stable under rapid reload", async ({ page }) => {
    for (let i = 0; i < 15; i += 1) {
      const res = await page.goto(`/missing-${i}-x`, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0).toBe(404);
      await expect(
        page.getByRole("heading", { name: /page not found/i }),
      ).toBeVisible({ timeout: 15_000 });
    }
  });
});
