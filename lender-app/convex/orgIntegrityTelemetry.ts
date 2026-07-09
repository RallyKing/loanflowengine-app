/**
 * Structured org / tenant integrity telemetry (Convex dashboard logs).
 *
 * - ORG_INTEGRITY_FAIL: always on hard failures (validation, isolation breach).
 * - ORG_INTEGRITY_TRACE: when ORG_INTEGRITY_TELEMETRY=1 on the deployment.
 */

export function orgIntegrityTrace(
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.ORG_INTEGRITY_TELEMETRY !== "1") return;
  console.log(
    "ORG_INTEGRITY_TRACE",
    JSON.stringify({ stage, ts: Date.now(), ...payload }),
  );
}

export function orgIntegrityFail(
  stage: string,
  payload: Record<string, unknown>,
  err?: unknown,
): void {
  const e =
    err instanceof Error
      ? { name: err.name, message: err.message }
      : err != null
        ? { message: String(err) }
        : undefined;
  console.error(
    "ORG_INTEGRITY_FAIL",
    JSON.stringify({
      stage,
      ts: Date.now(),
      ...payload,
      error: e,
    }),
  );
}
