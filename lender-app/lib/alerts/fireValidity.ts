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
  const skew = args.skewMs ?? 1000;
  return Math.abs(stored - args.expectedFireAt) <= skew;
}

function collectPositiveTimes(
  ...raws: Array<number | null | undefined>
): number[] {
  const times: number[] = [];
  for (const raw of raws) {
    if (raw == null || !Number.isFinite(raw) || raw <= 0) continue;
    times.push(Math.trunc(raw));
  }
  return times;
}

/**
 * Classic hub due / reminder fire time (earliest of dueDate | reminderAt).
 * Triage `scheduledTriggerTime` uses a separate one-shot path.
 */
export function resolveHubTaskDueAlertFireAt(fields: {
  dueDate?: number | null;
  reminderAt?: number | null;
}): number | null {
  const times = collectPositiveTimes(fields.dueDate, fields.reminderAt);
  if (times.length === 0) return null;
  return Math.min(...times);
}

/** In-file triage schedule fire time (`scheduledTriggerTime` only). */
export function resolveHubTaskScheduleAlertFireAt(fields: {
  scheduledTriggerTime?: number | null;
}): number | null {
  const times = collectPositiveTimes(fields.scheduledTriggerTime);
  if (times.length === 0) return null;
  return times[0]!;
}

export function isHubTaskDueAlertStillValid(args: {
  dueDate?: number | null;
  reminderAt?: number | null;
  expectedFireAt: number;
  status: string;
  skewMs?: number;
}): boolean {
  if (args.status === "done" || args.status === "archived") return false;
  const fireAt = resolveHubTaskDueAlertFireAt(args);
  if (fireAt == null) return false;
  const skew = args.skewMs ?? 1000;
  return Math.abs(fireAt - args.expectedFireAt) <= skew;
}

export function isHubTaskScheduleAlertStillValid(args: {
  scheduledTriggerTime?: number | null;
  expectedFireAt: number;
  status: string;
  skewMs?: number;
}): boolean {
  if (args.status === "done" || args.status === "archived") return false;
  const fireAt = resolveHubTaskScheduleAlertFireAt(args);
  if (fireAt == null) return false;
  const skew = args.skewMs ?? 1000;
  return Math.abs(fireAt - args.expectedFireAt) <= skew;
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
