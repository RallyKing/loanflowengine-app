/**
 * Static security checks for RichFilePreview (XSS + view-only OpenFallback).
 * Run: npx tsx scripts/rich-file-preview-security-tests.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(
  join(root, "components/library/preview/RichFilePreview.tsx"),
  "utf8",
);

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`fail - ${name}`);
    throw e;
  }
}

test("no dangerouslySetInnerHTML (XSS sink)", () => {
  assert.equal(src.includes("dangerouslySetInnerHTML"), false);
});

test("HTML preview uses opaque sandboxed iframe", () => {
  assert.match(src, /srcDoc=\{htmlBody\}/);
  assert.match(src, /sandbox=""/);
});

test("OpenFallback respects allowOpen / protectMedia", () => {
  assert.match(src, /allowOpen\?: boolean/);
  assert.match(src, /const allowOpen = !protectMedia/);
  const opens = [...src.matchAll(/<OpenFallback\b[\s\S]*?\/>/g)];
  assert.ok(opens.length >= 5, "expected multiple OpenFallback call sites");
  for (const m of opens) {
    assert.match(m[0], /allowOpen=\{allowOpen\}/);
  }
});

test("view-only PDF hides browser toolbar hash", () => {
  assert.match(src, /#toolbar=0&navpanes=0/);
});

console.log("All rich-file-preview security tests passed.");
