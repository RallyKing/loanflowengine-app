/**
 * Unit checks for attachment kind detection + rich preview helpers.
 * Run: npx tsx scripts/rich-file-preview-tests.ts
 */
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { guessAttachmentKind } from "../lib/uploadToConvexStorage";
import {
  excelColLabel,
  isLegacyBinaryOfficeName,
  loadSpreadsheetPreviewFromBuffer,
  MAX_CSV_PREVIEW_CHARS,
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

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
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
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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

test("legacy binary office names (.doc only; .xls is previewable)", () => {
  assert.equal(isLegacyBinaryOfficeName("a.doc"), true);
  assert.equal(isLegacyBinaryOfficeName("a.xls"), false);
  assert.equal(isLegacyBinaryOfficeName("a.docx"), false);
  assert.equal(isLegacyBinaryOfficeName("a.xlsx"), false);
});

test("excelColLabel", () => {
  assert.equal(excelColLabel(0), "A");
  assert.equal(excelColLabel(25), "Z");
  assert.equal(excelColLabel(26), "AA");
});

test("parseWorkbookWithXlsx: letter headers + all rows as data", () => {
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
  assert.equal(table.headerMode, "letters");
  assert.deepEqual(table.headers, ["A", "B"]);
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0]?.[0], "Name");
  assert.equal(table.rows[1]?.[0], "Alpha");
  assert.equal(table.rows[1]?.[1], "10");
  assert.equal(table.truncatedRows, false);
  assert.equal(table.truncatedCols, false);
});

test("parseWorkbookWithXlsx: title-only first row does not collapse columns", () => {
  // Reproduces Balance Sheet.xlsx bug: company name in A1 only, amounts in col B.
  const buf = workbookBuffer({
    Sheet1: [
      ["The Carol Cole Company"],
      ["Parent Company : NuFACE"],
      ["ASSETS", "1000"],
      ["Cash", "250"],
      ["Bank of America", "750"],
    ],
  });
  const table = parseWorkbookWithXlsx(XLSX, buf);
  assert.equal(table.headerMode, "letters");
  assert.ok(table.headers.length >= 2, `expected ≥2 cols, got ${table.headers.length}`);
  assert.deepEqual(table.headers.slice(0, 2), ["A", "B"]);
  assert.equal(table.rows[0]?.[0], "The Carol Cole Company");
  assert.equal(table.rows[2]?.[0], "ASSETS");
  assert.equal(table.rows[2]?.[1], "1000");
  assert.equal(table.rows[3]?.[1], "250");
});

test("parseWorkbookWithXlsx: sheet tab selection", () => {
  const buf = workbookBuffer({
    Demo: [["A"], [1]],
    Other: [["Z"], [9]],
  });
  const table = parseWorkbookWithXlsx(XLSX, buf, "Other");
  assert.equal(table.sheetName, "Other");
  assert.equal(table.rows[0]?.[0], "Z");
  assert.equal(table.rows[1]?.[0], "9");
});

test("parseWorkbookWithXlsx: caps rows and columns without full materialize", () => {
  const header = Array.from({ length: MAX_SHEET_COLS + 5 }, (_, i) => `C${i}`);
  const body = Array.from({ length: MAX_SHEET_ROWS + 10 }, (_, r) =>
    header.map((_, c) => `${r}:${c}`),
  );
  const buf = workbookBuffer({ Big: [header, ...body] });
  const started = Date.now();
  const table = parseWorkbookWithXlsx(XLSX, buf);
  const elapsed = Date.now() - started;
  assert.equal(table.headers.length, MAX_SHEET_COLS);
  assert.equal(table.rows.length, MAX_SHEET_ROWS);
  assert.equal(table.truncatedRows, true);
  assert.equal(table.truncatedCols, true);
  assert.ok(elapsed < 5_000, `parse took too long (${elapsed}ms)`);
});

test("parseWorkbookWithXlsx: clips very wide sheets before sheet_to_json", () => {
  const wideHeader = Array.from({ length: 400 }, (_, i) => `C${i}`);
  const wideBody = Array.from({ length: 20 }, (_, r) =>
    wideHeader.map((_, c) => `${r}:${c}`),
  );
  const buf = workbookBuffer({ Wide: [wideHeader, ...wideBody] });
  const table = parseWorkbookWithXlsx(XLSX, buf);
  assert.equal(table.headers.length, MAX_SHEET_COLS);
  assert.equal(table.rows[0]?.length, MAX_SHEET_COLS);
  assert.equal(table.truncatedCols, true);
  assert.equal(table.truncatedRows, false);
});

void (async () => {
  await testAsync("CSV buffer path caps bytes and flags truncation", async () => {
    const header = "a,b\n";
    const row = "1,2\n";
    const big = header + row.repeat(
      Math.ceil((MAX_CSV_PREVIEW_CHARS + 10_000) / row.length),
    );
    const buf = new TextEncoder().encode(big).buffer;
    assert.ok(buf.byteLength > MAX_CSV_PREVIEW_CHARS);
    const table = await loadSpreadsheetPreviewFromBuffer(buf, "big.csv");
    assert.equal(table.headerMode, "firstRow");
    assert.equal(table.truncatedRows, true);
    assert.ok(table.rows.length <= MAX_SHEET_ROWS);
  });
  console.log("All rich-file-preview tests passed.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
