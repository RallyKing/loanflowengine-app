/**
 * Structured org-permission diagnostics for Convex dashboard logs.
 *
 * - **Failure logs** (`orgPermissionFail`): always emitted when a permission
 *   path throws — search logs for `ORG_PERM_FAIL`.
 * - **Trace logs** (`orgPermissionTrace`): only when Convex env
 *   `ORG_PERM_TELEMETRY=1` (Project → Settings → Environment Variables).
 */

function safeUserKeyHint(key: string | undefined): {
  length: number;
  prefix: string | null;
} {
  const k = key?.trim() ?? "";
  if (!k) return { length: 0, prefix: null };
  return { length: k.length, prefix: k.slice(0, 14) };
}

export function orgPermissionTrace(
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.ORG_PERM_TELEMETRY !== "1") return;
  console.log(
    "ORG_PERM_TRACE",
    JSON.stringify({ stage, ts: Date.now(), ...payload }),
  );
}

export function orgPermissionFail(
  stage: string,
  payload: Record<string, unknown>,
  err: unknown,
): void {
  const e =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: "non-Error", message: String(err) };
  console.error(
    "ORG_PERM_FAIL",
    JSON.stringify({
      stage,
      ts: Date.now(),
      ...payload,
      error: e,
    }),
  );
}

export { safeUserKeyHint };
