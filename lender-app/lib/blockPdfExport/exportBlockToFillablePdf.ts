/**
 * Generic fillable PDF renderer for pipeline / workspace blocks.
 * Uses pdf-lib AcroForm text fields so clients can type in Adobe / Preview / browsers.
 */
import {
  PDFDocument,
  StandardFonts,
  TextAlignment,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFForm,
} from "pdf-lib";
import type {
  BlockPdfColumn,
  BlockPdfExportResult,
  BlockPdfExportSpec,
  BlockPdfField,
  BlockPdfSection,
  BlockPdfTableRow,
} from "./types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 44;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COLOR = {
  ink: rgb(0.12, 0.14, 0.18),
  muted: rgb(0.35, 0.38, 0.42),
  line: rgb(0.78, 0.8, 0.84),
  sectionBg: rgb(0.95, 0.96, 0.97),
  fieldBg: rgb(1, 1, 1),
  fieldBorder: rgb(0.62, 0.65, 0.7),
  accent: rgb(0.16, 0.28, 0.42),
};

function sanitizeFileName(title: string): string {
  const base = title.replace(/[^\w\s.-]/g, "").trim() || "document";
  const slug = base.replace(/\s+/g, "_").slice(0, 80);
  return slug.toLowerCase().endsWith(".pdf") ? slug : `${slug}.pdf`;
}

/** Helvetica/WinAnsi-safe text for drawText / form values. */
function winAnsiSafe(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

type LayoutCtx = {
  doc: PDFDocument;
  form: PDFForm;
  font: PDFFont;
  fontBold: PDFFont;
  page: PDFPage;
  y: number;
  pageIndex: number;
  fieldCount: number;
  shortTitle: string;
};

function ensureSpace(ctx: LayoutCtx, needed: number): void {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  drawFooter(ctx);
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageIndex += 1;
  ctx.y = PAGE_H - MARGIN_TOP;
  drawPageChrome(ctx);
}

function drawFooter(ctx: LayoutCtx): void {
  const label = `Page ${ctx.pageIndex}`;
  ctx.page.drawText(label, {
    x: PAGE_W - MARGIN_X - ctx.font.widthOfTextAtSize(label, 8),
    y: 22,
    size: 8,
    font: ctx.font,
    color: COLOR.muted,
  });
}

function drawPageChrome(ctx: LayoutCtx): void {
  // Subtle top rule on continuation pages
  if (ctx.pageIndex > 1) {
    const continued = `${ctx.shortTitle} (continued)`.slice(0, 90);
    ctx.page.drawText(continued, {
      x: MARGIN_X,
      y: ctx.y,
      size: 9,
      font: ctx.font,
      color: COLOR.muted,
    });
    ctx.y -= 16;
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y },
      end: { x: PAGE_W - MARGIN_X, y: ctx.y },
      thickness: 0.5,
      color: COLOR.line,
    });
    ctx.y -= 14;
  }
}

function drawWrappedText(
  ctx: LayoutCtx,
  text: string,
  opts: {
    x: number;
    maxWidth: number;
    size: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    lineGap?: number;
  },
): number {
  const font = opts.bold ? ctx.fontBold : ctx.font;
  const color = opts.color ?? COLOR.ink;
  const lineGap = opts.lineGap ?? 3;
  const words = winAnsiSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, opts.size) <= opts.maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length === 0) lines.push("");

  for (const l of lines) {
    ensureSpace(ctx, opts.size + lineGap + 2);
    ctx.page.drawText(l, {
      x: opts.x,
      y: ctx.y - opts.size,
      size: opts.size,
      font,
      color,
    });
    ctx.y -= opts.size + lineGap;
  }
  return lines.length;
}

function addTextField(
  ctx: LayoutCtx,
  name: string,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    value?: string;
    kind?: BlockPdfField["kind"];
    fontSize?: number;
  },
): void {
  const field = ctx.form.createTextField(name);
  if (opts.kind === "multiline") {
    field.enableMultiline();
  }
  if (opts.kind === "readonly") {
    field.enableReadOnly();
  }
  if (opts.kind === "money") {
    field.setAlignment(TextAlignment.Right);
  }
  // addToPage first so /DA exists before setFontSize / setText appearances
  field.addToPage(ctx.page, {
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    borderWidth: 0.75,
    borderColor: COLOR.fieldBorder,
    backgroundColor: opts.kind === "readonly" ? COLOR.sectionBg : COLOR.fieldBg,
    textColor: COLOR.ink,
    font: ctx.font,
  });
  try {
    field.setFontSize(opts.fontSize ?? 9);
  } catch {
    // Field remains fillable without explicit size
  }
  if (opts.value?.trim()) {
    try {
      field.setText(winAnsiSafe(opts.value));
    } catch {
      // pdf-lib can throw on unsupported glyphs — leave blank for client
    }
  }
  ctx.fieldCount += 1;
}

function drawDocumentHeader(ctx: LayoutCtx, spec: BlockPdfExportSpec): void {
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - 52,
    width: CONTENT_W,
    height: 56,
    color: COLOR.sectionBg,
    borderColor: COLOR.line,
    borderWidth: 0.75,
  });

  ctx.page.drawText(winAnsiSafe(spec.title), {
    x: MARGIN_X + 12,
    y: ctx.y - 22,
    size: 16,
    font: ctx.fontBold,
    color: COLOR.accent,
  });

  const subtitle = winAnsiSafe(
    spec.subtitle?.trim() ||
      "Complete all applicable fields. Dollar amounts: round up to whole dollars.",
  );
  ctx.page.drawText(subtitle.slice(0, 110), {
    x: MARGIN_X + 12,
    y: ctx.y - 40,
    size: 8.5,
    font: ctx.font,
    color: COLOR.muted,
  });

  ctx.y -= 68;
}

function drawSectionTitle(ctx: LayoutCtx, title: string): void {
  ensureSpace(ctx, 28);
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - 18,
    width: CONTENT_W,
    height: 20,
    color: COLOR.accent,
  });
  ctx.page.drawText(winAnsiSafe(title), {
    x: MARGIN_X + 8,
    y: ctx.y - 13,
    size: 10,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  ctx.y -= 26;
}

function layoutFieldPair(
  ctx: LayoutCtx,
  left: BlockPdfField | undefined,
  right: BlockPdfField | undefined,
): void {
  const labelH = 11;
  const fieldH = left?.kind === "multiline" || right?.kind === "multiline" ? 48 : 18;
  const gap = 12;
  const colW = (CONTENT_W - gap) / 2;
  ensureSpace(ctx, labelH + fieldH + 10);

  const drawOne = (field: BlockPdfField, x: number, width: number) => {
    ctx.page.drawText(winAnsiSafe(field.label), {
      x,
      y: ctx.y - 9,
      size: 8,
      font: ctx.font,
      color: COLOR.muted,
    });
    addTextField(ctx, field.id, {
      x,
      y: ctx.y - labelH - fieldH,
      width,
      height: fieldH,
      value: field.value,
      kind: field.kind ?? "text",
    });
  };

  if (left?.fullWidth || (left && !right)) {
    const f = left!;
    const h = f.kind === "multiline" ? 56 : 18;
    ensureSpace(ctx, labelH + h + 10);
    ctx.page.drawText(winAnsiSafe(f.label), {
      x: MARGIN_X,
      y: ctx.y - 9,
      size: 8,
      font: ctx.font,
      color: COLOR.muted,
    });
    addTextField(ctx, f.id, {
      x: MARGIN_X,
      y: ctx.y - labelH - h,
      width: CONTENT_W,
      height: h,
      value: f.value,
      kind: f.kind ?? "text",
    });
    ctx.y -= labelH + h + 8;
    return;
  }

  if (left) drawOne(left, MARGIN_X, colW);
  if (right) drawOne(right, MARGIN_X + colW + gap, colW);
  ctx.y -= labelH + fieldH + 8;
}

function layoutFields(ctx: LayoutCtx, fields: BlockPdfField[]): void {
  let i = 0;
  while (i < fields.length) {
    const a = fields[i]!;
    if (a.fullWidth || a.kind === "multiline") {
      layoutFieldPair(ctx, a, undefined);
      i += 1;
      continue;
    }
    const b = fields[i + 1];
    if (b && !b.fullWidth && b.kind !== "multiline") {
      layoutFieldPair(ctx, a, b);
      i += 2;
    } else {
      layoutFieldPair(ctx, a, undefined);
      i += 1;
    }
  }
}

function padRows(
  rows: BlockPdfTableRow[] | undefined,
  minRows: number | undefined,
  columns: BlockPdfColumn[],
): BlockPdfTableRow[] {
  const out = [...(rows ?? [])];
  const floor = Math.max(minRows ?? 0, out.length, 1);
  while (out.length < floor) {
    const blank: BlockPdfTableRow = {};
    for (const col of columns) blank[col.id] = "";
    out.push(blank);
  }
  return out;
}

function layoutTable(ctx: LayoutCtx, section: BlockPdfSection): void {
  const columns = section.columns ?? [];
  if (columns.length === 0) return;

  const rows = padRows(section.rows, section.minRows, columns);
  const totalWeight = columns.reduce((s, c) => s + (c.weight ?? 1), 0);
  const widths = columns.map((c) => ((c.weight ?? 1) / totalWeight) * CONTENT_W);
  const headerH = 14;
  const rowH = 18;

  ensureSpace(ctx, headerH + rowH + 8);

  // Column headers
  let x = MARGIN_X;
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - headerH,
    width: CONTENT_W,
    height: headerH,
    color: COLOR.sectionBg,
    borderColor: COLOR.line,
    borderWidth: 0.5,
  });
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci]!;
    const w = widths[ci]!;
    ctx.page.drawText(winAnsiSafe(col.label), {
      x: x + 3,
      y: ctx.y - 10,
      size: 7,
      font: ctx.fontBold,
      color: COLOR.muted,
    });
    x += w;
  }
  ctx.y -= headerH + 2;

  rows.forEach((row, ri) => {
    ensureSpace(ctx, rowH + 4);
    let cx = MARGIN_X;
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci]!;
      const w = widths[ci]!;
      const fieldId = `${section.id}.r${ri}.${col.id}`;
      addTextField(ctx, fieldId, {
        x: cx,
        y: ctx.y - rowH,
        width: Math.max(24, w - 1),
        height: rowH - 1,
        value: row[col.id],
        kind: col.kind ?? "text",
        fontSize: 8,
      });
      cx += w;
    }
    ctx.y -= rowH + 2;
  });
  ctx.y -= 6;
}

function layoutSection(ctx: LayoutCtx, section: BlockPdfSection): void {
  drawSectionTitle(ctx, section.title);
  if (section.description?.trim()) {
    drawWrappedText(ctx, section.description.trim(), {
      x: MARGIN_X,
      maxWidth: CONTENT_W,
      size: 8,
      color: COLOR.muted,
    });
    ctx.y -= 4;
  }
  if (section.fields?.length) {
    layoutFields(ctx, section.fields);
  }
  if (section.columns?.length) {
    layoutTable(ctx, section);
  }
}

/**
 * Build a multi-page, AcroForm-fillable PDF from a block export spec.
 * Prefills known values; empty fields remain editable for the client.
 */
export async function exportBlockToFillablePdf(
  spec: BlockPdfExportSpec,
): Promise<BlockPdfExportResult> {
  const doc = await PDFDocument.create();
  doc.setTitle(spec.title);
  doc.setSubject(`Fillable export · ${spec.blockId}`);
  doc.setCreator("Direct Lending Connection");
  doc.setProducer("DLC BlockPdfExport");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const ctx: LayoutCtx = {
    doc,
    form,
    font,
    fontBold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_TOP,
    pageIndex: 1,
    fieldCount: 0,
    shortTitle: spec.title.slice(0, 60),
  };

  drawDocumentHeader(ctx, spec);

  for (const section of spec.sections) {
    layoutSection(ctx, section);
  }

  if (spec.footerNote?.trim()) {
    ensureSpace(ctx, 40);
    ctx.y -= 6;
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y },
      end: { x: PAGE_W - MARGIN_X, y: ctx.y },
      thickness: 0.5,
      color: COLOR.line,
    });
    ctx.y -= 12;
    drawWrappedText(ctx, spec.footerNote.trim(), {
      x: MARGIN_X,
      maxWidth: CONTENT_W,
      size: 8,
      color: COLOR.muted,
    });
  }

  drawFooter(ctx);

  // Update appearances so field values show in more PDF readers
  try {
    form.updateFieldAppearances(font);
  } catch {
    // Non-fatal — fields remain fillable
  }

  const bytes = await doc.save({ updateFieldAppearances: true });
  const fileName = sanitizeFileName(spec.fileName?.trim() || spec.title);

  return {
    bytes,
    fileName,
    fieldCount: ctx.fieldCount,
    pageCount: doc.getPageCount(),
  };
}
