/** Minute bucket size for passive triage clock synchronization (Phase 21.5). */
export const TRIAGE_CLOCK_TICK_MS = 60_000;

/** Round a Unix-ms timestamp to the nearest minute boundary. */
export function roundTriageTimeToNearestMinute(ms: number): number {
  return Math.round(ms / TRIAGE_CLOCK_TICK_MS) * TRIAGE_CLOCK_TICK_MS;
}

/** Max client/server clock skew accepted for triage evaluation (2 minutes). */
export const TRIAGE_CLOCK_MAX_SKEW_MS = 2 * TRIAGE_CLOCK_TICK_MS;

/**
 * Resolve the evaluation instant for highlight activation.
 * Prefers the client-supplied minute bucket; falls back to server time on skew/invalid input.
 */
export function resolveTriageEvaluationTime(
  currentTriageTime: number | undefined,
  serverNow: number = Date.now(),
): number {
  if (
    currentTriageTime == null ||
    !Number.isFinite(currentTriageTime) ||
    currentTriageTime <= 0
  ) {
    return serverNow;
  }
  const rounded = roundTriageTimeToNearestMinute(currentTriageTime);
  if (Math.abs(rounded - serverNow) > TRIAGE_CLOCK_MAX_SKEW_MS) {
    return serverNow;
  }
  return rounded;
}
