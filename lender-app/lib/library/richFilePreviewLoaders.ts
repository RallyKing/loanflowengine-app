/**
 * Client-side loaders for in-app document preview (Documents explorer + lender delivery).
 * Prefer same-origin blob / parsed HTML over third-party Office viewers (CSP + public URL constraints).
 */

export type SpreadsheetPreviewTable = {
  sheetName: string;
  sheetNames: string[];
  headers: string[];
  rows: string[][];
};

export type DocxPreviewResult = {
  title?: string;
  paragraphs: string[];
};

const MAX_SHEET_ROWS = 500;
const MAX_SHEET_COLS = 40;
const MAX_DOCX_PARAS = 800;

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value !== null && "text" in value) {
    const t = (value as { text?: unknown }).text;
    return t == null ? "" : String(t);
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    const r = (value as { result?: unknown }).result;
    return r == null ? "" : String(r);
  }
  return String(value);
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
  const headers = (all[0] ?? []).map((c) => String(c ?? ""));
  const body = all.slice(1, MAX_SHEET_ROWS + 1).map((row) =>
    row.slice(0, MAX_SHEET_COLS).map((c) => String(c ?? "")),
  );
  while (headers.length < MAX_SHEET_COLS && body.some((r) => r.length > headers.length)) {
    headers.push(`Col ${headers.length + 1}`);
  }
  return {
    sheetName: "CSV",
    sheetNames: ["CSV"],
    headers: headers.slice(0, MAX_SHEET_COLS),
    rows: body.map((r) => {
      const padded = [...r];
      while (padded.length < headers.length) padded.push("");
      return padded.slice(0, headers.length);
    }),
  };
}

export async function loadXlsxPreview(
  url: string,
  sheetName?: string,
): Promise<SpreadsheetPreviewTable> {
  const ExcelJS = (await import("exceljs")).default;
  const buf = await fetchArrayBuffer(url);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheetNames = wb.worksheets.map((ws) => ws.name);
  if (sheetNames.length === 0) {
    return { sheetName: "Sheet1", sheetNames: ["Sheet1"], headers: [], rows: [] };
  }
  const chosen =
    (sheetName && wb.getWorksheet(sheetName)) ||
    wb.worksheets[0]!;
  const name = chosen.name;

  const matrix: string[][] = [];
  chosen.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MAX_SHEET_ROWS + 1) return;
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > MAX_SHEET_COLS) return;
      while (values.length < colNumber - 1) values.push("");
      values.push(cellToString(cell.value));
    });
    matrix.push(values);
  });

  const headers = (matrix[0] ?? []).map((c, i) => c || `Col ${i + 1}`);
  const rows = matrix.slice(1).map((r) => {
    const padded = [...r];
    while (padded.length < headers.length) padded.push("");
    return padded.slice(0, headers.length);
  });

  return {
    sheetName: name,
    sheetNames,
    headers: headers.slice(0, MAX_SHEET_COLS),
    rows,
  };
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
    // exceljs reads OOXML (.xlsx). Legacy .xls may fail — caller shows fallback.
    return loadXlsxPreview(url, sheetName);
  }
  // Content-type-only spreadsheet: try xlsx then csv
  try {
    return await loadXlsxPreview(url, sheetName);
  } catch {
    return loadCsvPreview(url);
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

export function isLegacyBinaryOfficeName(fileName: string): boolean {
  const n = fileName.toLowerCase();
  return n.endsWith(".doc") || n.endsWith(".xls");
}
