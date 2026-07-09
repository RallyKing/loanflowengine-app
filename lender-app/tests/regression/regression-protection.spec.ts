import { test, expect } from "@playwright/test";

/**
 * HTTP-level integration checks (no seeded personas required).
 */
test.describe("regression protection (integration)", () => {
  test("health endpoint returns JSON and request id header", async ({
    request,
  }) => {
    const res = await request.get("/system/health", {
      headers: { Accept: "application/json" },
    });
    expect(res.ok()).toBeTruthy();
    const ct = res.headers()["content-type"] ?? "";
    expect(ct, `expected JSON health payload; got content-type ${ct}`).toContain(
      "application/json",
    );
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.requestId).toBeTruthy();
    expect(res.headers()["x-request-id"]).toBeTruthy();
  });

  test("login rejects malformed JSON without crashing", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: "not-json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("login rejects empty credentials", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { username: "", password: "" },
    });
    expect(res.status()).toBe(400);
  });
});
