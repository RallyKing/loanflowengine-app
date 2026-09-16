/**
 * Unit checks for attachment kind detection + rich preview helpers.
 * Run: npx tsx scripts/rich-file-preview-tests.ts
 */
import assert from "node:assert/strict";
import { guessAttachmentKind } from "../lib/uploadToConvexStorage";
import {
  isLegacyBinaryOfficeName,
} from "../lib/library/richFilePreviewLoaders";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`fail - ${name}`);
    throw e;
  }
}

test("guessAttachmentKind: pdf / image / text", () => {
  assert.equal(guessAttachmentKind("application/pdf", "a.pdf"), "pdf");
  assert.equal(guessAttachmentKind("image/png", "a.png"), "image");
  assert.equal(guessAttachmentKind("text/plain", "notes.txt"), "text");
});

test("guessAttachmentKind: spreadsheets including csv", () => {
  assert.equal(guessAttachmentKind(undefined, "book.xlsx"), "spreadsheet");
  assert.equal(guessAttachmentKind(undefined, "book.xls"), "spreadsheet");
  assert.equal(guessAttachmentKind("text/csv", "data.csv"), "spreadsheet");
  assert.equal(
    guessAttachmentKind(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x",
    ),
    "spreadsheet",
  );
});

test("guessAttachmentKind: word", () => {
  assert.equal(guessAttachmentKind(undefined, "memo.docx"), "word");
  assert.equal(guessAttachmentKind(undefined, "memo.doc"), "word");
  assert.equal(
    guessAttachmentKind(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "x",
    ),
    "word",
  );
});

test("csv is no longer plain text kind", () => {
  assert.equal(guessAttachmentKind(undefined, "data.csv"), "spreadsheet");
  assert.notEqual(guessAttachmentKind(undefined, "data.csv"), "text");
});

test("legacy binary office names", () => {
  assert.equal(isLegacyBinaryOfficeName("a.doc"), true);
  assert.equal(isLegacyBinaryOfficeName("a.xls"), true);
  assert.equal(isLegacyBinaryOfficeName("a.docx"), false);
  assert.equal(isLegacyBinaryOfficeName("a.xlsx"), false);
});

console.log("All rich-file-preview tests passed.");
