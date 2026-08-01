const STORAGE_PREFIX = "dlc_portal_access_proof:";

export function portalAccessProofKey(token: string): string {
  return `${STORAGE_PREFIX}${token.trim()}`;
}

export function readPortalAccessProof(token: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(portalAccessProofKey(token));
    return raw?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function writePortalAccessProof(token: string, proofToken: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(portalAccessProofKey(token), proofToken.trim());
  } catch {
    /* ignore quota errors */
  }
}

export function clearPortalAccessProof(token: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(portalAccessProofKey(token));
  } catch {
    /* ignore */
  }
}

export function buildVerifyAccessPath(token: string, returnTo: string): string {
  const params = new URLSearchParams({ returnTo });
  return `/public/verify-access/${encodeURIComponent(token.trim())}?${params.toString()}`;
}
