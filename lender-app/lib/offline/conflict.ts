export const OFFLINE_CONFLICT_ERROR = "CONFLICT_DATA_CHANGED";

export function isOfflineConflictError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes(OFFLINE_CONFLICT_ERROR);
}
