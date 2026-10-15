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

/**
 * Durable client-template download URL scoped to a portal bundle token.
 * Resolves via `/client-portal/{token}/template/{storageId}` (slug form rewritten in middleware).
 * Only storage ids attached as `clientTemplateAttachments` on in-scope tasks are served.
 */
export function buildClientTemplateDownloadUrl(
  companySlug: string,
  plainToken: string,
  storageId: string,
): string {
  const portal = buildClientPortalUrl(companySlug, plainToken);
  const id = encodeURIComponent(storageId.trim());
  return `${portal}/template/${id}`;
}

export function buildLegacyClientTemplateDownloadUrl(
  plainToken: string,
  storageId: string,
): string {
  const portal = buildLegacyClientPortalUrl(plainToken);
  const id = encodeURIComponent(storageId.trim());
  return `${portal}/template/${id}`;
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

/** `/{companySlug}/{token}/template/{storageId}` — email-ready client template download. */
export function parseCompanySlugPortalTemplatePath(pathname: string): {
  companySlug: string;
  token: string;
  storageId: string;
} | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 4) return null;
  const [companySlug, token, templateSeg, storageIdRaw] = parts;
  if (!companySlug || !token || !storageIdRaw) return null;
  if (templateSeg !== "template") return null;
  if (PORTAL_COMPANY_SLUG_RESERVED.has(companySlug.toLowerCase())) return null;
  if (!/^[a-zA-Z0-9._-]{8,128}$/.test(token)) return null;
  let storageId = storageIdRaw;
  try {
    storageId = decodeURIComponent(storageIdRaw);
  } catch {
    /* keep raw */
  }
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(storageId)) return null;
  return { companySlug, token, storageId };
}
