import { expect, type Page } from "@playwright/test";

/** SaaS / mobile: close slide-out nav if it is open so `<main>` geometry matches production taps. */
export async function dismissMobileNavOverlayIfOpen(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Close menu" });
  for (let i = 0; i < 6; i += 1) {
    const vis = await close.isVisible().catch(() => false);
    if (!vis) return;
    try {
      await close.click({ force: true, timeout: 5_000 });
    } catch {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(200);
  }
}

/**
 * Wait until `<link rel="stylesheet">` entries have loaded (`link.sheet` is set).
 * Stale servers often serve HTML whose first CSS chunk 404s after a new `next build`
 * (wrong content hash) — every `sheet` stays null and globals never apply.
 */
export async function waitForLinkedStylesheets(
  page: Page,
  timeout = 30_000,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const links = [
            ...document.querySelectorAll("link[rel=stylesheet]"),
          ].filter((l): l is HTMLLinkElement => l instanceof HTMLLinkElement);
          if (!links.length) {
            return { ok: false as const, reason: "no-stylesheet-links" as const };
          }
          const pending = links.filter((l) => !l.sheet).map((l) => l.href);
          if (pending.length) {
            return { ok: false as const, reason: "pending" as const, pending };
          }
          return { ok: true as const };
        }),
      { timeout },
    )
    .toEqual({ ok: true });
}

/**
 * Root `app/layout.tsx` + `globals.css` apply `overflow-y: hidden` (or clip) on
 * `<body data-shell="app">`. Requires linked CSS (see `waitForLinkedStylesheets`).
 */
export async function waitForAppShellBodyScrollLock(
  page: Page,
  timeout = 30_000,
): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-shell", "app", {
    timeout,
  });
  await waitForLinkedStylesheets(page, timeout);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflowY), {
      timeout,
    })
    .toMatch(/hidden|clip/);
}
