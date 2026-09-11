/** Phase 24.5 — normalize and validate pipeline note link URLs (http/https only). */

export function normalizeAndValidateNoteLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("URL is required");
  }
  if (/^\s*javascript:/i.test(trimmed)) {
    throw new Error("Invalid URL");
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!/^[\w.-]+(\.[\w.-]+)+/i.test(candidate) && !/^localhost\b/i.test(candidate)) {
      throw new Error("Invalid URL");
    }
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  return parsed.href;
}

/** Prefer an explicit title; otherwise a compact host/path (not a raw mega-URL). */
export function noteLinkDisplayLabel(title: string | undefined, url: string): string {
  const t = title?.trim();
  if (t && t.length > 0) return t;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const label = `${parsed.host}${path}${parsed.search}`;
    if (label.length <= 48) return label;
    return `${label.slice(0, 45)}…`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}
