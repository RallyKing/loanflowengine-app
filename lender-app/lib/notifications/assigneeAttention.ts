/**
 * Client-side "needs attention" classification for the notifications bell.
 *
 * `tasks.assigneeAttentionPreview` returns a bounded candidate set without reading
 * the clock (a wall-clock read in a Convex query defeats query caching). The
 * overdue / due-soon / reminder verdict and the snooze gate are applied here, so
 * the badge also advances as time passes instead of only when task data changes.
 */

/** Window in which an upcoming due date counts as "due soon". */
export const ASSIGNEE_ATTENTION_DUE_HORIZON_MS = 1000 * 60 * 60 * 48;

export type AssigneeAttentionReason = "overdue" | "due_soon" | "reminder";

type AttentionTask = {
  updatedAt?: number;
  dueDate?: number | null;
  reminderAt?: number | null;
  snoozedUntil?: number | null;
};

export type AssigneeAttentionCandidate<T extends AttentionTask> = {
  task: T;
  reason: AssigneeAttentionReason;
};

/**
 * Resolve the display reason, or `null` when the task does not currently need
 * attention. Precedence matches the previous server behavior:
 * overdue → reminder reached → due within the horizon.
 */
export function deriveAssigneeAttentionReason(
  task: AttentionTask,
  now: number,
  horizonMs: number = ASSIGNEE_ATTENTION_DUE_HORIZON_MS,
): AssigneeAttentionReason | null {
  if (task.snoozedUntil != null && task.snoozedUntil > now) return null;
  if (task.dueDate != null && task.dueDate < now) return "overdue";
  if (task.reminderAt != null && task.reminderAt <= now) return "reminder";
  if (task.dueDate != null && task.dueDate <= now + horizonMs) return "due_soon";
  return null;
}

/**
 * Filter candidates down to the rows that need attention now, restoring the
 * newest-first order the bell renders and capping the list.
 */
export function deriveAssigneeAttentionRows<T extends AttentionTask>(
  candidates: readonly AssigneeAttentionCandidate<T>[] | undefined,
  options: { now: number; maxRows: number; horizonMs?: number },
): AssigneeAttentionCandidate<T>[] {
  if (!candidates?.length) return [];
  const resolved: AssigneeAttentionCandidate<T>[] = [];
  for (const candidate of candidates) {
    const reason = deriveAssigneeAttentionReason(
      candidate.task,
      options.now,
      options.horizonMs,
    );
    if (reason == null) continue;
    resolved.push({ task: candidate.task, reason });
  }
  resolved.sort((a, b) => (b.task.updatedAt ?? 0) - (a.task.updatedAt ?? 0));
  return resolved.slice(0, Math.max(options.maxRows, 0));
}
