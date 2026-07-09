import type { Id } from "@/convex/_generated/dataModel";
import type { LibraryDocumentsProof } from "@/components/LibraryDocumentsPanel";
import { guessAttachmentKind } from "@/lib/uploadToConvexStorage";
import { postFileToConvexUploadUrl } from "@/lib/uploadToConvexStorage";
import { configurePdfjsWorker } from "@/lib/library/pdfjsWorker";
import type { NormalizedPageInput } from "@/lib/library/pageAssetTypes";

const PDF_RENDER_SCALE = 2;

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to export page image."))),
      "image/png",
    );
  });
}

async function uploadPngPage(options: {
  canvas: HTMLCanvasElement;
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
}): Promise<{ storageId: Id<"_storage">; width: number; height: number }> {
  const blob = await canvasToBlob(options.canvas);
  const file = new File([blob], "page.png", { type: "image/png" });
  const uploadUrl = await options.generateUploadUrl({
    proof: options.proof,
    memberUserKey: options.memberUserKey,
  });
  const { storageId } = await postFileToConvexUploadUrl(uploadUrl, file);
  return {
    storageId: storageId as Id<"_storage">,
    width: options.canvas.width,
    height: options.canvas.height,
  };
}

async function normalizePdfToPages(options: {
  url: string;
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
}): Promise<NormalizedPageInput[]> {
  const pdfjs = await import("pdfjs-dist");
  await configurePdfjsWorker();

  const pdf = await pdfjs.getDocument(options.url).promise;
  const pages: NormalizedPageInput[] = [];

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const uploaded = await uploadPngPage({
      canvas,
      ...options,
    });
    pages.push({
      storageId: uploaded.storageId,
      order: i,
      sourceWidth: uploaded.width,
      sourceHeight: uploaded.height,
      rotation: 0,
    });
  }

  return pages;
}

async function normalizeImageToPage(options: {
  url: string;
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
}): Promise<NormalizedPageInput[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Failed to load image."));
    el.src = options.url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(img, 0, 0);

  const uploaded = await uploadPngPage({
    canvas,
    ...options,
  });

  return [
    {
      storageId: uploaded.storageId,
      order: 0,
      sourceWidth: uploaded.width,
      sourceHeight: uploaded.height,
      rotation: 0,
    },
  ];
}

/** Rasterize PDF/image source into normalized PNG page assets (client-side). */
export async function normalizeDocumentToPageAssets(options: {
  url: string;
  contentType?: string;
  fileName: string;
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
}): Promise<NormalizedPageInput[]> {
  const kind = guessAttachmentKind(options.contentType, options.fileName);
  if (kind === "pdf") {
    return normalizePdfToPages(options);
  }
  if (kind === "image") {
    return normalizeImageToPage(options);
  }
  throw new Error("Only PDF and image files can be normalized for editing.");
}

/** Normalize dropped image files (convert-to-PDF flow). */
export async function normalizeImageFilesToPageAssets(options: {
  files: File[];
  generateUploadUrl: (args: {
    proof: LibraryDocumentsProof;
    memberUserKey: string;
  }) => Promise<string>;
  proof: LibraryDocumentsProof;
  memberUserKey: string;
  startOrder?: number;
}): Promise<NormalizedPageInput[]> {
  const pages: NormalizedPageInput[] = [];
  let order = options.startOrder ?? 0;

  for (const file of options.files) {
    const kind = guessAttachmentKind(file.type, file.name);
    if (kind !== "image") {
      throw new Error(`"${file.name}" is not an image.`);
    }
    const url = URL.createObjectURL(file);
    try {
      const batch = await normalizeImageToPage({
        url,
        generateUploadUrl: options.generateUploadUrl,
        proof: options.proof,
        memberUserKey: options.memberUserKey,
      });
      for (const p of batch) {
        pages.push({ ...p, order: order++ });
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return pages;
}
