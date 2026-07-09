import { ImageResponse } from "next/og";
import { APP_MONOGRAM } from "@/lib/brandIdentity";
import { PwaIconMark } from "@/lib/pwaIconImage";

const ALLOWED = new Set(["192", "512"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size: sizeParam } = await context.params;
  if (!ALLOWED.has(sizeParam)) {
    return new Response("Invalid icon size", { status: 404 });
  }
  const dimension = Number(sizeParam);
  return new ImageResponse(
    <PwaIconMark size={dimension} monogram={APP_MONOGRAM} />,
    { width: dimension, height: dimension },
  );
}
