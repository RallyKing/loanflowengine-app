import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function convexConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return true;
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return false;
  return /NEXT_PUBLIC_CONVEX_URL\s*=\s*\S+/.test(readFileSync(p, "utf8"));
}

const describeOrSkip = convexConfigured() ? test.describe : test.describe.skip;

function attachPageErrorGuard(page: Page): { assertClean: () => void } {
  const messages: string[] = [];
  page.on("pageerror", (err) => {
    messages.push(`pageerror: ${err.message}`);
  });
  return {
    assertClean: () => {
      expect(messages, messages.join("\n")).toEqual([]);
    },
  };
}

describeOrSkip("Settings: customization workflow UI", () => {
  test("Workflow section exposes shared-bus toggles and personal file template", async ({
    page,
  }) => {
    const { assertClean } = attachPageErrorGuard(page);
    await page.goto("/settings#workflow", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Settings/i })).toBeVisible({
      timeout: 30_000,
    });

    await expect(
      page.getByRole("heading", { name: "Workflow", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("checkbox", { name: /Auto-sync shared data/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Allow block-only overrides/i }),
    ).toBeVisible();

    await expect(
      page.getByText("Personal default — new pipeline files", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save personal default template" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear personal template" }),
    ).toBeVisible();

    assertClean();
  });
});
