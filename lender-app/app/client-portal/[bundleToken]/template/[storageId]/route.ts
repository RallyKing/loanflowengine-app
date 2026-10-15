import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getConvexHttpClient } from "@/lib/convexServerClient";
import { normalizePortalToken } from "@/lib/portalToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function looksLikeStorageId(raw: string): boolean {
  // Convex document ids are typically table-prefix + alphanumeric body.
  return /^[a-zA-Z0-9_-]{16,128}$/.test(raw);
}

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

  if (!bundleToken || !storageId || !looksLikeStorageId(storageId)) {
    return new NextResponse("Invalid template link.", { status: 400 });
  }

  try {
    const client = getConvexHttpClient();
    const result = await client.query(
      api.documentVaultClientBundlePortal.resolveClientTemplateDownload,
      {
        bundleToken,
        storageId,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[client-template-download]", message);
    return new NextResponse("Could not resolve template download.", {
      status: 502,
    });
  }
}
