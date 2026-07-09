/**
 * Structured one-line diagnostics for auth / org / migration debugging.
 * Enable with `AUTH_DIAG=1` or `MIGRATION_DIAG=1` in the environment (server-side).
 */
export type DiagChannel =
  | "AUTH_TRACE"
  | "ORG_TRACE"
  | "MIGRATION_TRACE"
  | "PERMISSION_TRACE"
  | "SURFACE_ERROR_TRACE";

function diagEnabled(): boolean {
  return (
    process.env.AUTH_DIAG === "1" ||
    process.env.MIGRATION_DIAG === "1" ||
    process.env.RUNTIME_DIAG === "1"
  );
}

/** Emits a single JSON line when diagnostics are enabled. Never throws. */
export function diagTrace(
  channel: DiagChannel,
  payload: Record<string, unknown>,
): void {
  if (!diagEnabled()) return;
  try {
    console.log(
      JSON.stringify({
        channel,
        t: Date.now(),
        ...payload,
      }),
    );
  } catch {
    /* ignore */
  }
}
