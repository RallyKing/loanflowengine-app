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
};

export type DocxPreviewResult = {
  title?: string;
  paragraphs: string[];
};

/** Preview caps — keep UI responsive for large workbooks. */
export const MAX_SHEET_ROWS = 500;
export const MAX_SHEET_COLS = 40;
const MAX_DOCX_PARAS = 800;

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

function normalizeMatrix(
  aoa: unknown[][],
  opts?: { truncatedRows?: boolean; truncatedCols?: boolean },
): {
  headers: string[];
  rows: string[][];
  truncatedRows: boolean;
  truncatedCols: boolean;
} {
  const width = aoa.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0,
  );
  const truncatedRows =
    (opts?.truncatedRows ?? false) || aoa.length > MAX_SHEET_ROWS + 1;
  const truncatedCols =
    (opts?.truncatedCols ?? false) || width > MAX_SHEET_COLS;
  const colCount = Math.min(Math.max(width, 0), MAX_SHEET_COLS);

  const headerSource = (aoa[0] ?? []) as unknown[];
  const headers = Array.from({ length: colCount }, (_, i) => {
    const raw = cellToDisplayString(headerSource[i]).trim();
    return raw || `Col ${i + 1}`;
  });

  const body = aoa.slice(1, MAX_SHEET_ROWS + 1);
  const rows = body.map((row) => {
    const src = Array.isArray(row) ? row : [];
    return Array.from({ length: colCount }, (_, i) =>
      cellToDisplayString(src[i]),
    );
  });

  return { headers, rows, truncatedRows, truncatedCols };
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
  return t.length > 120_000 ? `${t.slice(0, 120_000)}\n\n…` : t;
}

export async function loadCsvPreview(url: string): Promise<SpreadsheetPreviewTable> {
  const Papa = (await import("papaparse")).default;
  const text = await loadTextPreview(url);
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  const all = (parsed.data ?? []).filter((row) => Array.isArray(row));
  const { headers, rows, truncatedRows, truncatedCols } = normalizeMatrix(all);
  return {
    sheetName: "CSV",
    sheetNames: ["CSV"],
    headers,
    rows,
    truncatedRows,
    truncatedCols,
  };
}

/**
 * Parse workbook bytes (OOXML .xlsx or BIFF .xls) into a capped table.
 * Uses SheetJS `bookSheets` + `sheets` + `sheetRows` so large sheets are not fully materialized.
 */
export function parseWorkbookWithXlsx(
  XLSX: typeof import("xlsx"),
  buf: ArrayBuffer,
  sheetName?: string,
): SpreadsheetPreviewTable {
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
    };
  }
  const name =
    (sheetName && sheetNames.includes(sheetName) && sheetName) ||
    sheetNames[0]!;

  // header + MAX body + 1 sentinel row to detect truncation without full parse
  const rowBudget = MAX_SHEET_ROWS + 2;
  const wb = XLSX.read(buf, {
    type: "array",
    cellDates: true,
    sheets: [name],
    sheetRows: rowBudget,
  });
  const sheet = wb.Sheets[name];
  if (!sheet) {
    throw new Error(`Worksheet "${name}" was not found in this workbook.`);
  }

  let truncatedColsFromRef = false;
  if (sheet["!ref"]) {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    truncatedColsFromRef = range.e.c + 1 > MAX_SHEET_COLS;
  }

  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  const matrix = Array.isArray(aoa) ? aoa : [];
  const truncatedRows = matrix.length > MAX_SHEET_ROWS + 1;
  const { headers, rows, truncatedRows: tr, truncatedCols: tc } = normalizeMatrix(
    matrix.slice(0, MAX_SHEET_ROWS + 1),
    {
      truncatedRows,
      truncatedCols: truncatedColsFromRef,
    },
  );

  return {
    sheetName: name,
    sheetNames,
    headers,
    rows,
    truncatedRows: tr,
    truncatedCols: tc || truncatedColsFromRef,
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
  const n = fileName.toLowerCase();
  if (n.endsWith(".csv")) {
    return loadCsvPreview(url);
  }
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) {
    return loadXlsxPreview(url, sheetName);
  }
  try {
    return await loadXlsxPreview(url, sheetName);
  } catch {
    return loadCsvPreview(url);
  }
}

export async function loadSpreadsheetPreviewFromBuffer(
  buf: ArrayBuffer,
  fileName: string,
  sheetName?: string,
): Promise<SpreadsheetPreviewTable> {
  const n = fileName.toLowerCase();
  if (n.endsWith(".csv")) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const all = (parsed.data ?? []).filter((row) => Array.isArray(row));
    const { headers, rows, truncatedRows, truncatedCols } = normalizeMatrix(all);
    return {
      sheetName: "CSV",
      sheetNames: ["CSV"],
      headers,
      rows,
      truncatedRows,
      truncatedCols,
    };
  }
  return loadXlsxPreviewFromBuffer(buf, sheetName);
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
