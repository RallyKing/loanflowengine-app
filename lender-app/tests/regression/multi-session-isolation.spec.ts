import { test, expect } from "@playwright/test";
import { playwrightLoginCredentials } from "../helpers/workspace-auth";

const credsReady = playwrightLoginCredentials() !== null;
const describeOrSkip = credsReady ? test.describe : test.describe.skip;

/**
 * Two isolated browser contexts — session cookies must not leak between them.
 */
describeOrSkip("multi-session isolation", () => {
  test("parallel contexts have independent cookie jars", async ({ browser }) => {
    const { username: user, password: pass } = playwrightLoginCredentials()!;

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();

    const loginA = await pageA.request.post("/api/auth/login", {
      data: { username: user, password: pass },
    });
    expect(loginA.ok()).toBeTruthy();

    const cookiesB = await ctxB.cookies();
    const sessionB = cookiesB.find((c) => c.name === "dlc_session");
    expect(sessionB).toBeUndefined();

    await pageA.close();
    await ctxA.close();
    await ctxB.close();
  });
});
