/**
 * Internal broker checklist from `dealData.workflow[]`.
 * Step `id` is stable for automations (same spirit as portal status steps).
 */

export type InternalWorkflowItem = {
  id: string;
  label: string;
  done: boolean;
  date?: string;
};

/** Template step definition (no completion state). */
export type InternalWorkflowTemplateStep = {
  id: string;
  label: string;
};

/** Built-in default checklist (matches intakeDocumentDefaults). */
export const DEFAULT_INTERNAL_WORKFLOW_LABELS = [
  "Intro Email",
  "EDU Emails",
  "Scenario Email",
  "Needs List Email",
  "OL & PD",
  "Velocify",
  "Property Profile",
  "Intake Attached",
  "DTI Calculator",
  "Declarations",
  "FNMA 3.2 & PCF",
  "Credit Report",
  "PDF Proposal",
] as const;

export const BUILTIN_INTERNAL_WORKFLOW_TEMPLATE_ID = "builtin:default-broker";

export function newInternalWorkflowStepId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `iwf_${crypto.randomUUID()}`;
  }
  return `iwf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Deterministic legacy id so existing files get stable ids before first save. */
export function legacyInternalWorkflowStepId(
  label: string,
  index: number,
): string {
  const slug = slugifyLabel(label);
  return slug ? `iwf_legacy_${slug}` : `iwf_legacy_${index}`;
}

export function defaultInternalWorkflowItems(): InternalWorkflowItem[] {
  return DEFAULT_INTERNAL_WORKFLOW_LABELS.map((label, index) => ({
    id: legacyInternalWorkflowStepId(label, index),
    label,
    done: false,
  }));
}

export function defaultInternalWorkflowTemplateSteps(): InternalWorkflowTemplateStep[] {
  return DEFAULT_INTERNAL_WORKFLOW_LABELS.map((label, index) => ({
    id: legacyInternalWorkflowStepId(label, index),
    label,
  }));
}

export function parseInternalWorkflowItems(
  raw: unknown,
): InternalWorkflowItem[] {
  if (!Array.isArray(raw)) return [];
  const items: InternalWorkflowItem[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < raw.length; index++) {
    const entry = raw[index];
    if (entry == null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) continue;
    let id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim().slice(0, 64)
        : legacyInternalWorkflowStepId(label, index);
    if (seen.has(id)) id = newInternalWorkflowStepId();
    seen.add(id);
    items.push({
      id,
      label,
      done: row.done === true,
      date:
        typeof row.date === "string" && row.date.trim()
          ? row.date.trim()
          : undefined,
    });
  }
  return items;
}

/** Ensure every step has a unique id (call before persisting edits). */
export function ensureInternalWorkflowItemIds(
  items: readonly InternalWorkflowItem[],
): InternalWorkflowItem[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    let id = item.id?.trim() || legacyInternalWorkflowStepId(item.label, index);
    if (seen.has(id)) id = newInternalWorkflowStepId();
    seen.add(id);
    return { ...item, id };
  });
}

export function serializeInternalWorkflowItems(
  items: readonly InternalWorkflowItem[],
): Array<{ id: string; label: string; done: boolean; date?: string }> {
  return ensureInternalWorkflowItemIds(items).map((item) => ({
    id: item.id,
    label: item.label,
    done: item.done,
    ...(item.date ? { date: item.date } : {}),
  }));
}

export function workflowItemsFromTemplateSteps(
  steps: readonly InternalWorkflowTemplateStep[],
): InternalWorkflowItem[] {
  const seen = new Set<string>();
  return steps.map((step, index) => {
    const label = step.label.trim() || `Step ${index + 1}`;
    let id = step.id?.trim() || legacyInternalWorkflowStepId(label, index);
    if (seen.has(id)) id = newInternalWorkflowStepId();
    seen.add(id);
    return { id, label, done: false };
  });
}

export function templateStepsFromWorkflowItems(
  items: readonly InternalWorkflowItem[],
): InternalWorkflowTemplateStep[] {
  return ensureInternalWorkflowItemIds(items).map((item) => ({
    id: item.id,
    label: item.label,
  }));
}

export function internalWorkflowProgress(items: InternalWorkflowItem[]): {
  completed: number;
  total: number;
} {
  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  return { completed, total };
}

/** Event shape for future automations (completion of an internal workflow step). */
export type InternalWorkflowStepCompletedEvent = {
  type: "internal_workflow.step.completed";
  stepId: string;
  pipelineFileId?: string;
  workflowTemplateId?: string;
  completedAt: number;
  label: string;
};
