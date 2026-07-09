import type { Doc } from "@/convex/_generated/dataModel";

/** Open task statuses that can carry triage bubbles (not done/archived). */
export function isTaskStatusOpenForTriage(
  status: Doc<"tasks">["status"],
): boolean {
  return status === "todo" || status === "in_progress";
}

/**
 * Phase 24.2A — labeled open tasks only; scheduled labels activate when
 * `scheduledTriggerTime <= nowBucket` (unscheduled labels are immediate).
 */
export function taskParticipatesInTriageBubble(
  task: Pick<
    Doc<"tasks">,
    "status" | "triageLabelId" | "scheduledTriggerTime" | "snoozedUntil"
  >,
  nowBucket: number,
): boolean {
  if (!isTaskStatusOpenForTriage(task.status)) return false;
  if (task.snoozedUntil != null && task.snoozedUntil > nowBucket) {
    return false;
  }
  if (!task.triageLabelId) return false;
  if (
    task.scheduledTriggerTime != null &&
    task.scheduledTriggerTime > nowBucket
  ) {
    return false;
  }
  return true;
}
