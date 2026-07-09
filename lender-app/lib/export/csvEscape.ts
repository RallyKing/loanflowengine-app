/**
 * Shared CSV/TSV escaping for browser-side exports (Browse, Ledger, Pipeline,
 * Tasks, Scenario, Discovery). Matches Excel-friendly quoting rules.
 */

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : typeof value === "bigint"
          ? value.toString()
          : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function joinCsvLine(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/** One row per call; uses CRLF line endings (common for Windows CSV). */
export function joinCsvDocument(lines: string[]): string {
  return lines.join("\r\n");
}

/**
 * Flatten a value for TSV / clipboard: no literal tabs or newlines so Excel
 * paste stays on one row per record.
 */
export function flattenForTsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  return s.replace(/[\t\r\n]/g, " ");
}

export function joinTsvLine(cells: unknown[]): string {
  return cells.map(flattenForTsv).join("\t");
}

export function joinTsvDocument(lines: string[]): string {
  return lines.join("\r\n");
}
