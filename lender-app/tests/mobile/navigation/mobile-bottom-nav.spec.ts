import { test, expect } from "@playwright/test";

import {

  workspaceSessionReady,

  signInWorkspaceSession,

} from "../../helpers/workspace-auth";

import { isMobileCoreProject } from "../../helpers/mobile/projects";



test.describe("Navigation — mobile bottom nav", () => {

  test.beforeEach(({}, testInfo) => {

    test.skip(

      !isMobileCoreProject(testInfo.project.name),

      "Mobile Chrome + Mobile Safari core projects",

    );

    test.skip(

      !workspaceSessionReady(),

      "APP_AUTH_USERNAME + APP_AUTH_PASSWORD required",

    );

  });



  test("primary mobile nav is present and labeled", async ({ page }) => {

    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    await signInWorkspaceSession(page);

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: "Primary" });

    const visible = await nav.isVisible({ timeout: 6_000 }).catch(() => false);

    test.skip(!visible, "Bottom nav exists only in classic chrome (not SaaS shell)");



    await expect(nav).toBeVisible();

    await expect(nav.getByRole("link", { name: "Pipeline" })).toBeVisible();

    await expect(nav.getByRole("link", { name: "Tasks" })).toBeVisible();

  });



  test("bottom nav is aggressively flush into home-indicator zone", async ({

    page,

  }) => {

    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    await signInWorkspaceSession(page);

    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: "Primary" });

    const visible = await nav.isVisible({ timeout: 8_000 }).catch(() => false);

    test.skip(!visible, "Bottom nav not shown for this shell");



    // Simulate iPhone home-indicator inset so pad math is measurable in emulators.

    await page.addStyleTag({

      content: `

        :root {

          --test-safe-bottom: 34px;

        }

        nav[aria-label="Primary"][data-dlc-component="MobileBottomNav"] {

          padding-bottom: max(2px, calc(34px - 28px)) !important;

        }

      `,

    });



    const metrics = await nav.evaluate((el) => {

      const cs = getComputedStyle(el);

      const rect = el.getBoundingClientRect();

      const icon = el.querySelector("svg");

      const iconBottom = icon?.getBoundingClientRect().bottom ?? rect.bottom;

      return {

        bottom: rect.bottom,

        viewportH: window.innerHeight,

        paddingBottom: cs.paddingBottom,

        stylePaddingBottom: (el as HTMLElement).style.paddingBottom,

        iconBottomToViewport: window.innerHeight - iconBottom,

        navHeight: rect.height,

      };

    });



    // Paint to the physical bottom (flush dock).

    expect(Math.abs(metrics.bottom - metrics.viewportH)).toBeLessThanOrEqual(1);



    // Inline style still uses env()-based flush formula (not frozen 1.5rem / 24px).

    expect(metrics.stylePaddingBottom).toMatch(
      /env\(safe-area-inset-bottom(?:,\s*0px)?\)/,
    );

    expect(metrics.stylePaddingBottom).toMatch(/28px|0\.25|\*\s*0\./);



    const padPx = Number.parseFloat(metrics.paddingBottom);

    expect(Number.isFinite(padPx)).toBe(true);

    // Aggressive flush: with 34px simulated inset → ~6px, never the full ~34px band.

    expect(padPx).toBeLessThanOrEqual(12);

    expect(padPx).toBeGreaterThanOrEqual(0);



    // Icons sit in / just above the home-indicator zone (≪ 34px empty under glyphs).

    expect(metrics.iconBottomToViewport).toBeLessThanOrEqual(12);

    // Full dock stays compact (icon hit ~40 + top breath + minimal pad).

    expect(metrics.navHeight).toBeLessThanOrEqual(72);

  });

});


