import { PDFDocument, degrees } from "pdf-lib";

export async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load PDF (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Rotate every page by delta degrees (positive = CW in pdf-lib setRotation). */
export async function rotatePdfAllPages(
  bytes: Uint8Array,
  deltaDegrees: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  for (const page of pages) {
    const current = page.getRotation().angle;
    page.setRotation(degrees(current + deltaDegrees));
  }
  return doc.save();
}

/** Keep only 1-based page numbers from the source PDF. */
export async function extractPdfPages(
  bytes: Uint8Array,
  oneBasedPages: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const indices = oneBasedPages
    .map((p) => Math.floor(p) - 1)
    .filter((i) => i >= 0 && i < total);
  if (indices.length === 0) {
    throw new Error("No valid pages selected.");
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return out.save();
}

/** Append all pages from `appendBytes` to the base document. */
export async function mergePdfAppend(
  baseBytes: Uint8Array,
  appendBytes: Uint8Array,
): Promise<Uint8Array> {
  const base = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const extra = await PDFDocument.load(appendBytes, { ignoreEncryption: true });
  const copied = await base.copyPages(extra, extra.getPageIndices());
  for (const page of copied) base.addPage(page);
  return base.save();
}

export function pdfBytesToFile(bytes: Uint8Array, fileName: string): File {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const name = fileName.toLowerCase().endsWith(".pdf")
    ? fileName
    : `${fileName.replace(/\.[^.]+$/, "")}.pdf`;
  return new File([blob], name, { type: "application/pdf" });
}

export function parsePageListInput(input: string, maxPage: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(/[,;\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [a, b] = trimmed.split("-").map((x) => parseInt(x.trim(), 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let p = lo; p <= hi; p++) {
        if (p >= 1 && p <= maxPage) out.add(p);
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (Number.isFinite(p) && p >= 1 && p <= maxPage) out.add(p);
    }
  }
  return [...out].sort((a, b) => a - b);
}
