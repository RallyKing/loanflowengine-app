/**
 * Client-side extraction of vault files for AI Due Diligence.
 * Text/PDF/HTML/docs are inlined; images become vision payloads when the
 * selected provider supports vision. Never logs file bytes or data URLs.
 */

import { guessAttachmentKind, type AttachmentKind } from "@/lib/uploadToConvexStorage";
import { extractDocumentTextForClassification } from "@/lib/library/extractDocumentTextForClassification";
import {
  DUE_DILIGENCE_MAX_IMAGE_BYTES,
  DUE_DILIGENCE_MAX_IMAGES,
  DUE_DILIGENCE_MAX_TEXT_PER_FILE,
  type DueDiligenceExtractedFile,
  type DueDiligenceFileUse,
} from "./dueDiligenceJob";
import { providerSupportsVision, type OrgAiProviderKind } from "./orgAiProviders";

const HTML_STRIP = /<[^>]+>/g;

async function blobToText(blob: Blob): Promise<string> {
  return blob.text();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  const mime = blob.type || "image/png";
  return `data:${mime};base64,${b64}`;
}

async function extractTextualBlob(args: {
  blob: Blob;
  fileName: string;
  contentType?: string;
  kind: AttachmentKind;
}): Promise<{ text: string; usedAs: DueDiligenceFileUse; skipReason?: string }> {
  const file = new File([args.blob], args.fileName, {
    type: args.contentType || args.blob.type || "application/octet-stream",
  });

  if (args.kind === "pdf") {
    const text = (await extractDocumentTextForClassification(file)).trim();
    if (!text || text === args.fileName) {
      return {
        text: "",
        usedAs: "skipped",
        skipReason: "Could not extract text from this PDF.",
      };
    }
    return {
      text: text.slice(0, DUE_DILIGENCE_MAX_TEXT_PER_FILE),
      usedAs: "text",
    };
  }

  if (args.kind === "html" || args.kind === "text") {
    const raw = await blobToText(args.blob);
    const text =
      args.kind === "html"
        ? raw.replace(HTML_STRIP, " ").replace(/\s+/g, " ").trim()
        : raw.trim();
    if (!text) {
      return {
        text: "",
        usedAs: "skipped",
        skipReason: "File has no extractable text.",
      };
    }
    return {
      text: text.slice(0, DUE_DILIGENCE_MAX_TEXT_PER_FILE),
      usedAs: "text",
    };
  }

  if (args.kind === "word") {
    const hint = await extractDocumentTextForClassification(file);
    const text = hint.trim();
    if (!text || text === args.fileName) {
      return {
        text: "",
        usedAs: "skipped",
        skipReason:
          "Word documents are not fully parsed yet — convert to PDF or paste text.",
      };
    }
    return {
      text: text.slice(0, DUE_DILIGENCE_MAX_TEXT_PER_FILE),
      usedAs: "text",
    };
  }

  return {
    text: "",
    usedAs: "skipped",
    skipReason: `Unsupported file type (${args.kind}).`,
  };
}

export type VaultFileForDueDiligence = {
  documentId: string;
  title: string;
  fileName?: string;
  contentType?: string;
  url: string;
};

export async function extractVaultFilesForDueDiligence(args: {
  files: VaultFileForDueDiligence[];
  providerKind: OrgAiProviderKind;
}): Promise<{ extracted: DueDiligenceExtractedFile[]; warnings: string[] }> {
  const visionOk = providerSupportsVision(args.providerKind);
  const warnings: string[] = [];
  const extracted: DueDiligenceExtractedFile[] = [];
  let visionUsed = 0;

  for (const file of args.files) {
    const kind = guessAttachmentKind(file.contentType, file.fileName ?? file.title);
    const base: DueDiligenceExtractedFile = {
      documentId: file.documentId,
      title: file.title,
      fileName: file.fileName,
      contentType: file.contentType,
      kind,
      usedAs: "skipped",
    };

    try {
      const res = await fetch(file.url, { cache: "no-store" });
      if (!res.ok) {
        extracted.push({
          ...base,
          skipReason: `Could not download (${res.status}).`,
        });
        warnings.push(`${file.title}: download failed.`);
        continue;
      }
      const blob = await res.blob();

      if (kind === "image") {
        if (!visionOk) {
          extracted.push({
            ...base,
            skipReason:
              "This provider does not support vision. Convert the image to PDF/text or choose OpenAI, Anthropic, or Gemini.",
          });
          warnings.push(
            `${file.title}: image skipped — provider does not support vision.`,
          );
          continue;
        }
        if (visionUsed >= DUE_DILIGENCE_MAX_IMAGES) {
          extracted.push({
            ...base,
            skipReason: `At most ${DUE_DILIGENCE_MAX_IMAGES} images can be sent as vision.`,
          });
          warnings.push(`${file.title}: extra image skipped.`);
          continue;
        }
        if (blob.size > DUE_DILIGENCE_MAX_IMAGE_BYTES) {
          extracted.push({
            ...base,
            skipReason: "Image is larger than 4 MB.",
          });
          warnings.push(`${file.title}: image too large.`);
          continue;
        }
        const imageDataUrl = await blobToDataUrl(blob);
        visionUsed += 1;
        extracted.push({
          ...base,
          usedAs: "vision",
          imageDataUrl,
        });
        continue;
      }

      const textual = await extractTextualBlob({
        blob,
        fileName: file.fileName || file.title,
        contentType: file.contentType,
        kind,
      });
      extracted.push({
        ...base,
        usedAs: textual.usedAs,
        text: textual.text || undefined,
        skipReason: textual.skipReason,
      });
      if (textual.skipReason) warnings.push(`${file.title}: ${textual.skipReason}`);
    } catch {
      extracted.push({
        ...base,
        skipReason: "Extraction failed.",
      });
      warnings.push(`${file.title}: extraction failed.`);
    }
  }

  return { extracted, warnings };
}
