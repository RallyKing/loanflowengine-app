import { test, expect } from "@playwright/test";
import {
  workspaceSessionReady,
  signInWorkspaceSession,
} from "../../helpers/workspace-auth";
import {
  isMobileTouchProject,
  skipPlaywrightWebKitOnWindows,
} from "../../helpers/mobile/projects";

test.describe("Navigation — SaaS mobile master shell (11.8.1)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileTouchProject(testInfo.project.name));
    test.skip(!workspaceSessionReady());
    skipPlaywrightWebKitOnWindows(testInfo);
  });

  test("single-row master header and full labeled drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await signInWorkspaceSession(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const html = page.locator("html");
    if ((await html.getAttribute("data-color-scheme")) !== "saas") {
      const menu = page.getByRole("button", {
        name: /Toggle primary navigation/i,
      });
      if (await menu.isVisible({ timeout: 4_000 }).catch(() => false)) {
        await menu.click();
        const drawer = page.getByRole("complementary", {
          name: "Primary navigation",
        });
        await expect(drawer).toBeVisible();
        await drawer
          .getByLabel("Color scheme", { exact: true })
          .selectOption("saas");
        await expect(html).toHaveAttribute("data-color-scheme", "saas", {
          timeout: 15_000,
        });
        await page.keyboard.press("Escape");
        await expect(menu).toHaveAttribute("aria-expanded", "false");
      } else {
        await page
          .getByTestId("app-masterpage-chrome")
          .getByLabel("Color scheme", { exact: true })
          .selectOption("saas");
        await expect(html).toHaveAttribute("data-color-scheme", "saas", {
          timeout: 15_000,
        });
      }
    }

    await page.goto("/tasks", { waitUntil: "domcontentloaded" });

    const menuBtn = page.getByRole("button", {
      name: /Toggle primary navigation/i,
    });
    await expect(menuBtn).toBeVisible({ timeout: 30_000 });

    const header = page.getByTestId("app-masterpage-chrome");
    await expect(header).toBeVisible({ timeout: 30_000 });
    // Content row only — exclude iOS safe-area padding (status bar / notch).
    const headerContentHeight = await header.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const padTop = Number.parseFloat(getComputedStyle(el).paddingTop) || 0;
      return r.height - padTop;
    });
    expect(
      headerContentHeight,
      "master header content-row height clamp (single row)",
    ).toBeLessThanOrEqual(58);

    await menuBtn.click();
    const drawer = page.getByRole("complementary", {
      name: "Primary navigation",
    });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("data-saas-mobile-drawer", "open");
    await expect(drawer.getByRole("link", { name: "Tasks", exact: true })).toBeVisible();

    // Brand header must clear status bar; green column paints full viewport height.
    const drawerMetrics = await drawer.evaluate((el) => {
      const style = getComputedStyle(el);
      const header = el.querySelector(":scope > div");
      const headerPad =
        header instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(header).paddingTop) || 0
          : 0;
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        vh: window.innerHeight,
        headerPadTop: headerPad,
        zIndex: Number.parseInt(style.zIndex, 10) || 0,
      };
    });
    expect(drawerMetrics.top).toBeLessThanOrEqual(1);
    expect(Math.abs(drawerMetrics.height - drawerMetrics.vh)).toBeLessThanOrEqual(2);
    expect(drawerMetrics.zIndex).toBeGreaterThanOrEqual(50);

    const bottomNav = page.locator(
      'nav[aria-label="Primary"][data-dlc-component="MobileBottomNav"]',
    );
    if (await bottomNav.count()) {
      await expect(bottomNav).toHaveAttribute("data-saas-menu-covered", "true");
      await expect(bottomNav).toHaveAttribute("aria-hidden", "true");
    }

    await page.keyboard.press("Escape");
    await expect(menuBtn).toHaveAttribute("aria-expanded", "false");
  });
});
