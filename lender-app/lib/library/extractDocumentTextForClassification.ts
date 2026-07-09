import { configurePdfjsWorker } from "@/lib/library/pdfjsWorker";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";

const MAX_PAGES = 2;
const MAX_CHARS = 12_000;

async function extractPdfPreviewText(file: File): Promise<string> {
  await configurePdfjsWorker();
  const pdfjs = await import("pdfjs-dist");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) parts.push(pageText);
  }

  return parts.join("\n\n").slice(0, MAX_CHARS);
}

async function extractImageHintText(file: File): Promise<string> {
  return `Image file: ${file.name}`;
}

/** Extract first 1–2 pages of text for AI classification (client-side). */
export async function extractDocumentTextForClassification(
  file: File,
): Promise<string> {
  const kind = guessAttachmentKind(file.type, file.name);
  try {
    if (kind === "pdf") {
      return await extractPdfPreviewText(file);
    }
    if (kind === "image") {
      return await extractImageHintText(file);
    }
    return file.name;
  } catch {
    return file.name;
  }
}

export async function extractDocumentTextFromUrl(options: {
  url: string;
  contentType?: string;
  fileName: string;
}): Promise<string> {
  const kind = guessAttachmentKind(options.contentType, options.fileName);
  if (kind !== "pdf" && kind !== "image") {
    return options.fileName;
  }
  try {
    const res = await fetch(options.url, { cache: "no-store" });
    if (!res.ok) return options.fileName;
    const blob = await res.blob();
    const file = new File([blob], options.fileName, {
      type: options.contentType || blob.type,
    });
    return await extractDocumentTextForClassification(file);
  } catch {
    return options.fileName;
  }
}
