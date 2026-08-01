/**
 * Canonical client portal URL builder.
 * Production: https://paperworkprocessing.com/{companySlug}/{token}
 */
export function clientPortalPublicOrigin(): string {
  const fromEnv =
    process.env.CLIENT_PORTAL_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_CLIENT_PORTAL_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (fromEnv) {
    const withScheme = fromEnv.startsWith("http")
      ? fromEnv
      : `https://${fromEnv}`;
    return withScheme.replace(/\/$/, "");
  }
  return "https://paperworkprocessing.com";
}

export function slugifyCompanySlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "portal";
}

export function buildClientPortalUrl(
  companySlug: string,
  plainToken: string,
): string {
  const origin = clientPortalPublicOrigin();
  const slug = slugifyCompanySlug(companySlug);
  const token = encodeURIComponent(plainToken.trim());
  return `${origin}/${slug}/${token}`;
}

export function buildLegacyClientPortalUrl(plainToken: string): string {
  const origin = clientPortalPublicOrigin();
  return `${origin}/client-portal/${encodeURIComponent(plainToken.trim())}`;
}

/** Reserved first path segments — not company slugs. */
export const PORTAL_COMPANY_SLUG_RESERVED = new Set([
  "pipeline",
  "contacts",
  "login",
  "sign-in",
  "sign-up",
  "signup",
  "portal",
  "client-portal",
  "upload",
  "lender-delivery",
  "share",
  "apply",
  "api",
  "settings",
  "tasks",
  "documents",
  "lenders",
  "ledger",
  "registry",
  "activity",
  "analytics",
  "operations",
  "events",
  "forgot-password",
  "reset-password",
  "session-expired",
  "system",
  "print",
  "convex-debug",
  "_next",
  ".well-known",
]);

export function parseCompanySlugPortalPath(pathname: string): {
  companySlug: string;
  token: string;
} | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [companySlug, token] = parts;
  if (!companySlug || !token) return null;
  if (PORTAL_COMPANY_SLUG_RESERVED.has(companySlug.toLowerCase())) return null;
  if (!/^[a-zA-Z0-9._-]{8,128}$/.test(token)) return null;
  return { companySlug, token };
}
