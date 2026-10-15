import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { normalizePortalToken } from "@/lib/portalToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public redirect: bundle-token + storageId → short-lived Convex storage URL.
 * Only clientTemplateAttachments on in-scope tasks are authorized server-side.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ bundleToken: string; storageId: string }> },
) {
  const { bundleToken: rawToken, storageId: rawStorageId } = await context.params;
  const bundleToken = normalizePortalToken(rawToken ?? "");
  let storageId = (rawStorageId ?? "").trim();
  try {
    storageId = decodeURIComponent(storageId);
  } catch {
    /* keep raw */
  }
  const companySlug =
    req.nextUrl.searchParams.get("companySlug")?.trim() || undefined;

  if (!bundleToken || !storageId) {
    return new NextResponse("Invalid template link.", { status: 400 });
  }

  try {
    const client = getConvexHttpClient();
    const result = await client.query(
      api.documentVaultClientBundlePortal.resolveClientTemplateDownload,
      {
        bundleToken,
        storageId: storageId as Id<"_storage">,
        companySlug,
        now: Date.now(),
      },
    );
    if (result.status !== "ok" || !("url" in result) || !result.url) {
      return new NextResponse("Template not available for this link.", {
        status: 404,
      });
    }
    return NextResponse.redirect(result.url, 302);
  } catch {
    return new NextResponse("Could not resolve template download.", {
      status: 502,
    });
  }
}
