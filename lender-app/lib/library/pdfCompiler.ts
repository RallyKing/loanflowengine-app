import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getPdfPageCount } from "@/lib/library/pdfManipulation";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN = 54;
const LINE_HEIGHT = 16;

export type DealBibleCompileItem = {
  title: string;
  url: string;
  contentType?: string;
};

export type DealBibleCompileProgress = {
  phase: "fetching" | "normalizing" | "assembling" | "done";
  current: number;
  total: number;
  message?: string;
};

type NormalizedSource = {
  title: string;
  bytes: Uint8Array;
  pageCount: number;
};

function isPdfContentType(contentType?: string, url?: string): boolean {
  if (contentType?.toLowerCase().includes("pdf")) return true;
  return (url ?? "").toLowerCase().includes(".pdf");
}

function isImageContentType(contentType?: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  return ct.startsWith("image/");
}

async function imageBytesToSinglePagePdf(
  bytes: Uint8Array,
  contentType?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const isPng =
    contentType?.toLowerCase().includes("png") ||
    bytes[0] === 0x89;
  const embedded = isPng
    ? await doc.embedPng(bytes)
    : await doc.embedJpg(bytes);

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

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load file (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function normalizeToPdfBytes(
  item: DealBibleCompileItem,
): Promise<Uint8Array> {
  const raw = await fetchBytes(item.url);
  if (isPdfContentType(item.contentType, item.url)) {
    return raw;
  }
  if (isImageContentType(item.contentType)) {
    return imageBytesToSinglePagePdf(raw, item.contentType);
  }
  throw new Error(
    `"${item.title}" is not a supported format (PDF or image required).`,
  );
}

async function drawCoverPage(
  doc: PDFDocument,
  packageTitle: string,
  subtitle: string,
) {
  const page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText("Deal Bible", {
    x: MARGIN,
    y: LETTER_HEIGHT - 100,
    size: 28,
    font: bold,
    color: rgb(0.12, 0.14, 0.2),
  });
  page.drawText(packageTitle, {
    x: MARGIN,
    y: LETTER_HEIGHT - 140,
    size: 16,
    font: regular,
    color: rgb(0.2, 0.22, 0.28),
  });
  if (subtitle) {
    page.drawText(subtitle, {
      x: MARGIN,
      y: LETTER_HEIGHT - 168,
      size: 12,
      font: regular,
      color: rgb(0.35, 0.38, 0.45),
    });
  }
  page.drawText(`Compiled ${new Date().toLocaleDateString()}`, {
    x: MARGIN,
    y: LETTER_HEIGHT - 196,
    size: 10,
    font: regular,
    color: rgb(0.45, 0.48, 0.55),
  });
}

function truncateTitle(title: string, max = 52): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function drawTocPage(
  doc: PDFDocument,
  entries: Array<{ title: string; page: number }>,
) {
  const page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText("Table of Contents", {
    x: MARGIN,
    y: LETTER_HEIGHT - 64,
    size: 18,
    font: bold,
    color: rgb(0.12, 0.14, 0.2),
  });

  let y = LETTER_HEIGHT - 100;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const label = `${i + 1}. ${truncateTitle(entry.title)}`;
    const dots = ".".repeat(
      Math.max(4, 52 - label.length - String(entry.page).length),
    );
    const line = `${label} ${dots} Page ${entry.page}`;
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 10,
      font: regular,
      color: rgb(0.15, 0.17, 0.22),
      maxWidth: LETTER_WIDTH - MARGIN * 2,
    });
    y -= LINE_HEIGHT;
    if (y < MARGIN + LINE_HEIGHT) break;
  }
}

/**
 * Client-side Deal Bible compiler: cover + TOC + merged vault documents.
 */
export async function compileDealBible(options: {
  items: DealBibleCompileItem[];
  packageTitle: string;
  subtitle?: string;
  onProgress?: (progress: DealBibleCompileProgress) => void;
}): Promise<Uint8Array> {
  const { items, packageTitle, subtitle = "", onProgress } = options;
  if (items.length === 0) {
    throw new Error("Select at least one document to compile.");
  }

  const normalized: NormalizedSource[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    onProgress?.({
      phase: "fetching",
      current: i + 1,
      total: items.length,
      message: item.title,
    });
    const bytes = await normalizeToPdfBytes(item);
    onProgress?.({
      phase: "normalizing",
      current: i + 1,
      total: items.length,
      message: item.title,
    });
    const pageCount = await getPdfPageCount(bytes);
    normalized.push({ title: item.title, bytes, pageCount });
  }

  const coverPageCount = 1;
  const tocPageCount = 1;
  let contentStartPage = coverPageCount + tocPageCount + 1;

  const tocEntries = normalized.map((src) => {
    const entry = { title: src.title, page: contentStartPage };
    contentStartPage += src.pageCount;
    return entry;
  });

  onProgress?.({
    phase: "assembling",
    current: 0,
    total: normalized.length,
    message: "Building cover & table of contents",
  });

  const master = await PDFDocument.create();
  await drawCoverPage(master, packageTitle, subtitle);
  await drawTocPage(master, tocEntries);

  for (let i = 0; i < normalized.length; i++) {
    const src = normalized[i]!;
    onProgress?.({
      phase: "assembling",
      current: i + 1,
      total: normalized.length,
      message: src.title,
    });
    const loaded = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
    const copied = await master.copyPages(loaded, loaded.getPageIndices());
    for (const page of copied) master.addPage(page);
  }

  onProgress?.({
    phase: "done",
    current: normalized.length,
    total: normalized.length,
  });

  return master.save();
}

export function downloadDealBiblePdf(bytes: Uint8Array, fileName: string) {
  const safe = fileName.replace(/[^\w\s.-]/g, "").trim() || "Deal_Bible";
  const name = safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function dealBibleFileName(contactOrDealLabel: string): string {
  const slug = contactOrDealLabel
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  return `Deal_Bible_${slug || "Package"}.pdf`;
}
