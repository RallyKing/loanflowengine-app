import { test, expect } from "@playwright/test";
import {
  signInWithTestPersona,
  testPersonaReady,
} from "../helpers/workspace-auth";

const READY =
  process.env.APP_AUTH_E2E_USERS_ENABLED === "true" &&
  testPersonaReady("org_owner") &&
  testPersonaReady("demo_sandbox") &&
  !!process.env.E2E_ORG_PRIMARY_ID?.trim() &&
  !!process.env.E2E_ORG_SECONDARY_ID?.trim();

const describeOrSkip = READY ? test.describe : test.describe.skip;

describeOrSkip("tenant isolation (seeded E2E)", () => {
  test("primary org owner does not see secondary seed file name in list", async ({
    page,
  }) => {
    await signInWithTestPersona(page, "org_owner");
    await page.goto("/pipeline", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading pipeline…")).toHaveCount(0, {
      timeout: 45_000,
    });
    const secondaryTitle = "E2E Seed — Secondary Deal";
    await expect(page.getByText(secondaryTitle)).toHaveCount(0);
  });
});
