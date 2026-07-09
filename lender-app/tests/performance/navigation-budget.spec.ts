import { test, expect } from "@playwright/test";

test.describe("navigation timing budget", () => {
  test("pipeline route reaches interactive under budget", async ({ page }) => {
    test.skip(!process.env.PERF_BUDGET_MS, "Set PERF_BUDGET_MS (e.g. 8000)");
    const budget = Number(process.env.PERF_BUDGET_MS);
    const t0 = Date.now();
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("app-main-scroll")).toBeVisible({
      timeout: budget,
    });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThanOrEqual(budget);
  });
});
