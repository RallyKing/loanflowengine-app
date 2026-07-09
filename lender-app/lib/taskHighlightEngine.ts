import type { Doc } from "@/convex/_generated/dataModel";

import { DEFAULT_SCHEDULED_TRIAGE_COLOR_ID } from "@/lib/triageLabels";



function isOpenTaskStatus(status: Doc<"tasks">["status"]): boolean {

  return status === "todo" || status === "in_progress";

}



/** True when task has a triage label (immediate) or a scheduled follow-up time. */

export function taskHasTriageFields(

  task: Pick<Doc<"tasks">, "triageLabelId" | "scheduledTriggerTime">,

): boolean {

  return Boolean(task.triageLabelId) || task.scheduledTriggerTime != null;

}



/**

 * A task highlight is active when open and either:

 * - it has an admin triage label (immediate), or

 * - its scheduled trigger time has fired.

 */

export function isTaskHighlightActive(

  task: Pick<

    Doc<"tasks">,

    | "status"

    | "triageLabelId"

    | "scheduledTriggerTime"

    | "highlightColorId"

    | "isUrgent"

    | "snoozedUntil"

  >,

  now: number,

): boolean {

  if (!isOpenTaskStatus(task.status)) return false;

  if (task.snoozedUntil != null && task.snoozedUntil > now) return false;

  if (task.triageLabelId) return true;

  if (

    task.scheduledTriggerTime != null &&

    task.scheduledTriggerTime <= now

  ) {

    return true;

  }

  return false;

}



/** Whether the highlight should appear on hub cards (ignores schedule-only pending). */

export function isTaskHighlightVisibleOnHub(

  task: Pick<

    Doc<"tasks">,

    | "status"

    | "triageLabelId"

    | "scheduledTriggerTime"

    | "highlightColorId"

    | "isUrgent"

    | "snoozedUntil"

  >,

  now: number,

): boolean {

  if (!isTaskHighlightActive(task, now)) return false;

  if (task.triageLabelId) return true;

  return (

    task.scheduledTriggerTime != null && task.scheduledTriggerTime <= now

  );

}



/** Resolve preset id for rendering — label color wins, then stored highlight, then schedule default. */

export function resolveTaskHighlightColorId(

  task: Pick<

    Doc<"tasks">,

    "triageLabelId" | "highlightColorId" | "scheduledTriggerTime"

  >,

  labelsById: ReadonlyMap<string, Pick<Doc<"organizationTriageLabels">, "colorId">>,

): string | undefined {

  if (task.triageLabelId) {

    const label = labelsById.get(String(task.triageLabelId));

    if (label?.colorId.trim()) return label.colorId.trim();

  }

  const stored = task.highlightColorId?.trim();

  if (stored) return stored;

  if (task.scheduledTriggerTime != null) {

    return DEFAULT_SCHEDULED_TRIAGE_COLOR_ID;

  }

  return undefined;

}

