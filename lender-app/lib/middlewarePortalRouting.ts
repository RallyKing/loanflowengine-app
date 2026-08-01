import { convexHttpActionsBaseUrl, parseConvexPublicUrl } from "@/lib/convexPublicUrl";

export type PortalLinkRoute = {
  linkType: "client" | "lender";
  companySlug?: string;
};

/** Resolve slug URL token → client portal vs lender delivery (Edge middleware). */
export async function fetchPortalLinkRoute(
  plainToken: string,
): Promise<PortalLinkRoute | null> {
  const parsed = parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
  if (!parsed.ok) return null;
  const siteBase = convexHttpActionsBaseUrl(parsed.href);
  const trimmed = plainToken.trim();
  if (!trimmed) return null;
  try {
    const u = new URL("/public/resolve-portal-link", `${siteBase}/`);
    u.searchParams.set("token", trimmed);
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: string;
      linkType?: "client" | "lender";
      companySlug?: string;
    };
    if (body.status !== "ok" || !body.linkType) return null;
    return {
      linkType: body.linkType,
      companySlug: body.companySlug,
    };
  } catch {
    return null;
  }
}
