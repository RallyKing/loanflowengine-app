/**
 * Shared block → fillable PDF export contract.
 *
 * Other blocks plug in by building a `BlockPdfExportSpec` and calling
 * `exportBlockToFillablePdf(spec)` (see `index.ts`).
 */

export type BlockPdfFieldKind = "text" | "money" | "multiline" | "readonly";

export type BlockPdfField = {
  /** Unique within the document (used as AcroForm field name). */
  id: string;
  label: string;
  value?: string;
  kind?: BlockPdfFieldKind;
  /** Span the full content width (default: half for text/money pairs). */
  fullWidth?: boolean;
};

export type BlockPdfColumn = {
  id: string;
  label: string;
  /** Relative weight for column width (default 1). */
  weight?: number;
  kind?: Exclude<BlockPdfFieldKind, "multiline">;
};

export type BlockPdfTableRow = Record<string, string | undefined>;

export type BlockPdfSection = {
  id: string;
  title: string;
  description?: string;
  fields?: BlockPdfField[];
  /** Schedule / table layout (sections 2–4, 8). */
  columns?: BlockPdfColumn[];
  rows?: BlockPdfTableRow[];
  /**
   * Ensure at least this many fillable table rows (pads with blanks).
   * Useful for client-ready blank schedules.
   */
  minRows?: number;
};

export type BlockPdfExportSpec = {
  /** Stable block key (e.g. modular section id / atomic portal id). */
  blockId: string;
  title: string;
  subtitle?: string;
  footerNote?: string;
  sections: BlockPdfSection[];
  /** Download basename without path; `.pdf` appended if missing. */
  fileName?: string;
};

export type BlockPdfExportResult = {
  bytes: Uint8Array;
  fileName: string;
  fieldCount: number;
  pageCount: number;
};
