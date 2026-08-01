import { NextResponse } from "next/server";
import { convexJwtConfigured, exportConvexJwks } from "@/lib/auth/convexJwt";

export const runtime = "nodejs";

/** Public JWKS for Convex `auth.config.ts` customJwt provider. */
export async function GET() {
  if (!convexJwtConfigured()) {
    return NextResponse.json({ keys: [] }, { status: 503 });
  }
  try {
    const jwks = await exportConvexJwks();
    return NextResponse.json(jwks, {
      headers: {
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[jwks] export failed", err);
    }
    return NextResponse.json({ keys: [] }, { status: 500 });
  }
}
