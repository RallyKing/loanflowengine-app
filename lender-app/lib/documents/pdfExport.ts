import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { vaultOutboundPdfFileName } from "@/lib/library/vaultOutboundFileName";

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

/** True when MIME or file name indicates a raster image the vault PDF path can convert. */
export function isVaultImageContentType(
  contentType?: string | null,
  fileName?: string | null,
): boolean {
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

/** Parse `data:image/...;base64,...` into raw bytes + MIME (pure; no DOM). */
export function parseDataUrlImage(src: string): {
  bytes: Uint8Array;
  contentType: string;
} | null {
  const trimmed = src.trim();
  const match = /^data:([^;,]+)?((?:;charset=[^;,]+)*)(;base64)?,([\s\S]*)$/i.exec(
    trimmed,
  );
  if (!match) return null;
  const mime = (match[1] ?? "application/octet-stream").trim().toLowerCase();
  const isBase64 = Boolean(match[3]);
  const payload = match[4] ?? "";
  if (!isBase64) return null;
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, contentType: mime };
  } catch {
    return null;
  }
}

/**
 * Extract `<img src>` values from HTML without a DOM (unit-testable).
 * Handles double/single/unquoted attributes; skips empty srcs.
 */
export function extractHtmlImageSrcs(html: string): string[] {
  const srcs: string[] = [];
  const re =
    /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (src) srcs.push(src);
  }
  return srcs;
}

async function rasterizeUnsupportedImage(
  bytes: Uint8Array,
  contentType?: string,
): Promise<Uint8Array> {
  const blob = new Blob([new Uint8Array(bytes)], {
    type: contentType || "image/png",
  });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Could not render image for PDF export.");
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pngUrl = canvas.toDataURL("image/png");
  const parsed = parseDataUrlImage(pngUrl);
  if (!parsed) throw new Error("Could not encode image for PDF export.");
  return parsed.bytes;
}

type EmbeddedPdfImage = Awaited<ReturnType<PDFDocument["embedPng"]>>;

async function embedImageBytes(
  doc: PDFDocument,
  bytes: Uint8Array,
  contentType?: string,
): Promise<EmbeddedPdfImage> {
  const ct = (contentType ?? "").toLowerCase();
  const isPng = ct.includes("png") || bytes[0] === 0x89;
  const isWebp =
    ct.includes("webp") || (bytes[0] === 0x52 && bytes[1] === 0x49);
  const isGif = ct.includes("gif") || (bytes[0] === 0x47 && bytes[1] === 0x49);

  if (isPng) {
    return doc.embedPng(bytes);
  }
  if (isWebp || isGif) {
    const pngBytes = await rasterizeUnsupportedImage(bytes, contentType);
    return doc.embedPng(pngBytes);
  }
  try {
    return await doc.embedJpg(bytes);
  } catch {
    const pngBytes = await rasterizeUnsupportedImage(bytes, contentType);
    return doc.embedPng(pngBytes);
  }
}

async function imageBytesToSinglePagePdf(
  bytes: Uint8Array,
  contentType?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const embedded = await embedImageBytes(doc, bytes, contentType);

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

type HtmlBlock =
  | { kind: "text"; text: string; size: number; bold?: boolean }
  | { kind: "spacer" }
  | { kind: "image"; src: string };

function collectHtmlBlocks(root: ParentNode): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];

  const pushText = (raw: string, size: number, bold?: boolean) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text) blocks.push({ kind: "text", text, size, bold });
  };

  const walk = (node: Node, size = 11, bold = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? "", size, bold);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "script" || tag === "style" || tag === "head") return;

    if (tag === "img") {
      const src = (el.getAttribute("src") ?? "").trim();
      if (src) blocks.push({ kind: "image", src });
      return;
    }

    if (tag === "br") {
      blocks.push({ kind: "spacer" });
      return;
    }

    if (tag === "h1") {
      for (const child of el.childNodes) walk(child, 18, true);
      blocks.push({ kind: "spacer" });
      return;
    }
    if (tag === "h2") {
      for (const child of el.childNodes) walk(child, 14, true);
      blocks.push({ kind: "spacer" });
      return;
    }

    if (
      tag === "p" ||
      tag === "div" ||
      tag === "li" ||
      tag === "section" ||
      tag === "article" ||
      tag === "figure" ||
      tag === "blockquote"
    ) {
      for (const child of el.childNodes) walk(child, size, bold);
      if (tag === "p" || tag === "li") blocks.push({ kind: "spacer" });
      return;
    }

    for (const child of el.childNodes) walk(child, size, bold);
  };

  walk(root);
  return blocks;
}

async function resolveImageSrc(
  src: string,
): Promise<{ bytes: Uint8Array; contentType?: string } | null> {
  if (src.startsWith("data:")) {
    return parseDataUrlImage(src);
  }
  if (src.startsWith("blob:")) {
    // Blob URLs from the editor session are not valid after save; skip gracefully.
    return null;
  }
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? undefined;
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType,
    };
  } catch {
    return null;
  }
}

async function htmlBytesToPdf(bytes: Uint8Array, title: string): Promise<Uint8Array> {
  const html = new TextDecoder().decode(bytes);
  const parser = new DOMParser();
  const docEl = parser.parseFromString(html, "text/html");
  const body = docEl.body;
  let blocks =
    body.childNodes.length > 0
      ? collectHtmlBlocks(body)
      : ([{ kind: "text", text: body.textContent?.trim() || title, size: 11 }] as HtmlBlock[]);

  // Fallback if the walker found only spacers but raw HTML has <img> tags.
  const hasImageBlock = blocks.some((b) => b.kind === "image");
  if (!hasImageBlock) {
    for (const src of extractHtmlImageSrcs(html)) {
      blocks.push({ kind: "image", src });
    }
  }

  if (
    blocks.length === 0 ||
    blocks.every((b) => b.kind === "spacer")
  ) {
    blocks = [{ kind: "text", text: title, size: 11 }];
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  let y = LETTER_HEIGHT - MARGIN;
  const maxWidth = LETTER_WIDTH - MARGIN * 2;
  const maxImageHeight = LETTER_HEIGHT - MARGIN * 2;

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

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      y = LETTER_HEIGHT - MARGIN;
    }
  };

  for (const block of blocks) {
    if (block.kind === "spacer") {
      y -= LINE_HEIGHT;
      continue;
    }

    if (block.kind === "image") {
      const resolved = await resolveImageSrc(block.src);
      if (!resolved) {
        ensureSpace(14);
        page.drawText("[Image unavailable]", {
          x: MARGIN,
          y,
          size: 10,
          font: regular,
          color: rgb(0.45, 0.45, 0.48),
        });
        y -= 16;
        continue;
      }
      try {
        const embedded = await embedImageBytes(
          pdf,
          resolved.bytes,
          resolved.contentType,
        );
        const scale = Math.min(
          maxWidth / embedded.width,
          maxImageHeight / embedded.height,
          1,
        );
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        ensureSpace(h + 8);
        page.drawImage(embedded, {
          x: MARGIN,
          y: y - h,
          width: w,
          height: h,
        });
        y -= h + 12;
      } catch {
        ensureSpace(14);
        page.drawText("[Image could not be rendered]", {
          x: MARGIN,
          y,
          size: 10,
          font: regular,
          color: rgb(0.45, 0.45, 0.48),
        });
        y -= 16;
      }
      continue;
    }

    const font = block.bold ? boldFont : regular;
    for (const line of wrapText(block.text, block.size, font)) {
      ensureSpace(block.size + 6);
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

  if (isVaultImageContentType(source.contentType, source.fileName)) {
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

export function downloadPdfBytes(
  bytes: Uint8Array,
  title: string,
  options?: { fileName?: string },
): void {
  const name = options?.fileName
    ? options.fileName.toLowerCase().endsWith(".pdf")
      ? options.fileName
      : `${options.fileName}.pdf`
    : sanitizePdfFileName(title);
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
  const outboundName = source.fileName
    ? vaultOutboundPdfFileName(source.title, source.fileName)
    : sanitizePdfFileName(source.title);
  downloadPdfBytes(bytes, source.title, { fileName: outboundName });
}
