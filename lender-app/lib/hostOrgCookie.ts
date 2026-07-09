export const LENDER_HOST_ORG_COOKIE = "lender_host_org";

/** Clear tenant host binding (non-HttpOnly). See `orgPermissionsContext` reconciliation. */
export function clearClientLenderHostOrgCookie(): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:";
  document.cookie = `${LENDER_HOST_ORG_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}

/**
 * Host-mapped organization id (set by middleware on custom domains).
 * Readable by JS so client hooks can align Convex scope without an extra round trip.
 */
export function readHostMappedOrganizationIdFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const prefixed = `; ${document.cookie}`;
  const key = `; ${LENDER_HOST_ORG_COOKIE}=`;
  const idx = prefixed.indexOf(key);
  if (idx === -1) return null;
  const start = idx + key.length;
  const end = prefixed.indexOf(";", start);
  const raw = (end === -1 ? prefixed.slice(start) : prefixed.slice(start, end))
    .trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
