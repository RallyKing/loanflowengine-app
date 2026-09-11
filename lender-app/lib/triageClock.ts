/** Minute bucket size for passive triage clock synchronization (Phase 21.5). */
export const TRIAGE_CLOCK_TICK_MS = 60_000;

/** Round a Unix-ms timestamp to the nearest minute boundary. */
export function roundTriageTimeToNearestMinute(ms: number): number {
  return Math.round(ms / TRIAGE_CLOCK_TICK_MS) * TRIAGE_CLOCK_TICK_MS;
}

/**
 * Resolve the evaluation instant for highlight activation.
 *
 * The caller's minute bucket is authoritative: Convex queries must stay
 * deterministic or the platform cannot cache them, so there is no server-clock
 * fallback here. A missing or nonsensical bucket resolves to `0`, which reads as
 * "nothing has come due yet" — scheduled labels stay dormant and snoozes stay in
 * effect rather than leaking hidden tasks into a highlight.
 */
export function resolveTriageEvaluationTime(
  currentTriageTime: number | undefined,
): number {
  if (
    currentTriageTime == null ||
    !Number.isFinite(currentTriageTime) ||
    currentTriageTime <= 0
  ) {
    return 0;
  }
  return roundTriageTimeToNearestMinute(currentTriageTime);
}
