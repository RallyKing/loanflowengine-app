/**
 * Pure validity checks for alert fire handlers (unit-tested).
 */

export function parseSnoozedUntilMs(
  snoozedUntil: string | number | null | undefined,
): number | null {
  if (snoozedUntil == null) return null;
  if (typeof snoozedUntil === "number") {
    return Number.isFinite(snoozedUntil) ? snoozedUntil : null;
  }
  const ms = Date.parse(snoozedUntil);
  return Number.isFinite(ms) ? ms : null;
}

/** File snooze alert still valid at fire time. */
export function isFileSnoozeAlertStillValid(args: {
  snoozedUntil: string | number | null | undefined;
  expectedFireAt: number;
  /** Allow tiny clock skew between schedule write and fire. */
  skewMs?: number;
}): boolean {
  const stored = parseSnoozedUntilMs(args.snoozedUntil);
  if (stored == null) return false;
  // ISO ↔ ms round-trips are exact; allow a few seconds for scheduler lag /
  // legacy number↔string rewrites without treating a rescheduled snooze as valid.
  const skew = args.skewMs ?? 5_000;
  return Math.abs(stored - args.expectedFireAt) <= skew;
}

export function isHubTaskDueAlertStillValid(args: {
  dueDate: number | null | undefined;
  expectedFireAt: number;
  status: string;
  skewMs?: number;
}): boolean {
  if (args.dueDate == null || !Number.isFinite(args.dueDate)) return false;
  if (args.status === "done" || args.status === "archived") return false;
  const skew = args.skewMs ?? 1000;
  return Math.abs(args.dueDate - args.expectedFireAt) <= skew;
}

export function isVaultFileTaskDueAlertStillValid(args: {
  dueDate: number | null | undefined;
  expectedFireAt: number;
  status: string;
  isArchived?: boolean;
  skewMs?: number;
}): boolean {
  if (args.isArchived) return false;
  if (args.dueDate == null || !Number.isFinite(args.dueDate)) return false;
  if (args.status === "complete") return false;
  const skew = args.skewMs ?? 1000;
  return Math.abs(args.dueDate - args.expectedFireAt) <= skew;
}

/** Past-due backfill: fire once at due/snooze time even if already past. */
export function shouldScheduleOneShot(args: {
  fireAt: number;
  now: number;
}): { kind: "future" | "immediate_past"; delayMs: number } | null {
  if (!Number.isFinite(args.fireAt)) return null;
  if (args.fireAt > args.now) {
    return { kind: "future", delayMs: args.fireAt - args.now };
  }
  return { kind: "immediate_past", delayMs: 0 };
}
