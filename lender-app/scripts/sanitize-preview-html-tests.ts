/**
 * HTML preview XSS sanitization — RichFilePreview path.
 * Run: `tsx scripts/sanitize-preview-html-tests.ts`
 */
import assert from "node:assert/strict";
import { sanitizePreviewHtml } from "../lib/library/sanitizePreviewHtml";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test("preserves safe markup", () => {
  const out = sanitizePreviewHtml("<p>Hello <strong>world</strong></p>");
  assert.match(out, /<p>/);
  assert.match(out, /Hello/);
  assert.match(out, /<strong>world<\/strong>/);
});

test("strips script tags", () => {
  const out = sanitizePreviewHtml(
    '<p>ok</p><script>alert("xss")</script><p>end</p>',
  );
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("alert"), false);
  assert.match(out, /ok/);
  assert.match(out, /end/);
});

test("strips inline event handlers", () => {
  const out = sanitizePreviewHtml('<img src="x" onerror="alert(1)">');
  assert.equal(/onerror/i.test(out), false);
  assert.equal(out.includes("alert"), false);
});

test("strips javascript: URLs", () => {
  const out = sanitizePreviewHtml('<a href="javascript:alert(1)">click</a>');
  assert.equal(/javascript:/i.test(out), false);
  assert.equal(out.includes("alert"), false);
  assert.match(out, /click/);
});

test("returns empty string for empty input", () => {
  assert.equal(sanitizePreviewHtml(""), "");
});

console.log(`\n${passed} sanitize preview HTML tests passed.`);
