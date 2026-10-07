/**
 * Client-side loaders for in-app document preview (Documents explorer + lender delivery).
 * Prefer same-origin blob / parsed HTML over third-party Office viewers (CSP + public URL constraints).
 */

export type SpreadsheetPreviewTable = {
  sheetName: string;
  sheetNames: string[];
  headers: string[];
  rows: string[][];
  /** True when the sheet had more data rows than the preview cap. */
  truncatedRows: boolean;
  /** True when the sheet had more columns than the preview cap. */
  truncatedCols: boolean;
  /**
   * `letters` — Excel-style A/B/C headers; every sheet row is data (default for .xlsx/.xls).
   * `firstRow` — first AOA row is column headers (CSV).
   */
  headerMode: "letters" | "firstRow";
};

export type DocxPreviewResult = {
  title?: string;
  paragraphs: string[];
};

/** Preview caps — keep UI responsive for large workbooks. */
export const MAX_SHEET_ROWS = 500;
export const MAX_SHEET_COLS = 40;
/** Match prior text-preview budget so CSV cannot decode an entire 80MB vault object. */
export const MAX_CSV_PREVIEW_CHARS = 120_000;
const MAX_DOCX_PARAS = 800;

/** 0 → A, 25 → Z, 26 → AA (Excel column labels). */
export function excelColLabel(index: number): string {
  let n = index;
  let label = "";
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function cellToDisplayString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return String(value);
}

function padRow(row: unknown[], colCount: number): string[] {
  return Array.from({ length: colCount }, (_, i) =>
    cellToDisplayString(row[i]),
  );
}

function normalizeMatrix(
  aoa: unknown[][],
  opts: {
    truncatedRows: boolean;
    truncatedCols: boolean;
    /** CSV: first row is headers. Workbooks: Excel letters + all rows as data. */
    firstRowIsHeader: boolean;
    /** Prefer this width when known from sheet `!ref` (avoids title-row collapse). */
    forcedColCount?: number;
  },
): {
  headers: string[];
  rows: string[][];
  truncatedRows: boolean;
  truncatedCols: boolean;
  headerMode: "letters" | "firstRow";
} {
  const scannedWidth = aoa.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0,
  );
  const width = Math.max(scannedWidth, opts.forcedColCount ?? 0);
  const colCount = Math.min(Math.max(width, 0), MAX_SHEET_COLS);

  if (opts.firstRowIsHeader) {
    const headerSource = (aoa[0] ?? []) as unknown[];
    const headers = Array.from({ length: colCount }, (_, i) => {
      const raw = cellToDisplayString(headerSource[i]).trim();
      return raw || excelColLabel(i);
    });
    const body = aoa.slice(1, MAX_SHEET_ROWS + 1);
    return {
      headers,
      rows: body.map((row) => padRow(Array.isArray(row) ? row : [], colCount)),
      truncatedRows: opts.truncatedRows,
      truncatedCols: opts.truncatedCols,
      headerMode: "firstRow",
    };
  }

  // Workbooks: never treat row 1 as exclusive headers — title-only first rows
  // used to collapse the grid to a single column (Balance Sheet.xlsx bug).
  const headers = Array.from({ length: colCount }, (_, i) => excelColLabel(i));
  const rows = aoa
    .slice(0, MAX_SHEET_ROWS)
    .map((row) => padRow(Array.isArray(row) ? row : [], colCount));
  return {
    headers,
    rows,
    truncatedRows: opts.truncatedRows,
    truncatedCols: opts.truncatedCols,
    headerMode: "letters",
  };
}

async function loadCsvFromText(
  text: string,
  opts?: { inputTruncated?: boolean },
): Promise<SpreadsheetPreviewTable> {
  const Papa = (await import("papaparse")).default;
  const truncatedInput =
    Boolean(opts?.inputTruncated) || text.length > MAX_CSV_PREVIEW_CHARS;
  const capped = text.length > MAX_CSV_PREVIEW_CHARS
    ? text.slice(0, MAX_CSV_PREVIEW_CHARS)
    : text;
  const parsed = Papa.parse<string[]>(capped, {
    skipEmptyLines: true,
  });
  const all = (parsed.data ?? []).filter((row) => Array.isArray(row));
  const truncatedRows = truncatedInput || all.length > MAX_SHEET_ROWS + 1;
  const width = all.reduce((max, row) => Math.max(max, row.length), 0);
  const truncatedCols = width > MAX_SHEET_COLS;
  const normalized = normalizeMatrix(all.slice(0, MAX_SHEET_ROWS + 1), {
    truncatedRows,
    truncatedCols,
    firstRowIsHeader: true,
  });
  return {
    sheetName: "CSV",
    sheetNames: ["CSV"],
    ...normalized,
  };
}

async function loadCsvFromBuffer(buf: ArrayBuffer): Promise<SpreadsheetPreviewTable> {
  const bytes = new Uint8Array(buf);
  const inputTruncated = bytes.byteLength > MAX_CSV_PREVIEW_CHARS;
  const slice = bytes.subarray(0, MAX_CSV_PREVIEW_CHARS);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  return loadCsvFromText(text, { inputTruncated });
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
  return res.arrayBuffer();
}

/** Fetch remote file bytes and expose as a same-origin blob URL (fixes Convex iframe framing). */
export async function fetchAsBlobUrl(
  url: string,
  contentType: string,
): Promise<string> {
  const buf = await fetchArrayBuffer(url);
  const blob = new Blob([buf], { type: contentType || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

export async function loadTextPreview(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load text (${res.status})`);
  const t = await res.text();
  return t.length > MAX_CSV_PREVIEW_CHARS
    ? `${t.slice(0, MAX_CSV_PREVIEW_CHARS)}\n\n…`
    : t;
}

export async function loadCsvPreview(url: string): Promise<SpreadsheetPreviewTable> {
  const buf = await fetchArrayBuffer(url);
  return loadCsvFromBuffer(buf);
}

/**
 * Parse workbook bytes (OOXML .xlsx or BIFF .xls) into a capped table.
 * One SheetJS read with `sheetRows`; clips `!ref` before `sheet_to_json` so wide
 * sheets do not materialize thousands of columns. `SheetNames` stays complete with
 * `sheets` filtering, so tab labels remain available.
 */
export function parseWorkbookWithXlsx(
  XLSX: typeof import("xlsx"),
  buf: ArrayBuffer,
  sheetName?: string,
): SpreadsheetPreviewTable {
  // Names-only pass is cheap; then parse only the active sheet body.
  const stub = XLSX.read(buf, { type: "array", bookSheets: true });
  const sheetNames = stub.SheetNames ?? [];
  if (sheetNames.length === 0) {
    return {
      sheetName: "Sheet1",
      sheetNames: ["Sheet1"],
      headers: [],
      rows: [],
      truncatedRows: false,
      truncatedCols: false,
      headerMode: "letters",
    };
  }
  const name =
    (sheetName && sheetNames.includes(sheetName) && sheetName) ||
    sheetNames[0]!;

  // All rows are data (no exclusive header row) + 1 sentinel for truncation.
  const dataRowBudget = MAX_SHEET_ROWS + 1;
  const wb = XLSX.read(buf, {
    type: "array",
    cellDates: true,
    sheets: [name],
    sheetRows: dataRowBudget,
  });
  const sheet = wb.Sheets[name];
  if (!sheet) {
    throw new Error(`Worksheet "${name}" was not found in this workbook.`);
  }

  let truncatedRows = false;
  let truncatedCols = false;
  let forcedColCount = 0;
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    truncatedRows = range.e.r + 1 >= dataRowBudget;
    truncatedCols = range.e.c + 1 > MAX_SHEET_COLS;
    forcedColCount = Math.min(range.e.c + 1, MAX_SHEET_COLS);
    range.e.r = Math.min(range.e.r, MAX_SHEET_ROWS - 1);
    range.e.c = Math.min(range.e.c, MAX_SHEET_COLS - 1);
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }

  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  const matrix = Array.isArray(aoa) ? aoa : [];
  if (matrix.length > MAX_SHEET_ROWS) truncatedRows = true;

  const normalized = normalizeMatrix(matrix, {
    truncatedRows,
    truncatedCols,
    firstRowIsHeader: false,
    forcedColCount,
  });

  return {
    sheetName: name,
    sheetNames,
    ...normalized,
  };
}

export async function loadXlsxPreviewFromBuffer(
  buf: ArrayBuffer,
  sheetName?: string,
): Promise<SpreadsheetPreviewTable> {
  const XLSX = await import("xlsx");
  try {
    return parseWorkbookWithXlsx(XLSX, buf, sheetName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not parse this spreadsheet. Download the file or re-save as .xlsx / .csv. (${msg})`,
    );
  }
}

export async function loadXlsxPreview(
  url: string,
  sheetName?: string,
): Promise<SpreadsheetPreviewTable> {
  const buf = await fetchArrayBuffer(url);
  return loadXlsxPreviewFromBuffer(buf, sheetName);
}

export async function loadSpreadsheetPreview(
  url: string,
  fileName: string,
  sheetName?: string,
): Promise<SpreadsheetPreviewTable> {
  const buf = await fetchArrayBuffer(url);
  return loadSpreadsheetPreviewFromBuffer(buf, fileName, sheetName);
}

export async function loadSpreadsheetPreviewFromBuffer(
  buf: ArrayBuffer,
  fileName: string,
  sheetName?: string,
): Promise<SpreadsheetPreviewTable> {
  const n = fileName.toLowerCase();
  if (n.endsWith(".csv")) {
    return loadCsvFromBuffer(buf);
  }
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) {
    return loadXlsxPreviewFromBuffer(buf, sheetName);
  }
  try {
    return await loadXlsxPreviewFromBuffer(buf, sheetName);
  } catch {
    return loadCsvFromBuffer(buf);
  }
}

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>/gi, "\t")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<w:br\s*\/>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function loadDocxPreview(url: string): Promise<DocxPreviewResult> {
  const JSZip = (await import("jszip")).default;
  const buf = await fetchArrayBuffer(url);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) {
    throw new Error("Not a valid .docx file (missing word/document.xml).");
  }
  const core = await zip.file("docProps/core.xml")?.async("string");
  let title: string | undefined;
  if (core) {
    const m = core.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/i);
    if (m?.[1]?.trim()) title = m[1].trim();
  }
  const text = stripXmlTags(docXml);
  const paragraphs = text
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_DOCX_PARAS);
  return { title, paragraphs };
}

/** True for legacy Word binary (.doc). .xls is previewable via SheetJS. */
export function isLegacyBinaryOfficeName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".doc") && !fileName.toLowerCase().endsWith(".docx");
}
