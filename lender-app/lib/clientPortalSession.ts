const STORAGE_KEY = "dlc_client_portal_session";
const ORG_SCOPE_KEY = "dlc_client_portal_org_scope";

export function getClientPortalSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setClientPortalSessionToken(token: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* private mode */
  }
}

export function clearClientPortalSessionToken(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(ORG_SCOPE_KEY);
  } catch {
    /* private mode */
  }
}

export function setRememberedOrgScope(orgScope: string): void {
  try {
    window.localStorage.setItem(ORG_SCOPE_KEY, orgScope);
  } catch {
    /* private mode */
  }
}

export function getRememberedOrgScope(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ORG_SCOPE_KEY);
  } catch {
    return null;
  }
}
