/** Normalize bundle/delivery tokens from URL params (decode, trim path noise). */
export function normalizePortalToken(raw: string): string {
  let token = raw.trim();
  if (!token) return token;
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(token);
      if (decoded === token) break;
      token = decoded.trim();
    } catch {
      break;
    }
  }
  if (token.includes("/")) {
    token = (token.split("/")[0] ?? token).trim();
  }
  if (token.includes("?")) {
    token = (token.split("?")[0] ?? token).trim();
  }
  return token;
}

export function extractClientPortalTokenFromPreview(result: {
  token?: string;
  previewUrl?: string;
  companySlug?: string;
}): string | null {
  if (result.token?.trim()) {
    return normalizePortalToken(result.token);
  }
  if (!result.previewUrl?.trim()) return null;
  try {
    const url = new URL(result.previewUrl, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    const legacyIdx = parts.indexOf("client-portal");
    if (legacyIdx >= 0 && parts[legacyIdx + 1]) {
      return normalizePortalToken(parts[legacyIdx + 1]!);
    }
    if (parts.length === 2) {
      return normalizePortalToken(parts[1]!);
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function extractCompanySlugFromPreview(result: {
  companySlug?: string;
  previewUrl?: string;
}): string | undefined {
  if (result.companySlug?.trim()) return result.companySlug.trim();
  if (!result.previewUrl?.trim()) return undefined;
  try {
    const url = new URL(result.previewUrl, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 2 && parts[0] !== "client-portal") {
      return parts[0];
    }
  } catch {
    return undefined;
  }
  return undefined;
}
