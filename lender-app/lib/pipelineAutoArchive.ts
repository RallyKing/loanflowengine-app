/**
 * Pipeline file auto-archive-on-inactivity.
 *
 * Inactivity clock = `pipeline.updatedAt` (fallback `createdAt`) — the same
 * last-meaningful-activity stamp already tracked on the file. Snooze is a
 * separate hide-until control and does not share this timer.
 *
 * What counts as activity: any write that bumps `pipeline.updatedAt`
 * (deal/data patches, stage, lenders, notes, contacts, momentum, etc.).
 * Configuring this timer, snoozing, or unsnoozing should not restart the
 * window. Sweep re-validates against `updatedAt` so a missed deadline refresh
 * cannot archive a recently touched file.
 */

export const AUTO_ARCHIVE_PRESET_DAYS = [15, 30, 45, 60] as const;

export type AutoArchivePresetDays = (typeof AUTO_ARCHIVE_PRESET_DAYS)[number];

export const AUTO_ARCHIVE_MIN_DAYS = 1;
export const AUTO_ARCHIVE_MAX_DAYS = 730;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isAutoArchivePresetDays(
  days: number,
): days is AutoArchivePresetDays {
  return (AUTO_ARCHIVE_PRESET_DAYS as readonly number[]).includes(days);
}

/** Clamp / validate a user-chosen inactivity period in whole days. */
export function normalizeAutoArchiveInactivityDays(
  days: number,
): number | null {
  if (!Number.isFinite(days)) return null;
  const whole = Math.round(days);
  if (whole < AUTO_ARCHIVE_MIN_DAYS || whole > AUTO_ARCHIVE_MAX_DAYS) {
    return null;
  }
  return whole;
}

export function lastPipelineActivityAt(row: {
  updatedAt?: number;
  createdAt?: number;
}): number {
  const updated =
    typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt)
      ? row.updatedAt
      : null;
  const created =
    typeof row.createdAt === "number" && Number.isFinite(row.createdAt)
      ? row.createdAt
      : null;
  return updated ?? created ?? 0;
}

/** Deadline = last activity + inactivity days. `now` is unused (caller may pass for API symmetry). */
export function computeAutoArchiveAfterAt(
  lastActivityAt: number,
  inactivityDays: number,
): number | null {
  const days = normalizeAutoArchiveInactivityDays(inactivityDays);
  if (days == null) return null;
  if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) return null;
  return lastActivityAt + days * MS_PER_DAY;
}

export function isAutoArchiveDue(args: {
  now: number;
  lastActivityAt: number;
  inactivityDays: number | undefined | null;
  archivedAt?: number | null;
}): boolean {
  if (args.archivedAt != null) return false;
  const days = args.inactivityDays;
  if (days == null) return false;
  const dueAt = computeAutoArchiveAfterAt(args.lastActivityAt, days);
  if (dueAt == null) return false;
  return dueAt <= args.now;
}

export function remainingAutoArchiveMs(args: {
  now: number;
  autoArchiveAfterAt?: number | null;
  lastActivityAt: number;
  inactivityDays?: number | null;
}): number | null {
  if (args.inactivityDays == null && args.autoArchiveAfterAt == null) {
    return null;
  }
  const fromActivity =
    args.inactivityDays != null
      ? computeAutoArchiveAfterAt(args.lastActivityAt, args.inactivityDays)
      : null;
  const dueAt = fromActivity ?? args.autoArchiveAfterAt ?? null;
  if (dueAt == null || !Number.isFinite(dueAt)) return null;
  return dueAt - args.now;
}

/** Compact hub label: "12d", "6h", "Due". */
export function formatAutoArchiveRemainingShort(
  remainingMs: number | null,
): string {
  if (remainingMs == null) return "";
  if (remainingMs <= 0) return "Due";
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (hours < 24) {
    const h = Math.max(1, hours);
    return `${h}h`;
  }
  const days = Math.ceil(remainingMs / MS_PER_DAY);
  return `${days}d`;
}

export function formatAutoArchiveTooltip(args: {
  now: number;
  inactivityDays?: number | null;
  autoArchiveAfterAt?: number | null;
  lastActivityAt: number;
}): string {
  const days = args.inactivityDays;
  const remaining = remainingAutoArchiveMs(args);
  const dueAt =
    (days != null
      ? computeAutoArchiveAfterAt(args.lastActivityAt, days)
      : null) ?? args.autoArchiveAfterAt ?? null;
  const dueLabel =
    dueAt != null && Number.isFinite(dueAt)
      ? new Date(dueAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
  const period =
    days != null && Number.isFinite(days)
      ? `${days} day${days === 1 ? "" : "s"}`
      : "the chosen period";
  if (remaining != null && remaining <= 0) {
    return `Auto-archive due: no activity for ${period}. Run auto-archive from Pipeline (or archive this file) — it does not run on a timer.`;
  }
  if (dueLabel) {
    return `Auto-archives if no new activity for ${period} (around ${dueLabel}). Separate from snooze.`;
  }
  return `Auto-archives if no new activity for ${period}. Separate from snooze.`;
}

/**
 * Fields to patch when meaningful activity bumps `updatedAt`.
 * Empty object when the timer is off or the file is already archived.
 */
export function autoArchiveFieldsForActivity(
  row: {
    autoArchiveInactivityDays?: number;
    archivedAt?: number;
  },
  activityAt: number,
): { autoArchiveAfterAt: number } | Record<string, never> {
  if (row.archivedAt != null) return {};
  const days = row.autoArchiveInactivityDays;
  if (days == null) return {};
  const next = computeAutoArchiveAfterAt(activityAt, days);
  if (next == null) return {};
  return { autoArchiveAfterAt: next };
}

/** Max files processed per user-triggered sweep click. Never chain automatically. */
export const AUTO_ARCHIVE_SWEEP_BATCH = 64;

/**
 * Scheduled auto-archive is disabled on purpose (Convex cost).
 * Due files wait until the user runs auto-archive from Pipeline.
 */
export const AUTO_ARCHIVE_CRON_ENABLED = false;

/**
 * Never schedule a follow-up sweep mutation.
 * A full batch used to `runAfter(0)` itself and, if stuck rows stayed in the
 * due index, that loop burned millions of Convex function calls.
 */
export function shouldChainAutoArchiveSweep(
  _candidateCount: number,
  _batchSize: number = AUTO_ARCHIVE_SWEEP_BATCH,
): boolean {
  return false;
}

export type AutoArchiveDueIndexPatch =
  | { kind: "reschedule"; autoArchiveAfterAt: number }
  | { kind: "clear" };

/**
 * When a row is in the due index (`autoArchiveAfterAt <= now`) but is not
 * actually due, move it out of the index so a sweep cannot spin on it.
 */
export function dueIndexPatchWhenNotActuallyDue(args: {
  now: number;
  lastActivityAt: number;
  inactivityDays: number;
}): AutoArchiveDueIndexPatch {
  const nextDue = computeAutoArchiveAfterAt(
    args.lastActivityAt,
    args.inactivityDays,
  );
  if (nextDue != null && nextDue > args.now) {
    return { kind: "reschedule", autoArchiveAfterAt: nextDue };
  }
  return { kind: "clear" };
}
