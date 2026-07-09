import { convexHttpActionsBaseUrl, parseConvexPublicUrl } from "@/lib/convexPublicUrl";

/**
 * Resolves a verified custom hostname → Convex organization id via the Convex HTTP router.
 * Used from Next.js middleware (Edge-compatible fetch).
 */
export async function fetchConvexOrgIdForHostname(
  hostname: string,
): Promise<string | null> {
  const parsed = parseConvexPublicUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
  if (!parsed.ok) return null;
  const siteBase = convexHttpActionsBaseUrl(parsed.href);
  if (!hostname.trim()) return null;
  try {
    const u = new URL("/public/resolve-host", `${siteBase}/`);
    u.searchParams.set("hostname", hostname.trim().toLowerCase());
    const res = await fetch(u.toString(), {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      organizationId?: string | null;
    };
    const id = body.organizationId?.trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * Primary app hostname (custom domains are "anything else" that maps in Convex).
 * Set in production so middleware can distinguish app.example.com from tenant hosts.
 */
export function configuredCanonicalHostname(): string {
  const raw = process.env.NEXT_PUBLIC_APP_CANONICAL_HOST?.trim();
  if (raw) {
    try {
      const withProto = raw.includes("://") ? raw : `https://${raw}`;
      return new URL(withProto).hostname.toLowerCase();
    } catch {
      return raw.split(":")[0]!.toLowerCase();
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return vercel.split(":")[0]!.toLowerCase();
  return "";
}
