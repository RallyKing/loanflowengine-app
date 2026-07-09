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

export function noteLinkDisplayLabel(title: string | undefined, url: string): string {
  const t = title?.trim();
  return t && t.length > 0 ? t : url;
}
