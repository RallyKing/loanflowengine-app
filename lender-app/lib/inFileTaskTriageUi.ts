import type { Doc, Id } from "@/convex/_generated/dataModel";

import type { TaskColorPreset } from "@/lib/taskColorPresets";
import { resolveTriageLabelHex } from "@/lib/triageLabelColor";

import {

  isTaskHighlightActive,

  resolveTaskHighlightColorId,

} from "@/lib/taskHighlightEngine";



/** Payload for in-file task creation — title only required for regular tasks. */

export type FileTaskCreatePayload = {

  title: string;

  triageLabelId?: Id<"organizationTriageLabels">;

  scheduledTriggerTime?: number;

};



export type OrganizationTriageLabelView = Pick<

  Doc<"organizationTriageLabels">,

  "_id" | "label" | "colorId" | "customHexCode"

>;



/** ~10% opacity tint for in-file task row backgrounds. */

export function triageColorTint(hexCode: string, alphaHex = "1A"): string {

  const hex = hexCode.trim();

  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return "transparent";

  return `${hex}${alphaHex}`;

}



export function formatScheduledTriggerLabel(ms: number): string {

  return new Date(ms).toLocaleString(undefined, {

    weekday: "short",

    month: "short",

    day: "numeric",

    hour: "numeric",

    minute: "2-digit",

  });

}



export function lookupTaskPreset(

  presets: TaskColorPreset[],

  colorId: string | undefined,

): TaskColorPreset | undefined {

  if (!colorId?.trim()) return undefined;

  return presets.find((preset) => preset.id === colorId.trim());

}



export function buildTriageLabelsMap(

  labels: OrganizationTriageLabelView[],

): Map<string, OrganizationTriageLabelView> {

  return new Map(labels.map((label) => [String(label._id), label]));

}



export function taskHasTriageIntent(

  task: Pick<Doc<"tasks">, "triageLabelId" | "scheduledTriggerTime">,

): boolean {

  return Boolean(task.triageLabelId) || task.scheduledTriggerTime != null;

}



export function isScheduledTriagePending(

  task: Pick<Doc<"tasks">, "triageLabelId" | "scheduledTriggerTime" | "status">,

  now: number,

): boolean {

  if (task.status === "done" || task.status === "archived") return false;

  return (

    task.scheduledTriggerTime != null && task.scheduledTriggerTime > now

  );

}



export function inFileTaskTriageVisualState(

  task: Doc<"tasks">,

  presets: TaskColorPreset[],

  labelsById: Map<string, OrganizationTriageLabelView>,

  now: number,

) {

  const colorId = resolveTaskHighlightColorId(task, labelsById);

  const preset = lookupTaskPreset(presets, colorId);

  const labelRow = task.triageLabelId

    ? labelsById.get(String(task.triageLabelId))

    : undefined;

  const labelName = labelRow?.label;

  const labelHex = labelRow

    ? resolveTriageLabelHex(labelRow, presets)

    : preset?.hexCode;

  const isDone = task.status === "done" || task.status === "archived";

  const hasColor = Boolean(labelHex ?? preset);

  const active = !isDone && hasColor && isTaskHighlightActive(task, now);

  const pending =

    !isDone &&

    hasColor &&

    isScheduledTriagePending(task, now) &&

    taskHasTriageIntent(task);



  return { preset, labelHex, labelName, isDone, active, pending };

}

