import { test, expect } from "@playwright/test";
import { sameOriginApiHeaders } from "../helpers/authApiHeaders";
import { isInternalConvexAuthTestEnvReady } from "../helpers/internalAuthTestEnv";

test.describe("auth API", () => {
  test("rejects invalid credentials", async ({ request, baseURL }) => {
    test.skip(
      !isInternalConvexAuthTestEnvReady(),
      "Set AUTH_BRIDGE_SECRET (≥24 chars) and NEXT_PUBLIC_CONVEX_URL in .env.local (same as Next + Convex) to exercise Convex-backed login.",
    );
    const res = await request.post("/api/auth/login", {
      data: { username: "__invalid__", password: "__wrong__" },
      headers: sameOriginApiHeaders(baseURL),
    });
    expect(res.status()).toBe(401);
  });
});
