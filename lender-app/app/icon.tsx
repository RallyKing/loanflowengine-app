import { ImageResponse } from "next/og";
import { APP_MONOGRAM } from "@/lib/brandIdentity";
import { PwaIconMark } from "@/lib/pwaIconImage";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<PwaIconMark size={32} monogram={APP_MONOGRAM} />, {
    ...size,
  });
}
