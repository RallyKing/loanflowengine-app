import { expect, test, type Page } from "@playwright/test";

/**
 * Public / tokenized portals must not crash when the signed-in app shell
 * (UserSettingsProvider, UserPreferencesProvider) is absent.
 *
 * Real company-slug URLs rewrite to /client-portal/[token]; lender delivery
 * uses /lender-delivery/[token]. Invalid tokens are enough to exercise the
 * layout + client mount without needing a live bundle.
 */

const FAKE_TOKEN =
  "d1bba834e3893aaa84b6f17eeba60533210e7616e2713c23";

const PROVIDER_CRASH_RE =
  /useUserSettings must be used within UserSettingsProvider|useUserPreferences must be used within UserPreferencesProvider|useColorScheme must be used within ColorSchemeProvider/i;

async function assertNoProviderCrash(page: Page, path: string, shell?: string) {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (PROVIDER_CRASH_RE.test(text)) errors.push(text);
  });
  await page.context().clearCookies();
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Allow Convex client + React to settle past the first paint.
  await page.waitForTimeout(2_500);
  const providerCrashes = errors.filter((m) => PROVIDER_CRASH_RE.test(m));
  expect(
    providerCrashes,
    `Provider crash on ${path}:\n${providerCrashes.join("\n")}`,
  ).toEqual([]);
  await expect(page.locator("body")).toBeVisible();
  if (shell) {
    await expect(page.locator(`[data-shell="${shell}"]`)).toBeVisible({
      timeout: 15_000,
    });
  }
}

test.describe("Public portal providers (unauthenticated)", () => {
  test("client portal token route does not crash without UserSettingsProvider", async ({
    page,
  }) => {
    await assertNoProviderCrash(
      page,
      `/client-portal/${FAKE_TOKEN}`,
      "client-portal-bundle",
    );
  });

  test("company-slug client portal rewrite does not crash without providers", async ({
    page,
  }) => {
    await assertNoProviderCrash(
      page,
      `/direct-lending-connection/${FAKE_TOKEN}`,
      "client-portal-bundle",
    );
  });

  test("lender delivery token route does not crash without UserSettingsProvider", async ({
    page,
  }) => {
    await assertNoProviderCrash(
      page,
      `/lender-delivery/${FAKE_TOKEN}`,
      "lender-delivery-portal",
    );
  });
});
