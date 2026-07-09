import { test, expect } from "@playwright/test";
import { sameOriginApiHeaders } from "../helpers/authApiHeaders";
import { isInternalConvexAuthTestEnvReady } from "../helpers/internalAuthTestEnv";
import { playwrightLoginCredentials } from "../helpers/workspace-auth";

const credsReady = playwrightLoginCredentials() !== null;
const describeOrSkip = credsReady ? test.describe : test.describe.skip;

/**
 * Auth stress: sequential API login attempts (guarded — stops if rate limited).
 * Uses same credential resolution as other Playwright tests (E2E sandbox first).
 */
describeOrSkip("auth stress (login API)", () => {
  test("sequential login attempts stay non-5xx", async ({ request, baseURL }) => {
    test.skip(
      !isInternalConvexAuthTestEnvReady(),
      "Requires AUTH_BRIDGE_SECRET and NEXT_PUBLIC_CONVEX_URL (see login-api.spec).",
    );
    const { username: user, password: pass } = playwrightLoginCredentials()!;

    const headers = sameOriginApiHeaders(baseURL);
    for (let i = 0; i < 8; i += 1) {
      const res = await request.post("/api/auth/login", {
        data: {
          username: user,
          password: i % 2 === 0 ? `${pass}_wrong` : pass,
        },
        headers,
      });
      expect(res.status()).toBeLessThan(500);
      if (res.status() === 429) break;
    }

    const ok = await request.post("/api/auth/login", {
      data: { username: user, password: pass },
      headers,
    });
    if (ok.status() !== 429) {
      expect(ok.ok()).toBeTruthy();
    }
  });
});
