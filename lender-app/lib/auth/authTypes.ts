/**
 * High-level auth + connectivity states for the workspace shell.
 * One state is primary; connectivity nuances map to reconnecting / degraded.
 */
export type AuthMachineState =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "expired"
  | "revoked"
  | "reconnecting"
  | "degraded";

export type SessionInvalidReason = "expired" | "revoked";

/** Convex retries before we surface `degraded` while nominally online. */
export const AUTH_DEGRADED_RETRY_THRESHOLD = 12;
