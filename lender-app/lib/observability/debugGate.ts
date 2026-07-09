import { HEADER_DEBUG_SECRET } from "./constants";

/**
 * Safe production debug: off unless `DLC_SAFE_DEBUG=1`, non-production, or
 * `x-dlc-debug-secret` matches `DLC_OBSERVABILITY_DEBUG_SECRET`.
 */
export function isSafeDebugModeEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.DLC_SAFE_DEBUG === "1";
}

export function verifyDebugSecret(headerValue: string | null): boolean {
  const expected = process.env.DLC_OBSERVABILITY_DEBUG_SECRET?.trim();
  if (!expected) return false;
  return Boolean(headerValue && headerValue === expected);
}

export function canAccessObservabilityDebug(req: Request): boolean {
  if (isSafeDebugModeEnabled()) return true;
  return verifyDebugSecret(req.headers.get(HEADER_DEBUG_SECRET));
}
