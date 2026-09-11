export const OFFLINE_CONFLICT_ERROR = "CONFLICT_DATA_CHANGED";

/**
 * Detect OCC / expectedUpdatedAt conflicts from Convex mutations.
 *
 * Production often redacts Uncaught Error text to a bare "Server Error" in
 * `Error.message`, so also inspect `ConvexError.data` (and stringified data).
 */
export function isOfflineConflictError(e: unknown): boolean {
  if (e && typeof e === "object") {
    const data = (e as { data?: unknown }).data;
    if (typeof data === "string" && data.includes(OFFLINE_CONFLICT_ERROR)) {
      return true;
    }
    if (data && typeof data === "object") {
      const code = (data as { code?: unknown }).code;
      if (code === OFFLINE_CONFLICT_ERROR) return true;
      try {
        if (JSON.stringify(data).includes(OFFLINE_CONFLICT_ERROR)) return true;
      } catch {
        /* ignore */
      }
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes(OFFLINE_CONFLICT_ERROR);
}
