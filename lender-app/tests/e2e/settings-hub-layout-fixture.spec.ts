import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Auth-free layout fixture: loads the built Tailwind CSS and mirrors the
 * Settings Jump-to markup. Catches the IA purge regression where
 * `md:flex-col` / `md:w-56` were missing while parent `md:flex-row` applied.
 */

function builtCssHref(): string {
  const cssDir = join(process.cwd(), ".next", "static", "css");
  if (!existsSync(cssDir)) {
    throw new Error("Missing .next/static/css — run npm run build first");
  }
  const file = readdirSync(cssDir).find((f) => f.endsWith(".css"));
  if (!file) throw new Error("No CSS chunk in .next/static/css");
  // Playwright can load file://; prefer absolute path as data URL for reliability on Windows.
  const css = readFileSync(join(cssDir, file), "utf8");
  return `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
}

function fixtureHtml(cssHref: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="${cssHref}" />
</head>
<body class="bg-white text-slate-900">
  <div data-testid="settings-hub-layout" class="flex flex-col gap-8 md:flex-row md:items-start md:gap-10 p-6">
    <nav data-testid="settings-jump-nav" class="w-full min-w-0 md:sticky md:top-28 md:w-56 md:shrink-0 md:self-start" aria-label="Settings sections">
      <p class="mb-2 hidden text-xs font-medium uppercase tracking-wider text-muted-foreground md:block">Jump to</p>
      <div data-testid="settings-jump-nav-list" class="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:gap-5 md:overflow-visible md:pb-0">
        <div data-settings-jump-category="personal" class="flex shrink-0 flex-row gap-1 md:block md:w-full md:shrink">
          <p class="hidden text-[11px] font-semibold uppercase tracking-wider md:mb-1.5 md:block">Personal</p>
          <ul class="flex flex-row gap-1 md:w-full md:flex-col md:gap-0.5">
            <li><a class="block px-3 py-2" href="#display">Display &amp; comfort</a></li>
            <li><a class="block px-3 py-2" href="#performance">This device</a></li>
          </ul>
        </div>
        <div data-settings-jump-category="communications" class="flex shrink-0 flex-row gap-1 md:block md:w-full md:shrink">
          <p class="hidden text-[11px] font-semibold uppercase tracking-wider md:mb-1.5 md:block">Communications</p>
          <ul class="flex flex-row gap-1 md:w-full md:flex-col md:gap-0.5">
            <li><a class="block px-3 py-2" href="#messageTemplates">Message templates</a></li>
            <li><a class="block px-3 py-2" href="#notifications">Notifications</a></li>
          </ul>
        </div>
        <div data-settings-jump-category="integrations" class="flex shrink-0 flex-row gap-1 md:block md:w-full md:shrink">
          <p class="hidden text-[11px] font-semibold uppercase tracking-wider md:mb-1.5 md:block">Integrations</p>
          <ul class="flex flex-row gap-1 md:w-full md:flex-col md:gap-0.5">
            <li><a class="block px-3 py-2" href="#webhooks">Webhooks</a></li>
            <li><a class="block px-3 py-2" href="/settings/ai-providers">AI API keys</a></li>
          </ul>
        </div>
        <div data-settings-jump-category="team" class="flex shrink-0 flex-row gap-1 md:block md:w-full md:shrink">
          <p class="hidden text-[11px] font-semibold uppercase tracking-wider md:mb-1.5 md:block">Team</p>
          <ul class="flex flex-row gap-1 md:w-full md:flex-col md:gap-0.5">
            <li><a class="block px-3 py-2" href="#organization">Organization</a></li>
          </ul>
        </div>
        <div data-settings-jump-category="admin" class="flex shrink-0 flex-row gap-1 md:block md:w-full md:shrink">
          <p class="hidden text-[11px] font-semibold uppercase tracking-wider md:mb-1.5 md:block">Admin</p>
          <ul class="flex flex-row gap-1 md:w-full md:flex-col md:gap-0.5">
            <li><a class="block px-3 py-2" href="#systemAdmin">System admin</a></li>
          </ul>
        </div>
      </div>
    </nav>
    <div data-testid="settings-hub-content" class="flex min-w-0 flex-1 flex-col gap-8">
      <section data-testid="settings-section-display" class="rounded border p-4">
        <h2>Display &amp; comfort</h2>
        <p>Theme, timezone, motion, and density controls live here.</p>
      </section>
      <section data-testid="settings-section-gettingStarted" class="rounded border p-4">
        <h2>Getting started</h2>
        <p>Setup checklist content.</p>
      </section>
    </div>
  </div>
</body>
</html>`;
}

test.describe("Settings Jump-to CSS fixture", () => {
  test("desktop: vertical sidebar + visible content (md utilities present)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(fixtureHtml(builtCssHref()), {
      waitUntil: "load",
    });

    const list = page.getByTestId("settings-jump-nav-list");
    const content = page.getByTestId("settings-hub-content");
    await expect(list).toBeVisible();
    await expect(content).toBeVisible();

    const metrics = await list.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const kids = Array.from(el.children) as HTMLElement[];
      const stacked =
        kids.length >= 2 &&
        kids[1]!.getBoundingClientRect().top >=
          kids[0]!.getBoundingClientRect().bottom - 2;
      return {
        flexDirection: style.flexDirection,
        width: rect.width,
        height: rect.height,
        stacked,
      };
    });

    expect(metrics.flexDirection).toBe("column");
    expect(metrics.stacked).toBe(true);
    expect(metrics.width).toBeLessThan(360);
    expect(metrics.height).toBeGreaterThan(120);

    const contentBox = await content.boundingBox();
    expect(contentBox).not.toBeNull();
    expect(contentBox!.width).toBeGreaterThan(400);
    await expect(page.getByTestId("settings-section-display")).toBeVisible();
  });

  test("tablet 900px: still vertical (md, not lg)", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.setContent(fixtureHtml(builtCssHref()), {
      waitUntil: "load",
    });
    const flexDirection = await page
      .getByTestId("settings-jump-nav-list")
      .evaluate((el) => window.getComputedStyle(el).flexDirection);
    expect(flexDirection).toBe("column");
  });

  test("mobile: horizontal chip strip + content visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(fixtureHtml(builtCssHref()), {
      waitUntil: "load",
    });
    const list = page.getByTestId("settings-jump-nav-list");
    const flexDirection = await list.evaluate(
      (el) => window.getComputedStyle(el).flexDirection,
    );
    expect(flexDirection).toBe("row");
    await expect(page.getByTestId("settings-section-gettingStarted")).toBeVisible();
    const contentBox = await page.getByTestId("settings-hub-content").boundingBox();
    expect(contentBox!.width).toBeGreaterThan(200);
    expect(contentBox!.height).toBeGreaterThan(80);
  });
});
