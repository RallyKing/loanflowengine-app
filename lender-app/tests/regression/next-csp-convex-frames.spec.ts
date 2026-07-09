import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression: PDF / file previews use `<iframe src={convex storage URL}>`.
 * Production CSP must allow `https://*.convex.cloud` in `frame-src`, otherwise
 * browsers show blocked-frame / empty preview (see `AttachmentPreviewDialog`).
 */
test.describe("CSP convex frame hosts", () => {
  test("next.config production CSP allows Convex storage iframes and blob", () => {
    const root = join(__dirname, "..", "..");
    const raw = readFileSync(join(root, "next.config.mjs"), "utf8");
    expect(raw).toMatch(/frame-src/i);
    expect(raw).toMatch(/convex\.cloud/);
    expect(raw).toMatch(/blob:/);
  });
});
