/**
 * Stable per-browser account key until Convex Auth (or similar) supplies a
 * canonical user id. Stored in `localStorage` so preferences can sync per device.
 */
export const USER_ACCOUNT_ID_STORAGE_KEY = "dlc.user-account-id.v1";

/**
 * Returns the persisted id, or creates one with `crypto.randomUUID()` and stores it.
 * On SSR or when storage is unavailable, returns an empty string (callers should
 * skip remote preference sync).
 */
export function getOrCreateAccountId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(USER_ACCOUNT_ID_STORAGE_KEY);
    if (!id || id.trim() === "") {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `acct_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(USER_ACCOUNT_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
