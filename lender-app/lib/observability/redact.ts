import type { ViewerSession } from "@/lib/session/types";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "secret",
  "authorization",
  "cookie",
  "set-cookie",
  "csrf",
  "session",
  "accesstoken",
  "refreshtoken",
]);

/**
 * Recursively redact common secret fields (case-insensitive key match).
 * Arrays are mapped; plain objects are walked; primitives returned as-is.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.has(lower)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = redactDeep(v, depth + 1);
  }
  return out;
}

/** Safe session shape for logs and debug JSON (no PII beyond coarse hints). */
export function redactViewerForObservability(
  session: ViewerSession,
): Record<string, unknown> {
  const hashHint = (s: string) =>
    s.length <= 6 ? "***" : `${s.slice(0, 2)}…${s.slice(-2)}`;
  return {
    userKeyHint: hashHint(session.userKey),
    orgIdHint: session.organizationId
      ? hashHint(session.organizationId)
      : null,
    workspaceRole: session.workspaceRole,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    sessionPublicIdHint: session.sessionPublicId
      ? hashHint(session.sessionPublicId)
      : undefined,
  };
}
