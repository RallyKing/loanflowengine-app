/**
 * Unit checks for attachment kind detection + rich preview helpers.
 * Run: npx tsx scripts/rich-file-preview-tests.ts
 */
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { guessAttachmentKind } from "../lib/uploadToConvexStorage";
import {
  isLegacyBinaryOfficeName,
  MAX_SHEET_COLS,
  MAX_SHEET_ROWS,
  parseWorkbookWithXlsx,
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

function workbookBuffer(
  sheets: Record<string, unknown[][]>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const bytes = out instanceof Uint8Array ? out : new Uint8Array(out as number[]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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

test("parseWorkbookWithXlsx: first sheet grid", () => {
  const buf = workbookBuffer({
    Demo: [
      ["Name", "Amount"],
      ["Alpha", 10],
      ["Beta", 20],
    ],
    Other: [["X"], [1]],
  });
  const table = parseWorkbookWithXlsx(XLSX, buf);
  assert.equal(table.sheetName, "Demo");
  assert.deepEqual(table.sheetNames, ["Demo", "Other"]);
  assert.deepEqual(table.headers, ["Name", "Amount"]);
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0]?.[0], "Alpha");
  assert.equal(table.rows[1]?.[1], "20");
  assert.equal(table.truncatedRows, false);
  assert.equal(table.truncatedCols, false);
});

test("parseWorkbookWithXlsx: sheet tab selection", () => {
  const buf = workbookBuffer({
    Demo: [["A"], [1]],
    Other: [["Z"], [9]],
  });
  const table = parseWorkbookWithXlsx(XLSX, buf, "Other");
  assert.equal(table.sheetName, "Other");
  assert.equal(table.headers[0], "Z");
  assert.equal(table.rows[0]?.[0], "9");
});

test("parseWorkbookWithXlsx: caps rows and columns", () => {
  const header = Array.from({ length: MAX_SHEET_COLS + 5 }, (_, i) => `C${i}`);
  const body = Array.from({ length: MAX_SHEET_ROWS + 10 }, (_, r) =>
    header.map((_, c) => `${r}:${c}`),
  );
  const buf = workbookBuffer({ Big: [header, ...body] });
  const table = parseWorkbookWithXlsx(XLSX, buf);
  assert.equal(table.headers.length, MAX_SHEET_COLS);
  assert.equal(table.rows.length, MAX_SHEET_ROWS);
  assert.equal(table.truncatedRows, true);
  assert.equal(table.truncatedCols, true);
});

console.log("All rich-file-preview tests passed.");
