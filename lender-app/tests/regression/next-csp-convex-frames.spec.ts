import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression: lender/vault PDF previews historically used framed Convex/blob URLs.
 * Production CSP must allow Convex hosts + blob in frame-src, and blob in
 * connect-src (pdf.js worker + any residual blob fetches).
 */
test.describe("CSP convex frame hosts", () => {
  test("next.config production CSP allows Convex storage iframes and blob", () => {
    const root = join(__dirname, "..", "..");
    const raw = readFileSync(join(root, "next.config.mjs"), "utf8");
    expect(raw).toMatch(/frame-src/i);
    expect(raw).toMatch(/convex\.cloud/);
    expect(raw).toMatch(/blob:/);
    expect(raw).toMatch(/connect-src[\s\S]*blob:/);
  });
});
