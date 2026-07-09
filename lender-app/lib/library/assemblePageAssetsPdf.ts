import type { PageAssetCrop } from "@/lib/library/pageAssetTypes";
import { storedCropToPixel } from "@/lib/library/pageAssetTypes";

const RADIANS = Math.PI / 180;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = url;
  });
}

/** Matches react-easy-crop's recommended crop + rotation export. */
export async function renderCroppedRotatedPage(options: {
  imageUrl: string;
  crop?: PageAssetCrop;
  rotation: number;
  sourceWidth: number;
  sourceHeight: number;
}): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const { imageUrl, crop, rotation } = options;
  const image = await createImage(imageUrl);
  const rot = ((rotation % 360) + 360) % 360;

  const pixelCrop = crop
    ? storedCropToPixel(crop)
    : {
        x: 0,
        y: 0,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  canvas.width = safeArea;
  canvas.height = safeArea;

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate(rot * RADIANS);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = Math.max(1, Math.round(pixelCrop.width));
  croppedCanvas.height = Math.max(1, Math.round(pixelCrop.height));
  const croppedCtx = croppedCanvas.getContext("2d");
  if (!croppedCtx) throw new Error("Canvas unavailable.");

  croppedCtx.drawImage(
    canvas,
    Math.round(safeArea / 2 - image.width / 2 + pixelCrop.x),
    Math.round(safeArea / 2 - image.height / 2 + pixelCrop.y),
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return {
    canvas: croppedCanvas,
    width: croppedCanvas.width,
    height: croppedCanvas.height,
  };
}

export async function canvasToPngBytes(
  canvas: HTMLCanvasElement,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
      "image/png",
    );
  });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/** Embed raster pages into a single PDF at print-friendly DPI. */
export async function assemblePageAssetsPdf(
  pages: Array<{
    url: string;
    sourceWidth: number;
    sourceHeight: number;
    cropData?: PageAssetCrop;
    rotation: number;
  }>,
  dpi = 150,
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("No pages to assemble.");
  }

  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();

  for (const page of pages) {
    const { canvas, width, height } = await renderCroppedRotatedPage({
      imageUrl: page.url,
      crop: page.cropData,
      rotation: page.rotation,
      sourceWidth: page.sourceWidth,
      sourceHeight: page.sourceHeight,
    });
    const pngBytes = await canvasToPngBytes(canvas);
    const embedded = await doc.embedPng(pngBytes);
    const pageWidthPt = (width / dpi) * 72;
    const pageHeightPt = (height / dpi) * 72;
    const pdfPage = doc.addPage([pageWidthPt, pageHeightPt]);
    pdfPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    });
  }

  return doc.save();
}
