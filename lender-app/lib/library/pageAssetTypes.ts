import type { Id } from "@/convex/_generated/dataModel";

export type PageAssetCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type NormalizedPageInput = {
  storageId: Id<"_storage">;
  order: number;
  sourceWidth: number;
  sourceHeight: number;
  rotation?: number;
  cropData?: PageAssetCrop;
};

export type PageAssetForAssembly = {
  url: string;
  sourceWidth: number;
  sourceHeight: number;
  cropData?: PageAssetCrop;
  rotation: number;
};

/** react-easy-crop pixel crop → persisted cropData. */
export function pixelCropToStored(crop: {
  x: number;
  y: number;
  width: number;
  height: number;
}): PageAssetCrop {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    w: Math.round(crop.width),
    h: Math.round(crop.height),
  };
}

export function storedCropToPixel(crop: PageAssetCrop): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return { x: crop.x, y: crop.y, width: crop.w, height: crop.h };
}

export function defaultFullCrop(
  width: number,
  height: number,
): PageAssetCrop {
  return { x: 0, y: 0, w: width, h: height };
}
