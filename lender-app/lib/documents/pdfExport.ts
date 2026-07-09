import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 54;
const LINE_HEIGHT = 16;

export type VaultPdfExportSource = {
  title: string;
  url: string;
  contentType?: string;
  fileName?: string;
};

function sanitizePdfFileName(title: string): string {
  const base = title.replace(/[^\w\s.-]/g, "").trim() || "document";
  const slug = base.replace(/\s+/g, "_").slice(0, 80);
  return slug.toLowerCase().endsWith(".pdf") ? slug : `${slug}.pdf`;
}

function isPdfContentType(contentType?: string, url?: string, fileName?: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("pdf")) return true;
  const name = (fileName ?? url ?? "").toLowerCase();
  return name.endsWith(".pdf");
}

function isImageContentType(contentType?: string, fileName?: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const name = (fileName ?? "").toLowerCase();
  return /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function isHtmlContentType(contentType?: string, fileName?: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("html")) return true;
  return (fileName ?? "").toLowerCase().endsWith(".html");
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load file (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function imageBytesToSinglePagePdf(
  bytes: Uint8Array,
  contentType?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ct = (contentType ?? "").toLowerCase();
  const isPng = ct.includes("png") || bytes[0] === 0x89;

  let embedded;
  if (isPng) {
    embedded = await doc.embedPng(bytes);
  } else if (ct.includes("webp") || (bytes[0] === 0x52 && bytes[1] === 0x49)) {
    const blob = new Blob([new Uint8Array(bytes)], {
      type: contentType || "image/webp",
    });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not render image for PDF export.");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pngUrl = canvas.toDataURL("image/png");
    const pngBytes = Uint8Array.from(atob(pngUrl.split(",")[1] ?? ""), (c) =>
      c.charCodeAt(0),
    );
    embedded = await doc.embedPng(pngBytes);
  } else {
    embedded = await doc.embedJpg(bytes);
  }

  const scale = Math.min(
    (LETTER_WIDTH - MARGIN * 2) / embedded.width,
    (LETTER_HEIGHT - MARGIN * 2) / embedded.height,
    1,
  );
  const w = embedded.width * scale;
  const h = embedded.height * scale;
  const page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  page.drawImage(embedded, {
    x: (LETTER_WIDTH - w) / 2,
    y: (LETTER_HEIGHT - h) / 2,
    width: w,
    height: h,
  });
  return doc.save();
}

type TextBlock = { text: string; size: number; bold?: boolean };

function collectHtmlBlocks(root: ParentNode): TextBlock[] {
  const blocks: TextBlock[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ text, size: 11 });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      blocks.push({ text: "", size: 11 });
      return;
    }

    if (tag === "h1") {
      blocks.push({
        text: (el.textContent ?? "").trim(),
        size: 18,
        bold: true,
      });
      blocks.push({ text: "", size: 11 });
      return;
    }
    if (tag === "h2") {
      blocks.push({
        text: (el.textContent ?? "").trim(),
        size: 14,
        bold: true,
      });
      blocks.push({ text: "", size: 11 });
      return;
    }
    if (tag === "p" || tag === "div" || tag === "li") {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ text, size: 11 });
      blocks.push({ text: "", size: 11 });
      return;
    }

    for (const child of el.childNodes) walk(child);
  };

  walk(root);
  return blocks;
}

async function htmlBytesToPdf(bytes: Uint8Array, title: string): Promise<Uint8Array> {
  const html = new TextDecoder().decode(bytes);
  const parser = new DOMParser();
  const docEl = parser.parseFromString(html, "text/html");
  const body = docEl.body;
  const blocks =
    body.childNodes.length > 0
      ? collectHtmlBlocks(body)
      : [{ text: body.textContent?.trim() || title, size: 11 }];

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  let y = LETTER_HEIGHT - MARGIN;
  const maxWidth = LETTER_WIDTH - MARGIN * 2;

  const wrapText = (text: string, size: number, font: typeof regular): string[] => {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  for (const block of blocks) {
    if (!block.text) {
      y -= LINE_HEIGHT;
      continue;
    }
    const font = block.bold ? bold : regular;
    for (const line of wrapText(block.text, block.size, font)) {
      if (y < MARGIN + block.size) {
        page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
        y = LETTER_HEIGHT - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size: block.size,
        font,
        color: rgb(0.1, 0.1, 0.12),
      });
      y -= block.size + 6;
    }
    y -= 4;
  }

  return pdf.save();
}

async function plainTextToPdf(text: string, title: string): Promise<Uint8Array> {
  return htmlBytesToPdf(
    new TextEncoder().encode(`<html><body><p>${text || title}</p></body></html>`),
    title,
  );
}

export async function convertVaultAssetToPdfBytes(
  source: VaultPdfExportSource,
): Promise<Uint8Array> {
  const raw = await fetchBytes(source.url);

  if (isPdfContentType(source.contentType, source.url, source.fileName)) {
    return raw;
  }

  if (isImageContentType(source.contentType, source.fileName)) {
    return imageBytesToSinglePagePdf(raw, source.contentType);
  }

  if (isHtmlContentType(source.contentType, source.fileName)) {
    return htmlBytesToPdf(raw, source.title);
  }

  const ct = (source.contentType ?? "").toLowerCase();
  if (ct.startsWith("text/plain")) {
    return plainTextToPdf(new TextDecoder().decode(raw), source.title);
  }

  throw new Error(
    `"${source.title}" cannot be exported as PDF (supported: PDF, images, HTML, plain text).`,
  );
}

export function downloadPdfBytes(bytes: Uint8Array, title: string): void {
  const name = sanitizePdfFileName(title);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadVaultDocumentAsPdf(
  source: VaultPdfExportSource,
): Promise<void> {
  const bytes = await convertVaultAssetToPdfBytes(source);
  downloadPdfBytes(bytes, source.title);
}
