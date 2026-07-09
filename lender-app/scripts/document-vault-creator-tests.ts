/**
 * Document vault creator — token hydration, image URL safety, HTML export.
 * Run: `tsx scripts/document-vault-creator-tests.ts`
 */
import assert from "node:assert/strict";
import {
  applyDocumentCreatorTokens,
  buildDocumentEditorImageInsertHtml,
  htmlDocumentToVaultFile,
  resolveDocumentCreatorTokenContext,
  sanitizeDocumentEditorImageUrl,
} from "../modules/pipeline/lib/core/documentVaultCreator";

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

test("resolveDocumentCreatorTokenContext merges overrides", () => {
  const ctx = resolveDocumentCreatorTokenContext({
    borrower_name: "Acme LLC",
    loan_amount: "$1.2M",
  });
  assert.equal(ctx.borrower_name, "Acme LLC");
  assert.equal(ctx.loan_amount, "$1.2M");
  assert.ok(ctx.today_date);
});

test("applyDocumentCreatorTokens hydrates template placeholders", () => {
  const html = applyDocumentCreatorTokens(
    "<p>{{borrower_name}} · {{loan_amount}}</p>",
    { borrower_name: "Jane Doe", loan_amount: "$500,000" },
  );
  assert.equal(html, "<p>Jane Doe · $500,000</p>");
});

test("applyDocumentCreatorTokens escapes HTML in token values", () => {
  const html = applyDocumentCreatorTokens("<p>{{borrower_name}}</p>", {
    borrower_name: "<script>alert(1)</script>",
  });
  assert.equal(
    html,
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
});

test("sanitizeDocumentEditorImageUrl accepts https Convex URLs", () => {
  const url =
    "https://basic-anaconda-984.convex.cloud/api/storage/abc123";
  assert.equal(sanitizeDocumentEditorImageUrl(url), url);
});

test("sanitizeDocumentEditorImageUrl rejects javascript/data URIs", () => {
  assert.equal(sanitizeDocumentEditorImageUrl("javascript:alert(1)"), null);
  assert.equal(
    sanitizeDocumentEditorImageUrl("data:image/png;base64,abc"),
    null,
  );
});

test("buildDocumentEditorImageInsertHtml produces responsive img tag", () => {
  const tag = buildDocumentEditorImageInsertHtml(
    "https://example.com/image.png",
  );
  assert.match(tag, /^<img /);
  assert.match(tag, /src="https:\/\/example\.com\/image\.png"/);
  assert.match(tag, /max-w-full/);
});

test("htmlDocumentToVaultFile wraps editor HTML in a full document", async () => {
  const file = htmlDocumentToVaultFile("Term Sheet", "<h1>Hi</h1>");
  assert.equal(file.name, "Term Sheet.html");
  assert.equal(file.type, "text/html");
  const text = await file.text();
  assert.match(text, /<!DOCTYPE html>/);
  assert.match(text, /<h1>Hi<\/h1>/);
});

console.log(`\n${passed} document vault creator tests passed.`);
