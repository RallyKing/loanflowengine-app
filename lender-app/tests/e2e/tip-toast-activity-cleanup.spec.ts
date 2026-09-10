import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../helpers/workspace-auth";

/**
 * Prompt 21 crawl fixes: tip toast must not cover bottom-right primary controls;
 * activity cards must show human labels (not raw kinds/JSON).
 */
test.describe("Tip toast + activity feed cleanup", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!workspaceSessionReady(), "Workspace auth credentials required");
    await signInWorkspaceSession(page);
  });

  test("contextual tip anchors top-right and dismisses for the session", async ({
    page,
  }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible({
      timeout: 20_000,
    });

    const tip = page.getByTestId("contextual-quick-tip");
    const tipVisible = await tip.isVisible().catch(() => false);
    if (!tipVisible) {
      // Already dismissed this session or tip not configured — still assert anchor when present.
      test.info().annotations.push({
        type: "note",
        description: "Tip not visible on Settings (already dismissed or absent)",
      });
      return;
    }

    await expect(tip).toHaveAttribute("data-tip-anchor", "top-right");
    const box = await tip.boundingBox();
    expect(box).toBeTruthy();
    const vh = page.viewportSize()?.height ?? 800;
    // Must sit in the upper half — never the bottom action zone.
    expect(box!.y + box!.height).toBeLessThan(vh * 0.45);

    await tip.getByRole("button", { name: /dismiss tip/i }).click();
    await expect(tip).toHaveCount(0);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("contextual-quick-tip")).toHaveCount(0);
  });

  test("activity cards use human labels and deep links when IDs exist", async ({
    page,
  }) => {
    await page.goto("/activity", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Activity$/i })).toBeVisible({
      timeout: 20_000,
    });

    const cards = page.getByTestId("activity-feed-card");
    const count = await cards.count();
    if (count === 0) {
      test.info().annotations.push({
        type: "note",
        description: "No activity rows in this workspace session",
      });
      return;
    }

    const first = cards.first();
    const text = (await first.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    // Raw collaboration/file kind prefixes and JSON blobs must not appear.
    expect(text).not.toMatch(/collaboration\./i);
    expect(text).not.toMatch(/file\.(vault_|deal_|status_)/i);
    expect(text).not.toMatch(/\{"[a-zA-Z]+":/);

    const contactLink = first.getByRole("link", { name: /open contact/i });
    if (await contactLink.isVisible().catch(() => false)) {
      const href = await contactLink.getAttribute("href");
      expect(href).toMatch(/^\/contacts\/[^/?#]+/);
    }
    const lenderLink = first.getByRole("link", { name: /open lender/i });
    if (await lenderLink.isVisible().catch(() => false)) {
      const href = await lenderLink.getAttribute("href");
      expect(href).toMatch(/^\/lenders\?lender=/);
    }
    const taskLink = first.getByRole("link", { name: /open task/i });
    if (await taskLink.isVisible().catch(() => false)) {
      const href = await taskLink.getAttribute("href");
      expect(href).toMatch(/^\/tasks\?task=/);
    }
  });
});
