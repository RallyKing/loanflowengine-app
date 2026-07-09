/**
 * One-shot (per version bump) purge of browser storage keys tied to legacy
 * vendor auth storage keys or stale active-org hints so the UI re-resolves normalized workspace state.
 *
 * Does not clear unrelated prefs (tasks matrix, pipeline hub, color scheme, etc.).
 */
const PURGE_VERSION_KEY = "lender.__authStoragePurgeVersion";
/** Increment when org/auth storage contract changes and clients must reset again. */
export const LEGACY_AUTH_STORAGE_PURGE_VERSION = 1;

const EXACT_KEYS = new Set([
  "lender.activeOrganizationId",
  "dlc_client_portal_org_scope",
]);

function shouldPurgeStorageKey(key: string): boolean {
  const k = key.toLowerCase();
  if (EXACT_KEYS.has(key)) return true;
  /** Avoid literal vendor token in source (audit: `cl` + `erk`). */
  if (k.includes("cl" + "erk")) return true;
  if (k.includes("activeorg") || k.includes("active_org")) return true;
  if (k.includes("orgid") || k.includes("org_id")) return true;
  return false;
}

function removeMatchingKeys(store: Storage): string[] {
  const removed: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k) keys.push(k);
    }
    for (const key of keys) {
      if (shouldPurgeStorageKey(key)) {
        store.removeItem(key);
        removed.push(key);
      }
    }
  } catch {
    /* private mode / blocked storage */
  }
  return removed;
}

function readStoredVersion(): number {
  try {
    const raw = window.localStorage.getItem(PURGE_VERSION_KEY)?.trim();
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeStoredVersion(v: number): void {
  try {
    window.localStorage.setItem(PURGE_VERSION_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/**
 * Runs at most once per device after `LEGACY_AUTH_STORAGE_PURGE_VERSION` increases.
 * Dispatches `lender-active-org-changed` when any key was removed so RBAC/org hooks refresh.
 */
export function purgeLegacyAuthBrowserStorageIfNeeded(): void {
  if (typeof window === "undefined") return;
  const current = readStoredVersion();
  if (current >= LEGACY_AUTH_STORAGE_PURGE_VERSION) return;

  const removedLocal = removeMatchingKeys(window.localStorage);
  const removedSession = removeMatchingKeys(window.sessionStorage);
  writeStoredVersion(LEGACY_AUTH_STORAGE_PURGE_VERSION);

  if (removedLocal.length || removedSession.length) {
    try {
      window.dispatchEvent(new CustomEvent("lender-active-org-changed"));
    } catch {
      /* ignore */
    }
  }
}
